"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Icon, ease } from "./ui";

const words = ["Every", "wei", "counted", "once."];

export function HeroCopy({ demoShop }: { demoShop?: string }) {
  return (
    <div>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="pill bg-white/10 text-lime-300">
        <span className="h-1.5 w-1.5 rounded-full bg-lime-300" /> Built on Till · written in Fe
      </motion.p>
      <h1 className="mt-5 text-[2.9rem] font-black leading-[0.98] tracking-[-0.035em] sm:text-7xl">
        {words.map((w, i) => (
          <motion.span
            key={w}
            className={`mr-[0.22em] inline-block ${i >= 2 ? "text-gradient animate-shimmer" : ""}`}
            initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease, delay: 0.08 + i * 0.09 }}
          >
            {w}
            {i === 1 && <br />}
          </motion.span>
        ))}
      </h1>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.45 }} className="mt-5 max-w-lg text-lg leading-relaxed text-paper/70">
        Sell tickets and merch with one link. Buyers pay for the whole cart in one tap, one transaction, one exact payment, and the contract holds their money until the door scans their pass.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.55 }} className="mt-7 flex flex-wrap gap-3">
        <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
          <Link href="/new" className="btn-primary text-base" data-testid="cta-sell">Sell tickets <Icon name="arrow" className="h-4 w-4" /></Link>
        </motion.span>
        {demoShop && (
          <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link href={`/s/${demoShop}`} className="btn border border-white/15 bg-white/[.06] text-base text-paper hover:bg-white/10" data-testid="cta-demo">Browse the demo shop</Link>
          </motion.span>
        )}
        <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
          <Link href="/lab" className="btn text-base text-paper/80 hover:text-paper">Security lab</Link>
        </motion.span>
      </motion.div>
    </div>
  );
}
