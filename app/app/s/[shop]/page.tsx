"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { type Address, type Hex, isAddress } from "viem";
import { useShop } from "@/components/useShop";
import { useWallet } from "@/components/Wallet";
import { Money } from "@/components/Prefs";
import { KIND, call, shopAbi } from "@/lib/contracts";
import { eth, parseEthInput, when } from "@/lib/format";
import { load, save } from "@/lib/storage";

type Cart = Record<string, number>;
const TIPS = ["0", "0.0005", "0.001", "0.002"];

export default function Storefront({ params }: { params: Promise<{ shop: string }> }) {
  const { shop } = use(params);
  const s = useShop(shop);
  const w = useWallet();
  const [cart, setCart] = useState<Cart>({});
  const [tip, setTip] = useState("0");
  const [gift, setGift] = useState("");
  const [review, setReview] = useState(false);
  const [done, setDone] = useState<Hex | null>(null);

  useEffect(() => setCart(load(`till.cart.${shop}`, {})), [shop]);
  useEffect(() => save(`till.cart.${shop}`, cart), [shop, cart]);

  const tipWei = parseEthInput(tip) ?? 0n;
  const giftTo = gift.trim();
  const giftValid = giftTo === "" || isAddress(giftTo);
  const lines = useMemo(
    () =>
      s.items
        .filter((it) => (cart[it.id.toString()] ?? 0) > 0)
        .map((it) => ({ item: it, qty: BigInt(cart[it.id.toString()]!), subtotal: it.price * BigInt(cart[it.id.toString()]!) })),
    [s.items, cart],
  );
  const total = lines.reduce((a, l) => a + l.subtotal, 0n) + tipWei;
  const count = lines.reduce((a, l) => a + Number(l.qty), 0);

  const setQty = (id: bigint, q: number) => setCart((c) => ({ ...c, [id.toString()]: Math.max(0, q) }));

  const pay = async () => {
    const entries: Hex[] = lines.map((l) => (giftTo ? call.buyFor(l.item.id, l.qty, giftTo as Address) : call.buy(l.item.id, l.qty)));
    if (tipWei > 0n) entries.push(call.tip(tipWei));
    const hash = await w.write(`Pay ${eth(total)} ETH`, { address: shop as Address, abi: shopAbi, functionName: "multicall", args: [entries], value: total });
    if (hash) {
      setDone(hash);
      setCart({});
      setReview(false);
      void s.reload();
    }
  };

  if (s.loading) return <p className="py-10 text-center text-ink/60">Loading shop…</p>;
  if (s.error) return <p className="card text-alarm-600" role="alert">{s.error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink/50">Shop</p>
        <h1 className="text-3xl font-black tracking-tight" data-testid="shop-title">{s.name}</h1>
        {w.address && s.owner?.toLowerCase() === w.address.toLowerCase() && (
          <Link href={`/s/${shop}/admin`} className="text-sm font-semibold text-till-700 underline">Manage this shop</Link>
        )}
      </div>

      {done && (
        <div className="card border-till-500 bg-till-50" data-testid="checkout-done">
          <p className="font-bold">Paid. Your passes are in your wallet.</p>
          <Link href="/passes" className="btn-primary mt-3">Open my passes</Link>
        </div>
      )}

      {s.items.filter((it) => it.status <= 2).length === 0 && <p className="card text-ink/60">Nothing for sale right now.</p>}
      <ul className="space-y-3">
        {s.items.filter((it) => it.status <= 2).map((it) => {
          const q = cart[it.id.toString()] ?? 0;
          const left = it.supply - it.sold;
          const active = it.status === 1;
          return (
            <li key={it.id.toString()} className="card flex items-center gap-4" data-testid={`item-${it.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{it.label || `Item ${it.id}`}</p>
                <p className="text-sm text-ink/60">
                  {KIND[it.kind]} · {active ? `${left} left` : it.status === 2 ? "Paused" : it.status === 3 ? "Cancelled" : "Closed"}
                  {it.maxPerWallet > 0n && ` · max ${it.maxPerWallet} each`}
                </p>
                <p className="text-xs text-ink/50">Escrow until {when(it.releaseAt)}</p>
                <Money wei={it.price} className="mt-1 block" strong />
              </div>
              <div className="flex items-center gap-2" aria-label={`Quantity of ${it.label}`}>
                <button className="btn-ghost h-11 w-11 !px-0 text-xl" aria-label="Fewer" disabled={!active || q === 0} onClick={() => setQty(it.id, q - 1)}>−</button>
                <span className="w-6 text-center text-lg font-bold" data-testid={`qty-${it.id}`}>{q}</span>
                <button
                  className="btn-ghost h-11 w-11 !px-0 text-xl"
                  aria-label="More"
                  data-testid={`add-${it.id}`}
                  disabled={!active || BigInt(q) >= left || (it.maxPerWallet > 0n && BigInt(q) >= it.maxPerWallet)}
                  onClick={() => setQty(it.id, q + 1)}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {s.items.some((it) => it.status > 2) && (
        <p className="text-sm text-ink/50">
          {s.items.filter((it) => it.status > 2).length} closed item(s) hidden. Holders of cancelled items can refund from{" "}
          <Link href="/passes" className="underline">My passes</Link>.
        </p>
      )}

      {count > 0 && (
        <div className="card space-y-4">
          <div>
            <p className="label">Tip the organiser</p>
            <div className="flex flex-wrap gap-2">
              {TIPS.map((t) => (
                <button key={t} data-testid={`tip-${t}`} className={`btn-ghost !min-h-[40px] ${tip === t ? "!border-till-600 !bg-till-50" : ""}`} onClick={() => setTip(t)}>
                  {t === "0" ? "No tip" : `${t} ETH`}
                </button>
              ))}
              <input aria-label="Custom tip in ETH" className="input !w-32" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="gift">Gift to (optional address)</label>
            <input id="gift" data-testid="gift" className="input font-mono text-sm" placeholder="0x… leave empty to keep the passes" value={gift} onChange={(e) => setGift(e.target.value)} />
            {!giftValid && <p className="mt-1 text-xs text-alarm-600">Not an address</p>}
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-ink/60">{count} item{count === 1 ? "" : "s"}{tipWei > 0n ? " + tip" : ""} · exact total</p>
              <Money wei={total} className="text-xl" strong />
            </div>
            <button data-testid="review" className="btn-primary text-lg" disabled={!giftValid} onClick={() => setReview(true)}>Review</button>
          </div>
        </div>
      )}

      {review && (
        <div role="dialog" aria-modal="true" aria-labelledby="review-title" className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center" onClick={() => setReview(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="review-title" className="text-xl font-black">Your receipt</h2>
            <ul className="mt-4 space-y-2 border-b border-dashed border-ink/20 pb-3 font-mono text-sm" data-testid="receipt">
              {lines.map((l) => (
                <li key={l.item.id.toString()} className="flex justify-between gap-2">
                  <span>{l.qty.toString()} × {l.item.label} @ {eth(l.item.price)}</span>
                  <span>{eth(l.subtotal)}</span>
                </li>
              ))}
              {tipWei > 0n && (
                <li className="flex justify-between"><span>Tip</span><span>{eth(tipWei)}</span></li>
              )}
              {giftTo && <li className="text-xs text-ink/60">Passes go to {giftTo}</li>}
            </ul>
            <p className="mt-3 flex items-baseline justify-between">
              <span className="font-semibold">You pay exactly, once</span>
              <span className="text-2xl font-black" data-testid="receipt-total">{eth(total)} ETH</span>
            </p>
            <p className="mt-2 text-xs text-ink/60">One transaction. The contract rejects any other amount, so there is no change and nothing to get stuck. Prices are read from the chain.</p>
            <button data-testid="pay" className="btn-primary mt-4 w-full text-lg" onClick={() => void pay()}>Pay {eth(total)} ETH</button>
            <button className="btn-ghost mt-2 w-full" onClick={() => setReview(false)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
