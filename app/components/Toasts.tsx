"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { txUrl } from "@/lib/config";

export type Toast = {
  id: number;
  kind: "pending" | "success" | "error" | "info";
  title: string;
  detail?: string;
  hash?: string;
  action?: { label: string; run: () => void };
};

type Ctx = { push: (t: Omit<Toast, "id">) => number; update: (id: number, t: Partial<Toast>) => void; dismiss: (id: number) => void };
const ToastCtx = createContext<Ctx | null>(null);

export function useToasts(): Ctx {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("ToastProvider missing");
  return c;
}

let next = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = next++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      if (t.kind === "success" || t.kind === "info") setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss],
  );
  const update = useCallback(
    (id: number, t: Partial<Toast>) => {
      setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, ...t } : x)));
      if (t.kind === "success") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => {
          const url = t.hash ? txUrl(t.hash) : null;
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              data-testid={`toast-${t.kind}`}
              className={`pointer-events-auto w-full max-w-sm rounded-2xl border p-4 shadow-receipt ${
                t.kind === "error" ? "border-alarm-500/40 bg-white" : t.kind === "success" ? "border-till-500/40 bg-white" : "border-ink/10 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 text-lg">
                  {t.kind === "pending" ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-till-600 border-t-transparent motion-reduce:animate-none" /> : t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{t.title}</p>
                  {t.detail && <p className="mt-0.5 text-sm text-ink/70">{t.detail}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {t.hash && (url ? <a className="font-medium text-till-700 underline" href={url} target="_blank" rel="noreferrer">View transaction</a> : <span className="font-mono text-xs text-ink/50">{t.hash.slice(0, 18)}…</span>)}
                    {t.action && (
                      <button className="font-semibold text-till-700 underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                        {t.action.label}
                      </button>
                    )}
                  </div>
                </div>
                <button aria-label="Dismiss" className="text-ink/40 hover:text-ink" onClick={() => dismiss(t.id)}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
