"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { txUrl } from "@/lib/config";
import { spring } from "./ui";

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

const tone = {
  pending: "border-ink/10",
  success: "border-till-400/50",
  error: "border-alarm-400/60",
  info: "border-ink/10",
} as const;

function Glyph({ kind }: { kind: Toast["kind"] }) {
  if (kind === "pending") return <span className="mt-0.5 inline-block h-5 w-5 animate-spin rounded-full border-[2.5px] border-till-500 border-t-transparent motion-reduce:animate-none" />;
  const bg = kind === "success" ? "bg-till-500" : kind === "error" ? "bg-alarm-500" : "bg-ink";
  return <span className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-black text-white ${bg}`}>{kind === "success" ? "✓" : kind === "error" ? "!" : "i"}</span>;
}

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
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const url = t.hash ? txUrl(t.hash) : null;
            return (
              <motion.div
                key={t.id}
                layout
                role={t.kind === "error" ? "alert" : "status"}
                data-testid={`toast-${t.kind}`}
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }}
                transition={spring}
                className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border bg-white/95 p-4 shadow-lift backdrop-blur ${tone[t.kind]}`}
              >
                <div className="flex items-start gap-3">
                  <Glyph kind={t.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{t.title}</p>
                    {t.detail && <p className="mt-0.5 text-sm text-ink/65">{t.detail}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                      {t.hash &&
                        (url ? (
                          <a className="font-semibold text-till-700 underline decoration-till-300 underline-offset-2" href={url} target="_blank" rel="noreferrer">View transaction</a>
                        ) : (
                          <span className="num text-xs text-ink/45">{t.hash.slice(0, 18)}…</span>
                        ))}
                      {t.action && (
                        <button className="font-semibold text-till-700 underline decoration-till-300 underline-offset-2" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                          {t.action.label}
                        </button>
                      )}
                    </div>
                  </div>
                  <button aria-label="Dismiss" className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-ink/40 transition hover:bg-ink/5 hover:text-ink" onClick={() => dismiss(t.id)}>×</button>
                </div>
                {t.kind === "pending" && <div className="absolute inset-x-0 bottom-0 h-0.5 animate-shimmer bg-[linear-gradient(90deg,transparent,#14b16b,transparent)] bg-[length:200%_100%]" />}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
