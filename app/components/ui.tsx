"use client";
// Shared animated building blocks.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react";

export const spring = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } as const;
export const ease = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts children in when they scroll into view. */
export function Reveal({ children, delay = 0, className = "", y = 18 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div ref={ref} className={className} initial={{ opacity: 0, y }} animate={seen ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease, delay }}>
      {children}
    </motion.div>
  );
}

/** A page section that animates in on mount. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
      {children}
    </motion.div>
  );
}

/** Counts up to `value` when visible. Display-only (never asserted by tests). */
export function Ticker({ value, decimals = 0, prefix = "", suffix = "", className = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) return setShown(value);
    const c = animate(from.current, value, { duration: 1.1, ease, onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [seen, value, reduce]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Text that slides when it changes (quantities, totals). */
export function Flip({ children, k, className = "" }: { children: ReactNode; k: string | number; className?: string }) {
  return (
    <span className={`relative inline-flex overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={k} initial={{ y: "70%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-70%", opacity: 0 }} transition={{ duration: 0.22, ease }}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A burst of particles for success moments. */
export function Burst({ fire }: { fire: number }) {
  const reduce = useReducedMotion();
  if (!fire || reduce) return null;
  const colors = ["#14b16b", "#bfeb3b", "#f2c14e", "#5cc8ff", "#34cc84"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2;
        const d = 70 + (i % 5) * 22;
        return (
          <motion.span
            key={`${fire}-${i}`}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-[2px]"
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d - 20, opacity: 0, rotate: 220, scale: 0.6 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </div>
  );
}

/** Animated check / cross marks. */
export function Mark({ ok, size = 64 }: { ok: boolean; size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 64 64" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} aria-hidden>
      <circle cx="32" cy="32" r="30" fill={ok ? "#14b16b" : "#ef4b3c"} opacity=".14" />
      <motion.circle cx="32" cy="32" r="30" fill="none" stroke={ok ? "#14b16b" : "#ef4b3c"} strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease }} />
      {ok ? (
        <motion.path d="M19 33 L28 42 L46 23" fill="none" stroke="#0a7448" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.4, ease }} />
      ) : (
        <motion.path d="M22 22 L42 42 M42 22 L22 42" fill="none" stroke="#d0372a" strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.4, ease }} />
      )}
    </motion.svg>
  );
}

const paths: Record<string, string> = {
  ticket: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Zm11-2v12",
  shirt: "M8 3 4 6 2 10l4 2v9h12v-9l4-2-2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z",
  star: "m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3Z",
  wallet: "M3 7a2 2 0 0 1 2-2h12v4M3 7v11a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2Zm13 7h.01",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5",
  qr: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z",
  coins: "M8 7c0 1.7 2.7 3 6 3s6-1.3 6-3-2.7-3-6-3-6 1.3-6 3Zm0 0v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M4 11c0 1.7 2.7 3 6 3m-6-3v4c0 1.7 2.7 3 6 3s6-1.3 6-3",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Z",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name] ?? paths.star} />
    </svg>
  );
}

/** Pressable wrapper giving buttons and links a tactile scale. */
export function Press({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.span className={`inline-flex ${className}`} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={spring}>
      {children}
    </motion.span>
  );
}
