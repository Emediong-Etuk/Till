"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { type Address, type Hex, getAbiItem, isAddress } from "viem";
import { AnimatePresence, motion } from "motion/react";
import { useWallet } from "@/components/Wallet";
import { ItemArt } from "@/components/ItemArt";
import { Icon, Page, ease, spring } from "@/components/ui";
import { Qr } from "@/components/Qr";
import { Money } from "@/components/Prefs";
import { CHAIN, DEPLOYMENT } from "@/lib/config";
import { factoryAbi, readItems, readPass, readShopMeta, shopAbi, type Item } from "@/lib/contracts";
import { getLogsChunked } from "@/lib/logs";
import { checkInTypedData, encodeCheckIn } from "@/lib/checkin";
import { publicClient } from "@/lib/client";
import { load, save } from "@/lib/storage";
import { when } from "@/lib/format";

type Held = { shop: Address; shopName: string; id: bigint; item: Item; paid: bigint; redeemed: boolean };
const QR_TTL = 30n * 60n;

function useHoldings(owner?: Address) {
  const [held, setHeld] = useState<Held[] | null>(null);
  const reload = useCallback(async () => {
    if (!owner || !DEPLOYMENT.factory) return;
    const opened = await getLogsChunked({ address: DEPLOYMENT.factory, event: getAbiItem({ abi: factoryAbi, name: "ShopOpened" }) as never });
    const shops = [...new Set(opened.map((l) => (l as unknown as { args: { shop: Address } }).args.shop))];
    if (shops.length === 0) return setHeld([]);
    const transfers = await getLogsChunked({ address: shops, event: getAbiItem({ abi: shopAbi, name: "Transfer" }) as never, args: { to: owner } });
    const seen = new Map<string, { shop: Address; id: bigint }>();
    for (const l of transfers) {
      const a = (l as unknown as { args: { tokenId: bigint } }).args;
      seen.set(`${l.address}-${a.tokenId}`, { shop: l.address as Address, id: a.tokenId });
    }
    const out: Held[] = [];
    const meta = new Map<string, { name: string; items: Item[] }>();
    for (const { shop, id } of seen.values()) {
      const p = await readPass(shop, id);
      if (p.owner.toLowerCase() !== owner.toLowerCase()) continue; // verify current owner
      if (!meta.has(shop)) meta.set(shop, { name: (await readShopMeta(shop)).name, items: await readItems(shop) });
      const m = meta.get(shop)!;
      out.push({ shop, shopName: m.name, id, item: m.items[Number(p.item)]!, paid: p.paid, redeemed: p.redeemed });
    }
    out.sort((a, b) => (a.shop === b.shop ? Number(a.id - b.id) : a.shop.localeCompare(b.shop)));
    setHeld(out);
  }, [owner]);
  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);
  return { held, reload };
}

function PassQr({ p }: { p: Held }) {
  const w = useWallet();
  const [code, setCode] = useState<string | null>(null);
  const [until, setUntil] = useState<bigint>(0n);
  const key = `till.qr.${p.shop}.${p.id}.${w.address}`;
  const sign = useCallback(async () => {
    const cached = load<{ code: string; deadline: string } | null>(key, null);
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (cached && BigInt(cached.deadline) > now + 120n) {
      setCode(cached.code);
      setUntil(BigInt(cached.deadline));
      return;
    }
    const deadline = now + QR_TTL;
    const sig: Hex = await w.signTypedData(checkInTypedData(CHAIN.id, p.shop, p.id, deadline) as never);
    const c = encodeCheckIn({ chainId: CHAIN.id, shop: p.shop, pass: p.id.toString(), deadline: deadline.toString(), sig });
    save(key, { code: c, deadline: deadline.toString() });
    setCode(c);
    setUntil(deadline);
  }, [key, p.id, p.shop, w]);
  useEffect(() => {
    void sign();
    const t = setInterval(() => void sign(), 60_000);
    return () => clearInterval(t);
  }, [sign]);
  if (!code)
    return (
      <div className="grid place-items-center py-8 text-sm text-ink/55">
        <span className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-till-500 border-t-transparent motion-reduce:animate-none" />
        Signing your pass…
      </div>
    );
  return (
    <motion.div className="flex flex-col items-center gap-3" initial={{ opacity: 0, rotateX: -60, y: 10 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ duration: 0.55, ease }} style={{ transformPerspective: 800 }}>
      <div className="rounded-3xl bg-white p-3 shadow-lift ring-1 ring-ink/5">
        <Qr text={code} size={248} label={`Check-in code for pass ${p.id}`} />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink/55"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-till-500 motion-reduce:animate-none" /> Valid until {when(until)} · works offline once shown</p>
      <details className="w-full text-xs">
        <summary className="cursor-pointer text-ink/55">Can&apos;t scan? Copy the code</summary>
        <textarea readOnly data-testid="checkin-code" className="input num mt-2 h-24 text-[11px]" value={code} />
      </details>
    </motion.div>
  );
}

export default function Passes() {
  const w = useWallet();
  const { held, reload } = useHoldings(w.address);
  const [open, setOpen] = useState<string | null>(null);
  const [to, setTo] = useState("");

  const refund = async (p: Held) => {
    const h = await w.write(`Refund pass #${p.id}`, { address: p.shop, abi: shopAbi, functionName: "refund", args: [p.id] });
    if (h) void reload();
  };
  const transfer = async (p: Held) => {
    if (!isAddress(to) || !w.address) return;
    const h = await w.write(`Send pass #${p.id}`, { address: p.shop, abi: shopAbi, functionName: "transferFrom", args: [w.address, to, p.id] });
    if (h) {
      setTo("");
      setOpen(null);
      void reload();
    }
  };

  return (
    <Page className="space-y-6">
      <div>
        <p className="kicker">Wallet</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">My passes</h1>
      </div>
      {held === null && (
        <div className="space-y-3" aria-busy>
          {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-[1.4rem] bg-ink/5" />)}
          <p className="text-sm text-ink/55">Looking for your passes…</p>
        </div>
      )}
      {held?.length === 0 && (
        <div className="card flex flex-col items-center gap-3 py-10 text-center text-ink/65">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-paper-2 text-ink/40"><Icon name="ticket" className="h-7 w-7" /></span>
          <p>No passes yet.</p>
          {DEPLOYMENT.demoShop && <Link className="btn-primary" href={`/s/${DEPLOYMENT.demoShop}`}>Browse the demo shop</Link>}
        </div>
      )}
      <ul className="space-y-4">
        {held?.map((p, idx) => {
          const k = `${p.shop}-${p.id}`;
          const refundable = p.item.status === 3 && !p.redeemed;
          const expanded = open === k;
          return (
            <motion.li
              key={k}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: idx * 0.05 }}
              className={`relative overflow-hidden rounded-[1.4rem] border bg-white shadow-card ${p.redeemed ? "border-ink/[.06] opacity-80" : "border-ink/[.06]"}`}
              data-testid={`pass-${p.id}`}
            >
              <AnimatePresence>
                {refundable && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" role="alert" data-testid={`refund-banner-${p.id}`}>
                    <div className="flex flex-wrap items-center gap-3 bg-alarm-500/[.08] p-4 text-sm">
                      <div className="flex-1">
                        <p className="font-bold text-alarm-600">The seller cancelled this item.</p>
                        <p className="text-ink/70">You can get back exactly what you paid.</p>
                      </div>
                      <motion.button whileTap={{ scale: 0.96 }} data-testid={`refund-${p.id}`} className="btn-primary" onClick={() => void refund(p)}>Refund 100%</motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button className="flex w-full items-center gap-4 p-4 text-left sm:p-5" onClick={() => setOpen(expanded ? null : k)} aria-expanded={expanded}>
                <ItemArt kind={p.item.kind} size="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[.12em] text-ink/45">{p.shopName} · #{p.id.toString()}</p>
                  <p className="truncate text-lg font-bold">{p.item.label}</p>
                  <Money wei={p.paid} className="text-sm text-ink/55" />
                </div>
                <span className={`pill ${p.redeemed ? "bg-ink/[.07] text-ink/60" : refundable ? "bg-alarm-500/10 text-alarm-600" : "bg-till-100 text-till-800"}`}>{p.redeemed ? "Used" : refundable ? "Refundable" : "Valid"}</span>
                <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={spring} className="text-ink/30"><Icon name="arrow" className="h-4 w-4" /></motion.span>
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div key="detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease }} className="overflow-hidden">
                    <div className="relative mx-4 border-t-2 border-dashed border-ink/10 pb-5 pt-5 sm:mx-5">
                      <span aria-hidden className="absolute -left-7 -top-3 h-6 w-6 rounded-full bg-paper sm:-left-8" />
                      <span aria-hidden className="absolute -right-7 -top-3 h-6 w-6 rounded-full bg-paper sm:-right-8" />
                      <div className="space-y-5">
                        {!p.redeemed && p.item.status !== 3 && <PassQr p={p} />}
                        {p.redeemed && <p className="text-center text-sm text-ink/60">Checked in. Enjoy!</p>}
                        <div className="flex gap-2">
                          <input aria-label="Send to address" className="input num text-sm" placeholder="Send to 0x…" value={to} onChange={(e) => setTo(e.target.value)} />
                          <button className="btn-ghost" disabled={!isAddress(to)} onClick={() => void transfer(p)}>Send</button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
    </Page>
  );
}
