"use client";
// Interactive explainer: the same 5-entry batch, paid once, against
// std multicall (counts the payment per entry) and Till (one budget).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Icon, ease, spring } from "./ui";

type Mode = "naive" | "till";
type Row = "idle" | "ok" | "fail" | "rolled";
const N = 5;

export function BatchSimulator() {
  const [mode, setMode] = useState<Mode>("naive");
  const [rows, setRows] = useState<Row[]>(Array(N).fill("idle"));
  const [counted, setCounted] = useState(0);
  const [budget, setBudget] = useState(1);
  const [verdict, setVerdict] = useState<null | "drained" | "reverted">(null);
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRows(Array(N).fill("idle"));
    setCounted(0);
    setBudget(1);
    setVerdict(null);
    setRunning(false);
  };
  useEffect(() => reset, []);
  useEffect(reset, [mode]);

  const at = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));

  const run = () => {
    reset();
    setRunning(true);
    const step = 520;
    if (mode === "naive") {
      for (let i = 0; i < N; i++) {
        at(300 + i * step, () => {
          setRows((r) => r.map((x, j) => (j === i ? "ok" : x)));
          setCounted(i + 1);
        });
      }
      at(300 + N * step, () => {
        setVerdict("drained");
        setRunning(false);
      });
    } else {
      at(300, () => {
        setRows((r) => r.map((x, j) => (j === 0 ? "ok" : x)));
        setCounted(1);
        setBudget(0);
      });
      at(300 + step, () => setRows((r) => r.map((x, j) => (j === 1 ? "fail" : x))));
      at(300 + step * 2.2, () => {
        setRows((r) => r.map((x) => (x === "fail" ? "fail" : "rolled")));
        setCounted(0);
        setBudget(1);
        setVerdict("reverted");
        setRunning(false);
      });
    }
  };

  return (
    <div className="relative rounded-[1.6rem] border border-white/10 bg-white/[.04] p-4 backdrop-blur sm:p-5" data-testid="simulator">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-paper/50">Try it</p>
        <LayoutGroup>
          <div className="flex rounded-full bg-white/[.06] p-1 text-xs font-semibold" role="tablist" aria-label="Batch handler">
            {(["naive", "till"] as Mode[]).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className="relative whitespace-nowrap rounded-full px-3 py-1.5 text-paper/70 aria-selected:text-ink">
                {mode === m && <motion.span layoutId="sim-pill" className="absolute inset-0 rounded-full bg-lime-300" transition={spring} />}
                <span className="relative">{m === "naive" ? "std multicall" : "Till"}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-3">
        <motion.div
          className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brass-300 to-brass-500 text-ink shadow-[0_10px_30px_-10px_rgba(242,193,78,.8)]"
          animate={running ? { rotate: [0, -6, 6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Icon name="coins" className="h-7 w-7" />
        </motion.div>
        <div>
          <p className="text-sm text-paper/60">msg.value, paid once</p>
          <p className="num text-xl font-bold text-paper">0.001 ETH</p>
        </div>
      </div>

      {mode === "till" && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-paper/50"><span>Till budget</span><span className="num">{budget.toFixed(3)} ETH left</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-till-400 to-lime-300" animate={{ width: `${budget * 100}%` }} transition={{ duration: 0.45, ease }} />
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-1.5">
        {rows.map((r, i) => (
          <motion.li
            key={i}
            layout
            className={`flex items-center justify-between rounded-xl border px-3 py-2 font-mono text-[13px] transition-colors ${
              r === "ok" ? "border-till-400/40 bg-till-400/10 text-paper" : r === "fail" ? "border-alarm-400/50 bg-alarm-500/15 text-paper" : r === "rolled" ? "border-white/5 bg-white/[.02] text-paper/30 line-through" : "border-white/10 bg-white/[.03] text-paper/60"
            }`}
          >
            <span>entry {i + 1} · buy(0, 1)</span>
            <AnimatePresence mode="wait">
              <motion.span key={r} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-xs font-semibold">
                {r === "ok" ? (mode === "naive" ? "✓ counted 0.001" : "✓ drew 0.001") : r === "fail" ? "✕ Overspend" : r === "rolled" ? "rolled back" : "…"}
              </motion.span>
            </AnimatePresence>
          </motion.li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm text-paper/60">
          Passes delivered: <span className="num font-bold text-paper">{counted}</span>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={run} disabled={running} className="btn !min-h-[40px] !rounded-xl bg-lime-300 !px-4 text-sm text-ink hover:bg-lime-400" data-testid="simulate">
          {running ? "Running…" : verdict ? "Run again" : "Run the batch"}
        </motion.button>
      </div>

      <AnimatePresence>
        {verdict && (
          <motion.p
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease }}
            className={`mt-3 overflow-hidden rounded-xl px-3 py-2 text-sm font-semibold ${verdict === "drained" ? "bg-alarm-500/15 text-alarm-400" : "bg-till-400/15 text-till-300"}`}
          >
            {verdict === "drained" ? "Paid once, delivered five times: 0.004 ETH taken from other buyers." : "Reverted with Overspend. Nothing charged, nothing minted."}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
