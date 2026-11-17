"use client";
import { use, useCallback, useState } from "react";
import Link from "next/link";
import { type Address, type Hex } from "viem";
import { Scanner } from "@/components/Scanner";
import { useShop } from "@/components/useShop";
import { useWallet } from "@/components/Wallet";
import { CHAIN } from "@/lib/config";
import { readPass, shopAbi } from "@/lib/contracts";
import { decodeCheckIn, recoverCheckIn, type CheckInPayload } from "@/lib/checkin";
import { publicClient } from "@/lib/client";
import { short } from "@/lib/format";

type Verdict =
  | { ok: true; payload: CheckInPayload; holder: Address; label: string; contractHolder: boolean }
  | { ok: false; kind: "used" | "wrong-shop" | "expired" | "not-holder" | "invalid" | "cancelled"; message: string };

export default function Door({ params }: { params: Promise<{ shop: string }> }) {
  const { shop } = use(params);
  const s = useShop(shop);
  const w = useWallet();
  const [paste, setPaste] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [admitted, setAdmitted] = useState<number>(0);

  const check = useCallback(
    async (text: string) => {
      let p: CheckInPayload;
      try {
        p = decodeCheckIn(text);
      } catch (e) {
        return setVerdict({ ok: false, kind: "invalid", message: e instanceof Error ? e.message : "Unreadable code" });
      }
      if (p.shop.toLowerCase() !== shop.toLowerCase() || p.chainId !== CHAIN.id) {
        return setVerdict({ ok: false, kind: "wrong-shop", message: "This pass is for a different shop or network." });
      }
      const block = await publicClient.getBlock();
      if (BigInt(p.deadline) < block.timestamp) return setVerdict({ ok: false, kind: "expired", message: "This code has expired. Ask the holder to refresh their pass." });
      const pass = await readPass(shop as Address, BigInt(p.pass)).catch(() => null);
      if (!pass || pass.owner === "0x0000000000000000000000000000000000000000") return setVerdict({ ok: false, kind: "invalid", message: "No such pass." });
      if (pass.redeemed) return setVerdict({ ok: false, kind: "used", message: `Pass #${p.pass} was already used.` });
      const item = s.items[Number(pass.item)];
      if (item?.status === 3) return setVerdict({ ok: false, kind: "cancelled", message: "This item was cancelled; the holder can refund." });
      let signer: Address | null = null;
      try {
        signer = await recoverCheckIn(p.chainId, p.shop, BigInt(p.pass), BigInt(p.deadline), p.sig);
      } catch {}
      const code = await publicClient.getCode({ address: pass.owner });
      const contractHolder = !!code && code !== "0x";
      if (!contractHolder && signer?.toLowerCase() !== pass.owner.toLowerCase()) {
        return setVerdict({ ok: false, kind: "not-holder", message: "This code wasn't signed by the pass's current holder." });
      }
      setVerdict({ ok: true, payload: p, holder: pass.owner, label: item?.label ?? `item ${pass.item}`, contractHolder });
    },
    [shop, s.items],
  );

  const redeem = async () => {
    if (!verdict?.ok) return;
    const p = verdict.payload;
    const h = await w.write(`Check in pass #${p.pass}`, { address: shop as Address, abi: shopAbi, functionName: "redeem", args: [BigInt(p.pass), BigInt(p.deadline), p.sig as Hex] });
    if (h) {
      setAdmitted((n) => n + 1);
      setVerdict({ ok: false, kind: "used", message: `Pass #${p.pass} checked in. Welcome!` });
      setPaste("");
      void s.reload();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink/50">Door · {s.name}</p>
          <h1 className="text-3xl font-black tracking-tight">Check-in</h1>
        </div>
        <Link href={`/s/${shop}/admin`} className="btn-ghost">Dashboard</Link>
      </div>
      <Scanner onCode={(t) => void check(t)} />
      <div className="card space-y-2">
        <label htmlFor="paste" className="label">Or paste a pass code</label>
        <textarea id="paste" data-testid="paste-code" className="input h-24 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button data-testid="check-code" className="btn-ghost w-full" disabled={!paste.trim()} onClick={() => void check(paste)}>Check code</button>
      </div>
      {verdict && (
        <div
          data-testid="verdict"
          role="status"
          className={`card text-center ${verdict.ok ? "border-till-500 bg-till-50" : verdict.message.includes("Welcome") ? "border-till-500" : "border-alarm-500 bg-alarm-500/5"}`}
        >
          {verdict.ok ? (
            <>
              <p className="text-5xl" aria-hidden>✓</p>
              <p className="mt-2 text-xl font-black" data-testid="verdict-ok">Valid: {verdict.label}</p>
              <p className="text-sm text-ink/60">Pass #{verdict.payload.pass} · holder {short(verdict.holder)}{verdict.contractHolder ? " (smart wallet, verified on-chain)" : ""}</p>
              <button data-testid="redeem" className="btn-primary mt-4 w-full text-lg" onClick={() => void redeem()}>Admit & redeem</button>
            </>
          ) : (
            <>
              <p className="text-5xl" aria-hidden>{verdict.message.includes("Welcome") ? "✓" : "✕"}</p>
              <p className="mt-2 text-lg font-bold" data-testid="verdict-message">{verdict.message}</p>
            </>
          )}
        </div>
      )}
      {admitted > 0 && <p className="text-center text-sm text-ink/60">{admitted} admitted this session</p>}
    </div>
  );
}
