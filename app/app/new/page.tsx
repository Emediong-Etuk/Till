"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "viem";
import { AnimatePresence, motion } from "motion/react";
import { useWallet } from "@/components/Wallet";
import { Icon, Page, ease, spring } from "@/components/ui";
import { DEPLOYMENT } from "@/lib/config";
import { byteLength, factoryAbi, label } from "@/lib/contracts";
import { publicClient } from "@/lib/client";
import { short } from "@/lib/format";

function symbolFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const s = (words.length > 1 ? words.map((w) => w[0]).join("") : name.slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.slice(0, 6) || "TILL";
}

export default function NewShop() {
  const w = useWallet();
  const router = useRouter();
  const [name, setName] = useState("Uyo Dev Meetup — Dec");
  const [predicted, setPredicted] = useState<Address>();
  const [busy, setBusy] = useState(false);
  const bytes = byteLength(name);
  const symbol = useMemo(() => symbolFor(name), [name]);
  const valid = name.trim().length > 0 && bytes <= 31;

  useEffect(() => {
    if (!DEPLOYMENT.factory || !w.address || !valid) return;
    let live = true;
    (async () => {
      const count = (await publicClient.readContract({ address: DEPLOYMENT.factory!, abi: factoryAbi, functionName: "count" })) as bigint;
      const p = (await publicClient.readContract({
        address: DEPLOYMENT.factory!,
        abi: factoryAbi,
        functionName: "predict",
        args: [w.address, label(name.trim()), label(symbol), count],
      })) as Address;
      if (live) setPredicted(p);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [w.address, name, symbol, valid]);

  const create = async () => {
    if (!DEPLOYMENT.factory || !w.address) return;
    setBusy(true);
    const count = (await publicClient.readContract({ address: DEPLOYMENT.factory, abi: factoryAbi, functionName: "count" })) as bigint;
    const hash = await w.write("Create shop", { address: DEPLOYMENT.factory, abi: factoryAbi, functionName: "open", args: [label(name.trim()), label(symbol)] });
    setBusy(false);
    if (!hash) return;
    const shop = (await publicClient.readContract({ address: DEPLOYMENT.factory, abi: factoryAbi, functionName: "shopAt", args: [count] })) as Address;
    router.push(`/s/${shop}/admin?setup=1`);
  };

  return (
    <Page className="mx-auto max-w-2xl space-y-6">
      <div className="pt-4">
        <p className="kicker">For sellers</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">Open your shop</h1>
        <p className="mt-2 text-ink/60">One transaction now, one more to list every ticket tier and T-shirt.</p>
      </div>
      <div className="card space-y-5 !p-6">
        <div>
          <label htmlFor="shop-name" className="label">Shop or event name</label>
          <input id="shop-name" data-testid="shop-name" className="input !min-h-[56px] text-xl font-semibold" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[.06]">
              <motion.div className={`h-full rounded-full ${bytes > 31 ? "bg-alarm-500" : "bg-gradient-to-r from-till-400 to-lime-400"}`} animate={{ width: `${Math.min(100, (bytes / 31) * 100)}%` }} transition={{ duration: 0.3, ease }} />
            </div>
            <p className={`num text-xs ${bytes > 31 ? "text-alarm-600" : "text-ink/50"}`}>{bytes}/31 bytes · ticker {symbol}</p>
          </div>
        </div>
        <AnimatePresence>
          {predicted && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="flex items-center gap-3 rounded-2xl bg-paper-2 p-3 text-sm text-ink/70" data-testid="predicted">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-till-700 shadow-sm"><Icon name="spark" className="h-5 w-5" /></span>
              <span>Your shop will live at <span className="num font-semibold text-ink">{short(predicted)}</span> (known before you confirm).</span>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button whileTap={{ scale: 0.98 }} data-testid="create-shop" className="btn-primary w-full !min-h-[56px] text-lg" disabled={!valid || busy || !DEPLOYMENT.factory} onClick={() => void create()}>
          {busy ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" /> Creating…</> : <>Create shop <Icon name="arrow" className="h-5 w-5" /></>}
        </motion.button>
        <p className="text-center text-xs text-ink/50">You can add all your items in the next step with one more transaction.</p>
      </div>
    </Page>
  );
}
