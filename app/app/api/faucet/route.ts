// POST /api/faucet { address, chainId } -> { hash }
// A fixed drip of test ETH, only on the configured test chain, only to
// addresses that are nearly empty, with per-address cooldowns, per-IP limits
// and a global daily cap. The key lives in an env var and is never logged.
import { NextResponse } from "next/server";
import { z } from "zod";
import { type Hex, createWalletClient, formatEther, getAddress, http, parseEther, fallback } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, NETWORK, RPC_URLS } from "@/lib/config";
import { publicClient } from "@/lib/client";
import { ANVIL_FAUCET_KEY } from "@/lib/local-keys";
import { store } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid address"),
  chainId: z.number().int(),
});

const DRIP = parseEther(process.env.FAUCET_DRIP_ETH ?? "0.02");
const MAX_BALANCE = parseEther(process.env.FAUCET_MAX_BALANCE_ETH ?? "0.01");
const DAILY_CAP = parseEther(process.env.FAUCET_DAILY_CAP_ETH ?? (NETWORK === "local" ? "1000" : "1"));
const COOLDOWN = Number(process.env.FAUCET_COOLDOWN_SEC ?? (NETWORK === "local" ? 0 : 86_400));
const IP_PER_HOUR = Number(process.env.FAUCET_IP_PER_HOUR ?? (NETWORK === "local" ? 1000 : 5));

function faucetKey(): Hex | null {
  // Tolerate copy-paste noise from hosting dashboards: whitespace, quotes,
  // and a missing 0x prefix.
  const raw = (process.env.FAUCET_PRIVATE_KEY ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const k = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (/^0x[0-9a-fA-F]{64}$/.test(k)) return k;
  if (raw) console.error("[faucet] FAUCET_PRIVATE_KEY is set but is not a 32-byte hex key");
  return NETWORK === "local" ? ANVIL_FAUCET_KEY : null;
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "bad request");
  if (parsed.data.chainId !== CHAIN.id) return fail(400, `This faucet only serves ${CHAIN.name} (chain ${CHAIN.id})`);
  const key = faucetKey();
  if (!key) return fail(503, "Faucet not configured");
  const address = getAddress(parsed.data.address);
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const s = store();
  const day = new Date().toISOString().slice(0, 10);

  try {
    const balance = await publicClient.getBalance({ address });
    if (balance >= MAX_BALANCE) return fail(429, `You already have ${formatEther(balance)} test ETH`);
    if (COOLDOWN > 0 && (await s.get(`faucet:addr:${address}`))) return fail(429, "This address was funded recently; try again tomorrow");
    if ((await s.incrBy(`faucet:ip:${ip}`, 1, 3600)) > IP_PER_HOUR) return fail(429, "Too many requests from your network; try again later");
    const spent = BigInt((await s.get(`faucet:day:${day}`)) ?? "0");
    if (spent + DRIP > DAILY_CAP) return fail(429, "The faucet's daily budget is used up");

    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ account, chain: CHAIN, transport: fallback(RPC_URLS.map((u) => http(u))) });
    const hash = await wallet.sendTransaction({ to: address, value: DRIP });
    if (COOLDOWN > 0) await s.set(`faucet:addr:${address}`, hash, COOLDOWN);
    await s.set(`faucet:day:${day}`, (spent + DRIP).toString(), 172_800);
    return NextResponse.json({ hash, amount: formatEther(DRIP) });
  } catch (e) {
    console.error("[faucet] send failed:", e instanceof Error ? e.message.split("\n")[0] : "unknown");
    return fail(502, "The faucet couldn't send right now");
  }
}
