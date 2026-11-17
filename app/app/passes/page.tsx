"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { type Address, type Hex, getAbiItem, isAddress } from "viem";
import { useWallet } from "@/components/Wallet";
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
  if (!code) return <p className="text-sm text-ink/60">Signing your pass…</p>;
  return (
    <div className="flex flex-col items-center gap-2">
      <Qr text={code} size={260} label={`Check-in code for pass ${p.id}`} />
      <p className="text-xs text-ink/60">Valid until {when(until)} · works offline once shown</p>
      <details className="w-full text-xs">
        <summary className="cursor-pointer text-ink/60">Can&apos;t scan? Copy the code</summary>
        <textarea readOnly data-testid="checkin-code" className="input mt-2 h-24 font-mono text-[11px]" value={code} />
      </details>
    </div>
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
    <div className="space-y-5">
      <h1 className="text-3xl font-black tracking-tight">My passes</h1>
      {held === null && <p className="text-ink/60">Looking for your passes…</p>}
      {held?.length === 0 && (
        <p className="card text-ink/70">
          No passes yet. {DEPLOYMENT.demoShop && <Link className="font-semibold text-till-700 underline" href={`/s/${DEPLOYMENT.demoShop}`}>Browse the demo shop</Link>}
        </p>
      )}
      <ul className="space-y-3">
        {held?.map((p) => {
          const k = `${p.shop}-${p.id}`;
          const refundable = p.item.status === 3 && !p.redeemed;
          return (
            <li key={k} className="card" data-testid={`pass-${p.id}`}>
              {refundable && (
                <div className="mb-3 rounded-xl bg-alarm-500/10 p-3 text-sm" role="alert" data-testid={`refund-banner-${p.id}`}>
                  <p className="font-bold text-alarm-600">The seller cancelled this item.</p>
                  <p>You can get back exactly what you paid.</p>
                  <button data-testid={`refund-${p.id}`} className="btn-primary mt-2" onClick={() => void refund(p)}>Refund 100%</button>
                </div>
              )}
              <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink/50">{p.shopName} · #{p.id.toString()}</p>
                  <p className="text-lg font-bold">{p.item.label}</p>
                  <Money wei={p.paid} className="text-sm text-ink/60" />
                </div>
                <span className={`pill ${p.redeemed ? "bg-ink/10" : "bg-till-100 text-till-800"}`}>{p.redeemed ? "Used" : refundable ? "Refundable" : "Valid"}</span>
              </button>
              {open === k && (
                <div className="mt-4 space-y-4 border-t border-dashed border-ink/20 pt-4">
                  {!p.redeemed && p.item.status !== 3 && <PassQr p={p} />}
                  {p.redeemed && <p className="text-center text-sm text-ink/60">Checked in. Enjoy!</p>}
                  <div className="flex gap-2">
                    <input aria-label="Send to address" className="input font-mono text-sm" placeholder="Send to 0x…" value={to} onChange={(e) => setTo(e.target.value)} />
                    <button className="btn-ghost" disabled={!isAddress(to)} onClick={() => void transfer(p)}>Send</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
