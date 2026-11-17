"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "viem";
import { useWallet } from "@/components/Wallet";
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
    <div className="space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Open your shop</h1>
      <div className="card space-y-4">
        <div>
          <label htmlFor="shop-name" className="label">Shop or event name</label>
          <input id="shop-name" data-testid="shop-name" className="input text-lg" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <p className={`mt-1 text-xs ${bytes > 31 ? "text-alarm-600" : "text-ink/50"}`}>{bytes}/31 bytes · ticker {symbol}</p>
        </div>
        {predicted && (
          <p className="text-sm text-ink/70" data-testid="predicted">
            Your shop will live at <span className="font-mono">{short(predicted)}</span> (known before you confirm).
          </p>
        )}
        <button data-testid="create-shop" className="btn-primary w-full text-lg" disabled={!valid || busy || !DEPLOYMENT.factory} onClick={() => void create()}>
          {busy ? "Creating…" : "Create shop"}
        </button>
        <p className="text-xs text-ink/50">One transaction. You can add all your items in the next step with one more.</p>
      </div>
    </div>
  );
}
