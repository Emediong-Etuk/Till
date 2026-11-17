// Faucet bookkeeping: Upstash Redis (REST) when configured, otherwise an
// in-memory store that resets on restart.
type Store = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  incrBy(key: string, by: number, ttlSec: number): Promise<number>;
  kind: "upstash" | "memory";
};

function upstash(url: string, token: string): Store {
  const cmd = async (...parts: (string | number)[]) => {
    const r = await fetch(`${url}/${parts.map((p) => encodeURIComponent(String(p))).join("/")}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error("rate-limit store unavailable");
    return ((await r.json()) as { result: unknown }).result;
  };
  return {
    kind: "upstash",
    get: async (k) => ((await cmd("get", k)) as string | null) ?? null,
    set: async (k, v, ttl) => void (await cmd("set", k, v, "EX", ttl)),
    incrBy: async (k, by, ttl) => {
      const n = Number(await cmd("incrby", k, by));
      if (n === by) await cmd("expire", k, ttl);
      return n;
    },
  };
}

const mem = new Map<string, { v: string; exp: number }>();
const memory: Store = {
  kind: "memory",
  get: async (k) => {
    const e = mem.get(k);
    if (!e || e.exp < Date.now()) return null;
    return e.v;
  },
  set: async (k, v, ttl) => void mem.set(k, { v, exp: Date.now() + ttl * 1000 }),
  incrBy: async (k, by, ttl) => {
    const e = mem.get(k);
    const cur = e && e.exp > Date.now() ? Number(e.v) : 0;
    const next = cur + by;
    mem.set(k, { v: String(next), exp: e && e.exp > Date.now() ? e.exp : Date.now() + ttl * 1000 });
    return next;
  },
};

let warned = false;
export function store(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstash(url, token);
  if (!warned) {
    console.warn("[faucet] UPSTASH_* not set: using in-memory rate limits (reset on restart)");
    warned = true;
  }
  return memory;
}
