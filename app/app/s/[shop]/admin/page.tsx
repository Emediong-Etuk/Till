"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Address, getAbiItem, parseEther } from "viem";
import { useShop } from "@/components/useShop";
import { useWallet } from "@/components/Wallet";
import { Money } from "@/components/Prefs";
import { Qr, posterPng } from "@/components/Qr";
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
  const s = useShop(shop);
  const w = useWallet();
  const setup = useSearchParams().get("setup") === "1";
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS);
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

  if (s.loading) return <p className="py-10 text-center text-ink/60">Loading…</p>;
  if (s.error) return <p className="card text-alarm-600" role="alert">{s.error}</p>;
  const excess = s.books ? s.books.balance - s.books.total_escrow - s.books.seller_available : 0n;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink/50">Seller dashboard</p>
          <h1 className="text-3xl font-black tracking-tight" data-testid="admin-title">{s.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/s/${shop}`} className="btn-ghost">Storefront</Link>
          <Link href={`/s/${shop}/door`} className="btn-primary" data-testid="open-door">Door check-in</Link>
        </div>
      </div>
      {!isOwner && (
        <p className="card border-brass-500 text-sm" role="note">
          You are not this shop&apos;s seller ({s.owner && short(s.owner)}). Buttons below will be refused by the contract.
        </p>
      )}

      {s.books && (
        <section className="card" aria-labelledby="money">
          <h2 id="money" className="font-bold">Money</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-ink/60">In escrow</dt><dd data-testid="escrow"><Money wei={s.books.total_escrow} strong /></dd></div>
            <div><dt className="text-ink/60">Withdrawable</dt><dd data-testid="available"><Money wei={s.books.seller_available} strong /></dd></div>
            <div><dt className="text-ink/60">Tips (all time)</dt><dd><Money wei={s.books.tips_total} /></dd></div>
            <div><dt className="text-ink/60">Contract balance</dt><dd><Money wei={s.books.balance} /></dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button data-testid="withdraw" className="btn-primary" disabled={s.books.seller_available === 0n} onClick={() => void act(`Withdraw ${eth(s.books!.seller_available)} ETH`, "withdraw", [w.address])}>
              Withdraw {eth(s.books.seller_available)} ETH
            </button>
            {excess > 0n && <button className="btn-ghost" onClick={() => void act("Sweep forced ETH", "sweep", [w.address])}>Sweep {eth(excess)} ETH of forced ETH</button>}
          </div>
          <p className="mt-2 text-xs text-ink/50">Escrow moves to withdrawable when a pass is checked in, or when you release an item after its release time.</p>
        </section>
      )}

      {(setup || s.items.length === 0 || rows.length > 0) && (
        <section className="card space-y-3" aria-labelledby="add">
          <h2 id="add" className="font-bold">Add items <span className="font-normal text-ink/60">— all in one transaction</span></h2>
          {rows.map((r, i) => (
            <fieldset key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink/10 p-3 sm:grid-cols-6" data-testid={`row-${i}`}>
              <legend className="sr-only">Item {i + 1}</legend>
              <input aria-label="Name" className="input col-span-2 sm:col-span-2" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <select aria-label="Kind" className="input" value={r.kind} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: Number(e.target.value) } : x)))}>
                <option value={0}>Ticket</option><option value={1}>Merch</option><option value={2}>Other</option>
              </select>
              <input aria-label="Price in ETH" inputMode="decimal" className="input" value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
              <input aria-label="Supply" inputMode="numeric" className="input" value={r.supply} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, supply: e.target.value } : x)))} />
              <input aria-label="Max per wallet (0 = none)" inputMode="numeric" className="input" value={r.cap} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, cap: e.target.value } : x)))} />
              <div className="col-span-2 flex items-center gap-2 text-xs text-ink/60 sm:col-span-6">
                <span>Release escrow after</span>
                <input aria-label="Release after days" inputMode="numeric" className="input !w-20" value={r.days} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} />
                <span>days</span>
                {rowErrors[i] && <span className="text-alarm-600">check {rowErrors[i]}</span>}
                <button className="ml-auto text-alarm-600 underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setRows([...rows, { name: "", kind: 0, price: "0.001", supply: "50", cap: "0", days: "7" }])}>Add a row</button>
            <button data-testid="add-items" className="btn-primary" disabled={!canAdd} onClick={() => void addAll()}>
              Add {rows.length} item{rows.length === 1 ? "" : "s"} (1 transaction)
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="items">
        <div className="flex items-center justify-between">
          <h2 id="items" className="font-bold">Items</h2>
          {rows.length === 0 && s.items.length > 0 && <button className="btn-ghost !min-h-[36px] text-sm" onClick={() => setRows([{ name: "", kind: 0, price: "0.001", supply: "50", cap: "0", days: "7" }])}>New item</button>}
        </div>
        {s.items.map((it) => {
          const releasable = (it.status === 1 || it.status === 2) && s.now >= it.releaseAt;
          return (
            <div key={it.id.toString()} className="card" data-testid={`admin-item-${it.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{it.label}</p>
                  <p className="text-sm text-ink/60">{KIND[it.kind]} · {eth(it.price)} ETH · {it.sold.toString()}/{it.supply.toString()} sold · escrow {eth(it.escrow)} ETH</p>
                  <p className="text-xs text-ink/50">Release after {when(it.releaseAt)}</p>
                </div>
                <span className={`pill ${it.status === 1 ? "bg-till-100 text-till-800" : it.status === 3 ? "bg-alarm-500/10 text-alarm-600" : "bg-ink/10"}`} data-testid={`status-${it.id}`}>{STATUS[it.status]}</span>
              </div>
              {(it.status === 1 || it.status === 2) && (
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
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
                    Cancel & refund
                  </button>
                </div>
              )}
              {edit?.id === it.id && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <input aria-label="New price in ETH" className="input" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  <input aria-label="New supply" className="input" value={edit.supply} onChange={(e) => setEdit({ ...edit, supply: e.target.value })} />
                  <input aria-label="New max per wallet" className="input" value={edit.cap} onChange={(e) => setEdit({ ...edit, cap: e.target.value })} />
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
              )}
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="share">
        <h2 id="share" className="font-bold">Share</h2>
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
          {url && <Qr text={url} size={180} label="QR code to the storefront" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="break-all font-mono text-sm" data-testid="share-link">{url}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => void navigator.clipboard?.writeText(url)}>Copy link</button>
              <button className="btn-ghost" data-testid="poster" onClick={() => void download()}>Download poster (PNG)</button>
            </div>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="sales">
        <h2 id="sales" className="font-bold">Sales</h2>
        {sales.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No sales yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink/10 text-sm" data-testid="sales">
            {sales.slice(0, 30).map((x, i) => (
              <li key={i} className="flex justify-between gap-2 py-2">
                <span>{x.qty.toString()} × {s.items[Number(x.item)]?.label ?? `item ${x.item}`} → {short(x.to)}</span>
                <span className="font-mono">{eth(x.paid)} ETH</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
