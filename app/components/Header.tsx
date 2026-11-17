"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Hex } from "viem";
import { useWallet, NETWORK_LABEL } from "./Wallet";
import { usePrefs } from "./Prefs";
import { useToasts } from "./Toasts";
import { Icon, spring } from "./ui";
import { eth, short } from "@/lib/format";

export function Header() {
  const w = useWallet();
  const { showNgn, setShowNgn } = usePrefs();
  const toasts = useToasts();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [path]);

  const backup = async () => {
    if (!w.burnerKey) return;
    try {
      await navigator.clipboard.writeText(w.burnerKey);
      toasts.push({ kind: "success", title: "Key copied", detail: "Keep it somewhere private. Anyone with it controls this test wallet." });
    } catch {
      toasts.push({ kind: "info", title: "Copy blocked; use Download instead" });
    }
  };
  const download = () => {
    if (!w.burnerKey || !w.address) return;
    const blob = new Blob([`Till test wallet (testnet only)\naddress: ${w.address}\nprivate key: ${w.burnerKey}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `till-wallet-${w.address.slice(2, 8)}.txt`;
    a.click();
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-ink px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-paper/80" role="note">
        <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400 align-middle motion-reduce:animate-none" />
        {NETWORK_LABEL} only — test ETH, no real money
      </div>
      <div className={`transition-all duration-300 ${scrolled ? "bg-paper/75 shadow-[0_1px_0_rgba(11,18,16,.06)] backdrop-blur-xl" : "bg-transparent"}`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5 text-lg font-black tracking-tight text-ink">
            <motion.span whileHover={{ rotate: -8, scale: 1.06 }} transition={spring} aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-till-400 to-till-700 text-white shadow-glow">
              <span className="text-[17px] font-black">T</span>
            </motion.span>
            Till
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/lab" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink/65 transition hover:bg-ink/5 hover:text-ink md:inline-flex">Security lab</Link>
            <Link href="/passes" className="btn-ghost hidden !min-h-[40px] !rounded-xl !px-3.5 !py-1.5 text-sm sm:inline-flex">My passes</Link>
            <motion.button
              data-testid="wallet-button"
              whileTap={{ scale: 0.97 }}
              className="btn-ghost !min-h-[40px] !rounded-xl !px-3 !py-1.5 text-sm"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {w.address ? (
                <>
                  <span aria-hidden className="h-2 w-2 rounded-full bg-till-500 shadow-[0_0_0_3px_rgba(20,177,107,.18)]" />
                  <span className="num">{short(w.address)}</span>
                  <span data-testid="wallet-balance" className="num text-ink/55">{eth(w.balance, 4)} ETH</span>
                </>
              ) : (
                "Wallet"
              )}
            </motion.button>
          </nav>
        </div>
      </div>
      <AnimatePresence>
        {open && w.address && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } }}
            transition={spring}
            className="mx-auto max-w-5xl px-4 pb-4 sm:px-6"
          >
            <div className="card space-y-4 !shadow-lift" data-testid="wallet-menu">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-till-50 text-till-700"><Icon name="wallet" className="h-6 w-6" /></span>
                <div className="min-w-0">
                  <p className="kicker">{w.mode === "burner" ? "Test wallet on this device" : "Your wallet"}</p>
                  <p data-testid="wallet-address" className="num break-all text-sm">{w.address}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <motion.button whileTap={{ scale: 0.97 }} data-testid="faucet-button" className="btn-primary" onClick={() => void w.faucet()}>
                  <Icon name="bolt" className="h-4 w-4" /> Get test ETH
                </motion.button>
                <Link href="/passes" className="btn-ghost" onClick={() => setOpen(false)}>My passes</Link>
                {w.mode === "burner" && (
                  <>
                    <button className="btn-ghost" onClick={() => void backup()}>Copy key</button>
                    <button className="btn-ghost" onClick={download}>Download key</button>
                  </>
                )}
              </div>
              <label className="flex items-center gap-2.5 text-sm text-ink/75">
                <input type="checkbox" checked={showNgn} onChange={(e) => setShowNgn(e.target.checked)} className="h-5 w-5 accent-till-600" />
                Show ≈ ₦ estimates (fixed rate, not live)
              </label>
              <div className="border-t border-ink/[.06] pt-3">
                <p className="mb-2 text-sm font-semibold">Use my own wallet</p>
                {w.injected.length === 0 && <p className="text-sm text-ink/55">No browser wallet found. The test wallet works without one.</p>}
                <div className="flex flex-wrap gap-2">
                  {w.injected.map((i) => (
                    <button key={i.info.uuid} className="btn-ghost" onClick={() => void w.useInjected(i).catch((e) => toasts.push({ kind: "error", title: String(e?.message ?? e) }))}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.info.icon} alt="" className="h-5 w-5" />
                      {i.info.name}
                    </button>
                  ))}
                  {w.mode === "injected" && <button className="btn-ghost" onClick={w.useBurner}>Back to test wallet</button>}
                </div>
              </div>
              {w.mode === "burner" && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink/55">Restore a backed-up key</summary>
                  <div className="mt-2 flex gap-2">
                    <input className="input num" placeholder="0x…" value={importing} onChange={(e) => setImporting(e.target.value)} aria-label="Private key to restore" />
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        if (/^0x[0-9a-fA-F]{64}$/.test(importing.trim())) {
                          w.importBurner(importing.trim() as Hex);
                          setImporting("");
                          toasts.push({ kind: "success", title: "Wallet restored" });
                        } else toasts.push({ kind: "error", title: "That isn't a private key" });
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </details>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
