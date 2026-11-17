"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Address, getAbiItem, parseEther } from "viem";
import { useShop } from "@/components/useShop";
import { useWallet } from "@/components/Wallet";
import { Money } from "@/components/Prefs";
import { AnimatePresence, motion } from "motion/react";
import { Qr, posterPng } from "@/components/Qr";
import { ItemArt } from "@/components/ItemArt";
import { Icon, Page, ease, spring } from "@/components/ui";
import { KIND, STATUS, byteLength, call, shopAbi } from "@/lib/contracts";
import { eth, parseEthInput, short, when } from "@/lib/format";
import { getLogsChunked } from "@/lib/logs";

type Row = { name: string; kind: number; price: string; supply: string; cap: string; days: string };
const DEFAULT_ROWS: Row[] = [
  { name: "General admission", kind: 0, price: "0.001", supply: "120", cap: "4", days: "7" },
  { name: "VIP + dinner", kind: 0, price: "0.003", supply: "20", cap: "2", days: "7" },
  { name: "Meetup T-shirt", kind: 1, price: "0.0015", supply: "60", cap: "0", days: "7" },
];

type Sale = { buyer: Address; to: Address; item: bigint; qty: bigint; paid: bigint; hash: string };

export default function Admin({ params }: { params: Promise<{ shop: string }> }) {
  const { shop } = use(params);
  const setup = useSearchParams().get("setup") === "1";
  const s = useShop(shop);
  const w = useWallet();
  const [rows, setRows] = useState<Row[]>(setup ? DEFAULT_ROWS : []);
  // A shop with no items yet starts from the suggested rows, setup link or not.
  useEffect(() => {
    if (!s.loading && !s.error && s.items.length === 0) setRows((r) => (r.length === 0 ? DEFAULT_ROWS : r));
  }, [s.loading, s.error, s.items.length]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [url, setUrl] = useState("");
  const [edit, setEdit] = useState<{ id: bigint; price: string; supply: string; cap: string } | null>(null);
  const isOwner = !!w.address && s.owner?.toLowerCase() === w.address.toLowerCase();
  const addr = shop as Address;

  useEffect(() => setUrl(`${window.location.origin}/s/${shop}`), [shop]);
  useEffect(() => {
    if (s.loading || s.error) return;
    (async () => {
      const logs = await getLogsChunked({ address: addr, event: getAbiItem({ abi: shopAbi, name: "Purchased" }) as never });
      setSales(
        logs
          .map((l) => {
            const a = (l as unknown as { args: Sale }).args;
            return { buyer: a.buyer, to: a.to, item: a.item, qty: a.qty, paid: a.paid, hash: l.transactionHash! };
          })
          .reverse(),
      );
    })().catch(() => {});
  }, [addr, s.loading, s.error, s.items.length, s.books?.total_escrow]);

  const rowErrors = rows.map((r) => {
    if (!r.name.trim()) return "name";
    if (byteLength(r.name) > 31) return "name too long";
    if (parseEthInput(r.price) === null) return "price";
    if (!/^\d+$/.test(r.supply) || r.supply === "0") return "supply";
    if (!/^\d+$/.test(r.cap)) return "cap";
    if (!/^\d+$/.test(r.days)) return "days";
    return null;
  });
  const canAdd = rows.length > 0 && rowErrors.every((e) => e === null);

  const addAll = async () => {
    const now = s.now || BigInt(Math.floor(Date.now() / 1000));
    const entries = rows.map((r) => call.addItem(parseEther(r.price), BigInt(r.supply), BigInt(r.cap), now + BigInt(r.days) * 86400n, r.kind, r.name.trim()));
    const h = await w.write(`Add ${rows.length} item${rows.length === 1 ? "" : "s"}`, { address: addr, abi: shopAbi, functionName: "multicall", args: [entries] });
    if (h) {
      setRows([]);
      void s.reload();
    }
  };

  const act = async (label: string, functionName: string, args: unknown[]) => {
    const h = await w.write(label, { address: addr, abi: shopAbi, functionName, args });
    if (h) void s.reload();
  };

  const download = async () => {
    const a = document.createElement("a");
    a.href = await posterPng(s.name ?? "Till shop", url);
    a.download = `${(s.name ?? "shop").replace(/\W+/g, "-").toLowerCase()}-poster.png`;
    a.click();
  };

  if (s.loading)
    return (
      <div className="space-y-3 pt-4" aria-busy>
        <div className="h-28 animate-pulse rounded-[1.6rem] bg-ink/5" />
        <div className="h-40 animate-pulse rounded-[1.4rem] bg-ink/5" />
      </div>
    );
  if (s.error) return <p className="card text-alarm-600" role="alert">{s.error}</p>;
  const excess = s.books ? s.books.balance - s.books.total_escrow - s.books.seller_available : 0n;
  const statusTone: Record<number, string> = { 1: "bg-till-100 text-till-800", 2: "bg-brass-300/40 text-brass-600", 3: "bg-alarm-500/10 text-alarm-600", 4: "bg-ink/[.07] text-ink/70" };

  return (
    <Page className="space-y-6">
      <section className="grain relative overflow-hidden rounded-[1.8rem] bg-ink p-6 text-paper sm:p-8">
        <div aria-hidden className="absolute -right-16 -top-20 h-64 w-64 animate-drift rounded-full bg-till-500/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-lime-300">Seller dashboard</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl" data-testid="admin-title">{s.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/s/${shop}`} className="btn border border-white/15 bg-white/[.06] text-paper hover:bg-white/10">Storefront</Link>
            <Link href={`/s/${shop}/door`} className="btn bg-lime-300 text-ink hover:bg-lime-400" data-testid="open-door"><Icon name="door" className="h-4 w-4" /> Door check-in</Link>
          </div>
        </div>
      </section>
      {!isOwner && (
        <p className="card border-brass-400 text-sm" role="note">
          You are not this shop&apos;s seller ({s.owner && short(s.owner)}). Buttons below will be refused by the contract.
        </p>
      )}

      {s.books && (
        <section aria-labelledby="money" className="space-y-3">
          <h2 id="money" className="sr-only">Money</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "In escrow", wei: s.books.total_escrow, id: "escrow", icon: "lock", hi: false },
              { label: "Withdrawable", wei: s.books.seller_available, id: "available", icon: "coins", hi: true },
              { label: "Tips (all time)", wei: s.books.tips_total, id: undefined, icon: "star", hi: false },
              { label: "Contract balance", wei: s.books.balance, id: undefined, icon: "wallet", hi: false },
            ].map((t, i) => (
              <motion.div key={t.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.4, ease }} className={`card !p-4 ${t.hi ? "bg-gradient-to-br from-till-50 to-white ring-1 ring-till-300/60" : ""}`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink/50"><Icon name={t.icon} className="h-3.5 w-3.5" /> {t.label}</p>
                <div className="mt-1.5 text-xl" data-testid={t.id}><Money wei={t.wei} strong /></div>
              </motion.div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button whileTap={{ scale: 0.97 }} data-testid="withdraw" className="btn-primary" disabled={s.books.seller_available === 0n} onClick={() => void act(`Withdraw ${eth(s.books!.seller_available)} ETH`, "withdraw", [w.address])}>
              Withdraw {eth(s.books.seller_available)} ETH
            </motion.button>
            {excess > 0n && <button className="btn-ghost" onClick={() => void act("Sweep forced ETH", "sweep", [w.address])}>Sweep {eth(excess)} ETH of forced ETH</button>}
            <p className="text-xs text-ink/50">Escrow becomes withdrawable when a pass is checked in, or when you release an item after its release time.</p>
          </div>
        </section>
      )}

      <AnimatePresence initial={false}>
        {(setup || s.items.length === 0 || rows.length > 0) && (
          <motion.section key="add" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }} className="overflow-hidden" aria-labelledby="add">
            <div className="card space-y-3">
              <h2 id="add" className="text-lg font-bold">Add items <span className="font-normal text-ink/50">— all in one transaction</span></h2>
              <AnimatePresence initial={false}>
                {rows.map((r, i) => (
                  <motion.fieldset key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring} className="grid grid-cols-2 gap-2 rounded-2xl border border-ink/[.07] bg-paper/60 p-3 sm:grid-cols-6" data-testid={`row-${i}`}>
                    <legend className="sr-only">Item {i + 1}</legend>
                    <input aria-label="Name" className="input col-span-2 sm:col-span-2" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <select aria-label="Kind" className="input" value={r.kind} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: Number(e.target.value) } : x)))}>
                      <option value={0}>Ticket</option><option value={1}>Merch</option><option value={2}>Other</option>
                    </select>
                    <input aria-label="Price in ETH" inputMode="decimal" className="input num" value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                    <input aria-label="Supply" inputMode="numeric" className="input num" value={r.supply} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, supply: e.target.value } : x)))} />
                    <input aria-label="Max per wallet (0 = none)" inputMode="numeric" className="input num" value={r.cap} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, cap: e.target.value } : x)))} />
                    <div className="col-span-2 flex items-center gap-2 text-xs text-ink/55 sm:col-span-6">
                      <span>Release escrow after</span>
                      <input aria-label="Release after days" inputMode="numeric" className="input num !min-h-[36px] !w-20" value={r.days} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} />
                      <span>days</span>
                      {rowErrors[i] && <span className="text-alarm-600">check {rowErrors[i]}</span>}
                      <button className="ml-auto font-semibold text-alarm-600 hover:underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                  </motion.fieldset>
                ))}
              </AnimatePresence>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => setRows([...rows, { name: "", kind: 0, price: "0.001", supply: "50", cap: "0", days: "7" }])}>+ Add a row</button>
                <motion.button whileTap={{ scale: 0.97 }} data-testid="add-items" className="btn-primary" disabled={!canAdd} onClick={() => void addAll()}>
                  Add {rows.length} item{rows.length === 1 ? "" : "s"} (1 transaction)
                </motion.button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="space-y-3" aria-labelledby="items">
        <div className="flex items-center justify-between">
          <h2 id="items" className="text-lg font-bold">Items</h2>
          {rows.length === 0 && s.items.length > 0 && <button className="btn-ghost !min-h-[36px] text-sm" onClick={() => setRows([{ name: "", kind: 0, price: "0.001", supply: "50", cap: "0", days: "7" }])}>+ New item</button>}
        </div>
        {s.items.map((it, idx) => {
          const releasable = (it.status === 1 || it.status === 2) && s.now >= it.releaseAt;
          const pct = it.supply > 0n ? Number((it.sold * 100n) / it.supply) : 0;
          return (
            <motion.div key={it.id.toString()} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: idx * 0.04 }} className="card" data-testid={`admin-item-${it.id}`}>
              <div className="flex flex-wrap items-start gap-4">
                <ItemArt kind={it.kind} size="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{it.label}</p>
                    <AnimatePresence mode="wait">
                      <motion.span key={it.status} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className={`pill ${statusTone[it.status] ?? "bg-ink/10"}`} data-testid={`status-${it.id}`}>{STATUS[it.status]}</motion.span>
                    </AnimatePresence>
                  </div>
                  <p className="mt-0.5 text-sm text-ink/55">{KIND[it.kind]} · <span className="num">{eth(it.price)} ETH</span> · {it.sold.toString()}/{it.supply.toString()} sold · escrow <span className="num">{eth(it.escrow)} ETH</span></p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[.06]" aria-hidden>
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-till-400 to-lime-400" initial={{ width: 0 }} animate={{ width: `${Math.max(2, pct)}%` }} transition={{ duration: 0.8, ease }} />
                  </div>
                  <p className="mt-1 text-xs text-ink/45">Release after {when(it.releaseAt)}</p>
                </div>
              </div>
              {(it.status === 1 || it.status === 2) && (
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  {it.status === 1 ? (
                    <button className="btn-ghost !min-h-[36px]" onClick={() => void act("Pause sales", "pause", [it.id])}>Pause</button>
                  ) : (
                    <button className="btn-ghost !min-h-[36px]" onClick={() => void act("Resume sales", "resume", [it.id])}>Resume</button>
                  )}
                  <button className="btn-ghost !min-h-[36px]" onClick={() => setEdit({ id: it.id, price: eth(it.price, 18), supply: it.supply.toString(), cap: it.maxPerWallet.toString() })}>Edit</button>
                  <button className="btn-ghost !min-h-[36px]" onClick={() => void act("Extend release by a day", "extendRelease", [it.id, it.releaseAt + 86400n])}>+1 day</button>
                  {releasable && <button className="btn-primary !min-h-[36px]" onClick={() => void act("Release escrow", "release", [it.id])}>Release {eth(it.escrow)} ETH</button>}
                  <button
                    data-testid={`cancel-${it.id}`}
                    className="btn-danger !min-h-[36px]"
                    onClick={() => {
                      if (window.confirm(`Cancel "${it.label}"? Holders of unused passes can then refund 100%. This can't be undone.`)) void act("Cancel item", "cancel", [it.id]);
                    }}
                  >
                    Cancel &amp; refund
                  </button>
                </div>
              )}
              <AnimatePresence>
                {edit?.id === it.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <input aria-label="New price in ETH" className="input num" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                      <input aria-label="New supply" className="input num" value={edit.supply} onChange={(e) => setEdit({ ...edit, supply: e.target.value })} />
                      <input aria-label="New max per wallet" className="input num" value={edit.cap} onChange={(e) => setEdit({ ...edit, cap: e.target.value })} />
                      <button
                        className="btn-primary col-span-2"
                        disabled={parseEthInput(edit.price) === null || !/^\d+$/.test(edit.supply) || !/^\d+$/.test(edit.cap)}
                        onClick={() => void act("Update item", "updateItem", [it.id, parseEthInput(edit.price)!, BigInt(edit.supply), BigInt(edit.cap)]).then(() => setEdit(null))}
                      >
                        Save
                      </button>
                      <button className="btn-ghost" onClick={() => setEdit(null)}>Close</button>
                      <p className="col-span-3 text-xs text-ink/50">Passes already sold keep their price; supply can&apos;t drop below {it.sold.toString()} sold.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card" aria-labelledby="share">
          <h2 id="share" className="text-lg font-bold">Share</h2>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
            {url && <div className="rounded-2xl bg-white p-2 shadow-card ring-1 ring-ink/5"><Qr text={url} size={150} label="QR code to the storefront" /></div>}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="num break-all text-sm" data-testid="share-link">{url}</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => void navigator.clipboard?.writeText(url)}>Copy link</button>
                <button className="btn-ghost" data-testid="poster" onClick={() => void download()}>Download poster (PNG)</button>
              </div>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="sales">
          <h2 id="sales" className="text-lg font-bold">Sales</h2>
          {sales.length === 0 ? (
            <p className="mt-2 text-sm text-ink/55">No sales yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink/[.06] text-sm" data-testid="sales">
              {sales.slice(0, 30).map((x, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="flex justify-between gap-2 py-2">
                  <span>{x.qty.toString()} × {s.items[Number(x.item)]?.label ?? `item ${x.item}`} → <span className="num">{short(x.to)}</span></span>
                  <span className="num">{eth(x.paid)} ETH</span>
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
