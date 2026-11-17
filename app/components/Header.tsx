"use client";
import Link from "next/link";
import { useState } from "react";
import { useWallet, NETWORK_LABEL } from "./Wallet";
import { usePrefs } from "./Prefs";
import { eth, short } from "@/lib/format";
import { useToasts } from "./Toasts";
import type { Hex } from "viem";

export function Header() {
  const w = useWallet();
  const { showNgn, setShowNgn } = usePrefs();
  const toasts = useToasts();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState("");

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
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
      <div className="bg-brass-400 px-4 py-1 text-center text-xs font-semibold text-ink" role="note">
        {NETWORK_LABEL} only — test ETH, no real money
      </div>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight text-ink">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-till-700 text-white">T</span>
          Till
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/passes" className="btn-ghost hidden !min-h-[40px] !px-3 !py-1.5 text-sm sm:inline-flex">My passes</Link>
          <button
            data-testid="wallet-button"
            className="btn-ghost !min-h-[40px] !px-3 !py-1.5 text-sm"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {w.address ? (
              <>
                <span className="font-mono">{short(w.address)}</span>
                <span data-testid="wallet-balance" className="text-ink/60">{eth(w.balance, 4)} ETH</span>
              </>
            ) : (
              "Wallet"
            )}
          </button>
        </nav>
      </div>
      {open && w.address && (
        <div className="mx-auto max-w-3xl px-4 pb-4">
          <div className="card space-y-4" data-testid="wallet-menu">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink/50">{w.mode === "burner" ? "Test wallet on this device" : "Your wallet"}</p>
              <p data-testid="wallet-address" className="break-all font-mono text-sm">{w.address}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button data-testid="faucet-button" className="btn-primary" onClick={() => void w.faucet()}>Get test ETH</button>
              <Link href="/passes" className="btn-ghost" onClick={() => setOpen(false)}>My passes</Link>
              {w.mode === "burner" && (
                <>
                  <button className="btn-ghost" onClick={() => void backup()}>Copy key</button>
                  <button className="btn-ghost" onClick={download}>Download key</button>
                </>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showNgn} onChange={(e) => setShowNgn(e.target.checked)} className="h-5 w-5 accent-till-700" />
              Show ≈ ₦ estimates (fixed rate, not live)
            </label>
            <div className="border-t border-ink/10 pt-3">
              <p className="mb-2 text-sm font-medium">Use my own wallet</p>
              {w.injected.length === 0 && <p className="text-sm text-ink/60">No browser wallet found. The test wallet works without one.</p>}
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
                <summary className="cursor-pointer text-ink/60">Restore a backed-up key</summary>
                <div className="mt-2 flex gap-2">
                  <input className="input font-mono" placeholder="0x…" value={importing} onChange={(e) => setImporting(e.target.value)} aria-label="Private key to restore" />
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
        </div>
      )}
    </header>
  );
}
