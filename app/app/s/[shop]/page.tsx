"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { type Address, type Hex, isAddress } from "viem";
import { useShop } from "@/components/useShop";
import { useWallet } from "@/components/Wallet";
import { Money } from "@/components/Prefs";
import { ItemArt } from "@/components/ItemArt";
import { Burst, Flip, Icon, Mark, Page, ease, spring } from "@/components/ui";
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
  const [burst, setBurst] = useState(0);

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
  const open = s.items.filter((it) => it.status <= 2);
  const closed = s.items.length - open.length;

  const setQty = (id: bigint, q: number) => setCart((c) => ({ ...c, [id.toString()]: Math.max(0, q) }));

  const pay = async () => {
    const entries: Hex[] = lines.map((l) => (giftTo ? call.buyFor(l.item.id, l.qty, giftTo as Address) : call.buy(l.item.id, l.qty)));
    if (tipWei > 0n) entries.push(call.tip(tipWei));
    const hash = await w.write(`Pay ${eth(total)} ETH`, { address: shop as Address, abi: shopAbi, functionName: "multicall", args: [entries], value: total });
    if (hash) {
      setDone(hash);
      setBurst((b) => b + 1);
      setCart({});
      setReview(false);
      void s.reload();
    }
  };

  if (s.loading)
    return (
      <div className="space-y-3 pt-4" aria-busy>
        <div className="h-28 animate-pulse rounded-[1.6rem] bg-ink/5" />
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-[1.4rem] bg-ink/5" />)}
      </div>
    );
  if (s.error) return <p className="card text-alarm-600" role="alert">{s.error}</p>;

  return (
    <Page className="space-y-6">
      <section className="grain relative overflow-hidden rounded-[1.8rem] bg-ink p-6 text-paper sm:p-8">
        <div aria-hidden className="absolute -right-16 -top-20 h-60 w-60 animate-drift rounded-full bg-till-500/35 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-lime-300">Shop</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl" data-testid="shop-title">{s.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-paper/65">
            <span className="pill bg-white/10 text-paper/80"><Icon name="lock" className="h-3.5 w-3.5" /> Payments held in escrow</span>
            <span className="pill bg-white/10 text-paper/80"><Icon name="coins" className="h-3.5 w-3.5" /> One exact payment</span>
          </p>
          {w.address && s.owner?.toLowerCase() === w.address.toLowerCase() && (
            <Link href={`/s/${shop}/admin`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-lime-300 hover:underline">Manage this shop <Icon name="arrow" className="h-4 w-4" /></Link>
          )}
        </div>
      </section>

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={spring} className="card relative flex items-center gap-4 border-till-300 bg-till-50" data-testid="checkout-done">
            <Burst fire={burst} />
            <Mark ok size={52} />
            <div className="flex-1">
              <p className="font-bold">Paid. Your passes are in your wallet.</p>
              <p className="text-sm text-ink/60">One transaction, one exact payment.</p>
            </div>
            <Link href="/passes" className="btn-primary">Open my passes</Link>
          </motion.div>
        )}
      </AnimatePresence>

      {open.length === 0 && <p className="card text-ink/60">Nothing for sale right now.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {open.map((it, idx) => {
          const q = cart[it.id.toString()] ?? 0;
          const left = it.supply - it.sold;
          const active = it.status === 1;
          const pct = it.supply > 0n ? Number((it.sold * 100n) / it.supply) : 0;
          return (
            <motion.li
              key={it.id.toString()}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease, delay: idx * 0.06 }}
              whileHover={{ y: -2 }}
              className={`card flex flex-col gap-4 transition-shadow hover:shadow-lift ${q > 0 ? "ring-2 ring-till-400/50" : ""}`}
              data-testid={`item-${it.id}`}
            >
              <div className="flex items-start gap-4">
                <ItemArt kind={it.kind} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{it.label || `Item ${it.id}`}</p>
                  <p className="mt-0.5 text-sm text-ink/55">
                    {KIND[it.kind]} · {active ? `${left} left` : "Paused"}
                    {it.maxPerWallet > 0n && ` · max ${it.maxPerWallet} each`}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[.06]" aria-hidden>
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-till-400 to-lime-400" initial={{ width: 0 }} animate={{ width: `${Math.max(3, pct)}%` }} transition={{ duration: 0.8, ease, delay: 0.2 + idx * 0.06 }} />
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <Money wei={it.price} className="text-lg" strong />
                  <p className="text-[11px] text-ink/45">Escrow until {when(it.releaseAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl bg-paper-2 p-1" aria-label={`Quantity of ${it.label}`}>
                  <motion.button whileTap={{ scale: 0.9 }} className="grid h-11 w-11 place-items-center rounded-xl bg-white text-xl shadow-sm disabled:opacity-35" aria-label="Fewer" disabled={!active || q === 0} onClick={() => setQty(it.id, q - 1)}>−</motion.button>
                  <span className="num w-7 text-center text-lg font-bold" data-testid={`qty-${it.id}`}><Flip k={q}>{q}</Flip></span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-xl text-white shadow-sm disabled:opacity-35"
                    aria-label="More"
                    data-testid={`add-${it.id}`}
                    disabled={!active || BigInt(q) >= left || (it.maxPerWallet > 0n && BigInt(q) >= it.maxPerWallet)}
                    onClick={() => setQty(it.id, q + 1)}
                  >
                    +
                  </motion.button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {closed > 0 && (
        <p className="text-sm text-ink/50">
          {closed} closed item(s) hidden. Holders of cancelled items can refund from <Link href="/passes" className="underline">My passes</Link>.
        </p>
      )}

      <AnimatePresence>
        {count > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }} className="overflow-hidden">
            <div className="card space-y-5">
              <div>
                <p className="label">Tip the organiser</p>
                <LayoutGroup>
                  <div className="flex flex-wrap gap-2">
                    {TIPS.map((t) => (
                      <button key={t} data-testid={`tip-${t}`} className={`relative min-h-[40px] rounded-xl px-3.5 text-sm font-semibold transition ${tip === t ? "text-white" : "bg-paper-2 text-ink/75 hover:bg-ink/[.07]"}`} onClick={() => setTip(t)}>
                        {tip === t && <motion.span layoutId="tip-pill" className="absolute inset-0 rounded-xl bg-ink" transition={spring} />}
                        <span className="relative">{t === "0" ? "No tip" : `${t} ETH`}</span>
                      </button>
                    ))}
                    <input aria-label="Custom tip in ETH" className="input num !w-28" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} />
                  </div>
                </LayoutGroup>
              </div>
              <div>
                <label className="label" htmlFor="gift">Gift to (optional address)</label>
                <input id="gift" data-testid="gift" className="input num text-sm" placeholder="0x… leave empty to keep the passes" value={gift} onChange={(e) => setGift(e.target.value)} />
                {!giftValid && <p className="mt-1 text-xs text-alarm-600">Not an address</p>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {count > 0 && (
          <motion.div initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} transition={spring} className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-4">
            <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-[1.4rem] border border-white/10 bg-ink/95 p-3 pl-5 text-paper shadow-lift backdrop-blur">
              <div className="flex-1">
                <p className="text-xs text-paper/55">
                  <Flip k={count}>{count}</Flip> item{count === 1 ? "" : "s"}
                  {tipWei > 0n ? " + tip" : ""} · exact total
                </p>
                <p className="num text-xl font-bold"><Flip k={total.toString()}>{eth(total)} ETH</Flip></p>
              </div>
              <motion.button whileTap={{ scale: 0.96 }} data-testid="review" className="btn bg-lime-300 text-base text-ink hover:bg-lime-400" disabled={!giftValid} onClick={() => setReview(true)}>
                Review <Icon name="arrow" className="h-4 w-4" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {review && (
          <motion.div role="dialog" aria-modal="true" aria-labelledby="review-title" className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReview(false)}>
            <motion.div className="w-full max-w-md" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={spring} onClick={(e) => e.stopPropagation()}>
              <div className="rounded-t-[1.8rem] bg-white p-6 pb-4 sm:rounded-t-[1.8rem]">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-lime-300"><Icon name="ticket" className="h-5 w-5" /></span>
                  <div>
                    <h2 id="review-title" className="text-xl font-black">Your receipt</h2>
                    <p className="text-xs text-ink/50">{s.name}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2.5 border-b border-dashed border-ink/20 pb-4 font-mono text-sm" data-testid="receipt">
                  {lines.map((l, i) => (
                    <motion.li key={l.item.id.toString()} className="flex justify-between gap-2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
                      <span>{l.qty.toString()} × {l.item.label} @ {eth(l.item.price)}</span>
                      <span>{eth(l.subtotal)}</span>
                    </motion.li>
                  ))}
                  {tipWei > 0n && (
                    <motion.li className="flex justify-between" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + lines.length * 0.08 }}>
                      <span>Tip</span>
                      <span>{eth(tipWei)}</span>
                    </motion.li>
                  )}
                  {giftTo && <li className="break-all text-xs text-ink/55">Passes go to {giftTo}</li>}
                </ul>
                <p className="mt-4 flex items-baseline justify-between">
                  <span className="font-semibold">You pay exactly, once</span>
                  <span className="num text-2xl font-black" data-testid="receipt-total">{eth(total)} ETH</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink/55">One transaction. The contract rejects any other amount, so there is no change and nothing to get stuck. Prices are read from the chain.</p>
                <motion.button whileTap={{ scale: 0.97 }} data-testid="pay" className="btn-primary mt-5 w-full text-lg" onClick={() => void pay()}>Pay {eth(total)} ETH</motion.button>
                <button className="btn-ghost mt-2 w-full" onClick={() => setReview(false)}>Back</button>
              </div>
              <div className="receipt-edge h-3 rotate-180" aria-hidden />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
