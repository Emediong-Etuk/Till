"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { load, save } from "@/lib/storage";
import { eth, ngn } from "@/lib/format";

type Prefs = { showNgn: boolean; setShowNgn: (v: boolean) => void };
const Ctx = createContext<Prefs>({ showNgn: false, setShowNgn: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [showNgn, set] = useState(false);
  useEffect(() => set(load("till.prefs.ngn", false)), []);
  const setShowNgn = (v: boolean) => {
    set(v);
    save("till.prefs.ngn", v);
  };
  return <Ctx.Provider value={{ showNgn, setShowNgn }}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  return useContext(Ctx);
}

/** An ETH amount, with the ₦ estimate underneath when enabled. */
export function Money({ wei, className = "", strong = false }: { wei: bigint; className?: string; strong?: boolean }) {
  const { showNgn } = usePrefs();
  return (
    <span className={className}>
      <span className={`num ${strong ? "font-bold" : ""}`}>{eth(wei)} ETH</span>
      {showNgn && <span className="block text-xs font-normal text-ink/50" title="Estimate at a fixed rate; not a price feed">{ngn(wei)}</span>}
    </span>
  );
}
