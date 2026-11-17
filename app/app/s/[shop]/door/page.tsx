"use client";
import { use, useCallback, useState } from "react";
import Link from "next/link";
import { type Address, type Hex } from "viem";
import { AnimatePresence, motion } from "motion/react";
import { Scanner } from "@/components/Scanner";
import { Burst, Icon, Mark, Page, spring } from "@/components/ui";
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
  const [burst, setBurst] = useState(0);

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
      setBurst((b) => b + 1);
      setVerdict({ ok: false, kind: "used", message: `Pass #${p.pass} checked in. Welcome!` });
      setPaste("");
      void s.reload();
    }
  };

  const welcome = verdict && !verdict.ok && verdict.message.includes("Welcome");
  return (
    <Page className="space-y-6">
      <section className="grain relative overflow-hidden rounded-[1.8rem] bg-ink p-6 text-paper sm:p-8">
        <div aria-hidden className="absolute -left-10 -top-24 h-60 w-60 animate-drift rounded-full bg-till-500/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-lime-300">Door · {s.name}</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">Check-in</h1>
            <p className="mt-2 max-w-md text-sm text-paper/65">Scan a pass. Its code must be signed by the pass&apos;s current holder; only then does their payment leave escrow.</p>
          </div>
          <Link href={`/s/${shop}/admin`} className="btn border border-white/15 bg-white/[.06] text-paper hover:bg-white/10">Dashboard</Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="card"><Scanner onCode={(t) => void check(t)} /></div>
          <div className="card space-y-3">
            <label htmlFor="paste" className="label">Or paste a pass code</label>
            <textarea id="paste" data-testid="paste-code" className="input num h-24 text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <motion.button whileTap={{ scale: 0.98 }} data-testid="check-code" className="btn-dark w-full" disabled={!paste.trim()} onClick={() => void check(paste)}>
              <Icon name="qr" className="h-4 w-4" /> Check code
            </motion.button>
          </div>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            {verdict ? (
              <motion.div
                key={verdict.ok ? `ok-${verdict.payload.pass}` : verdict.message}
                data-testid="verdict"
                role="status"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={spring}
                className={`relative flex min-h-[280px] flex-col items-center justify-center rounded-[1.6rem] border-2 p-6 text-center shadow-card ${
                  verdict.ok ? "border-till-400 bg-till-50" : welcome ? "border-till-400 bg-white" : "border-alarm-400 bg-alarm-500/[.05]"
                }`}
              >
                {welcome && <Burst fire={burst} />}
                {verdict.ok ? (
                  <>
                    <Mark ok size={72} />
                    <p className="mt-3 text-2xl font-black" data-testid="verdict-ok">Valid: {verdict.label}</p>
                    <p className="mt-1 text-sm text-ink/60">Pass #{verdict.payload.pass} · holder {short(verdict.holder)}{verdict.contractHolder ? " (smart wallet, verified on-chain)" : ""}</p>
                    <motion.button whileTap={{ scale: 0.97 }} data-testid="redeem" className="btn-primary mt-5 w-full text-lg" onClick={() => void redeem()}>Admit &amp; redeem</motion.button>
                  </>
                ) : (
                  <>
                    <Mark ok={!!welcome} size={72} />
                    <p className="mt-3 text-xl font-bold" data-testid="verdict-message">{verdict.message}</p>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[280px] flex-col items-center justify-center rounded-[1.6rem] border-2 border-dashed border-ink/10 p-6 text-center text-ink/45">
                <Icon name="qr" className="h-10 w-10" />
                <p className="mt-3 text-sm">Waiting for a pass…</p>
              </motion.div>
            )}
          </AnimatePresence>
          {admitted > 0 && <p className="mt-3 text-center text-sm text-ink/60">{admitted} admitted this session</p>}
        </div>
      </div>
    </Page>
  );
}
