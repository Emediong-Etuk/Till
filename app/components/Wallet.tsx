"use client";
// One wallet abstraction for a silent burner key (default) and EIP-6963
// injected wallets. Every write is simulated first, errors are decoded into
// plain language, and the faucet is offered when the balance is short.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
  type WalletClient,
  createWalletClient,
  custom,
  fallback,
  http,
  numberToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN, NETWORK, RPC_URLS } from "@/lib/config";
import { publicClient } from "@/lib/client";
import { friendly } from "@/lib/errors";
import { load, remove, save } from "@/lib/storage";
import { useToasts } from "./Toasts";

const BURNER_KEY = "till.burner.v1";
const MODE_KEY = "till.wallet-mode.v1";

type Injected = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider };

export type WriteArgs = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };

type WalletCtx = {
  ready: boolean;
  address?: Address;
  mode: "burner" | "injected";
  balance: bigint;
  injected: Injected[];
  burnerKey?: Hex;
  refreshBalance: () => Promise<bigint>;
  write: (label: string, w: WriteArgs, opts?: { onSuccess?: (hash: Hex) => void; quiet?: boolean }) => Promise<Hex | null>;
  signTypedData: (typed: Parameters<WalletClient["signTypedData"]>[0] extends infer T ? Omit<T & object, "account"> : never) => Promise<Hex>;
  faucet: (opts?: { silent?: boolean }) => Promise<boolean>;
  /** Send without simulating, with a fixed gas limit (the lab's "send it anyway"). */
  sendRaw: (to: Address, data: Hex, value: bigint, gas: bigint) => Promise<{ hash: Hex; status: "success" | "reverted" }>;
  useInjected: (i: Injected) => Promise<void>;
  useBurner: () => void;
  importBurner: (key: Hex) => void;
};

const Ctx = createContext<WalletCtx | null>(null);

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("WalletProvider missing");
  return c;
}

function transport() {
  return fallback(RPC_URLS.map((u) => http(u, { retryCount: 1, timeout: 20_000 })));
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const toasts = useToasts();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"burner" | "injected">("burner");
  const [burnerKey, setBurnerKey] = useState<Hex>();
  const [address, setAddress] = useState<Address>();
  const [balance, setBalance] = useState(0n);
  const [injected, setInjected] = useState<Injected[]>([]);
  const client = useRef<WalletClient | null>(null);
  const provider = useRef<EIP1193Provider | null>(null);

  // Burner: created silently on first visit, kept on this device only.
  useEffect(() => {
    let key = load<Hex | null>(BURNER_KEY, null);
    if (!key) {
      key = generatePrivateKey();
      save(BURNER_KEY, key);
    }
    setBurnerKey(key);
    const account = privateKeyToAccount(key);
    client.current = createWalletClient({ account, chain: CHAIN, transport: transport() });
    setAddress(account.address);
    setMode("burner");
    setReady(true);
    if (load<string>(MODE_KEY, "burner") === "injected") toasts.push({ kind: "info", title: "Using your test wallet", detail: "Pick your wallet again from the menu to reconnect it." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // EIP-6963 discovery.
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Injected>).detail;
      setInjected((xs) => (xs.some((x) => x.info.uuid === d.info.uuid) ? xs : [...xs, d]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) return 0n;
    try {
      const b = await publicClient.getBalance({ address });
      setBalance(b);
      return b;
    } catch {
      return balance;
    }
  }, [address, balance]);

  useEffect(() => {
    if (!address) return;
    void refreshBalance();
    const t = setInterval(() => void refreshBalance(), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const faucet = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!address) return false;
      const id = opts.silent ? 0 : toasts.push({ kind: "pending", title: "Getting test ETH…" });
      try {
        const r = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, chainId: CHAIN.id }) });
        const j = (await r.json()) as { hash?: Hex; error?: string };
        if (!r.ok || !j.hash) throw new Error(j.error ?? "Faucet unavailable");
        await publicClient.waitForTransactionReceipt({ hash: j.hash });
        await refreshBalance();
        if (id) toasts.update(id, { kind: "success", title: "Test ETH received", hash: j.hash });
        return true;
      } catch (e) {
        if (id) toasts.update(id, { kind: "error", title: e instanceof Error ? e.message : "Faucet failed" });
        return false;
      }
    },
    [address, refreshBalance, toasts],
  );

  const ensureChain = useCallback(async () => {
    if (mode !== "injected" || !provider.current) return;
    const current = Number(await provider.current.request({ method: "eth_chainId" }));
    if (current === CHAIN.id) return;
    try {
      await provider.current.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(CHAIN.id) }] });
    } catch {
      await provider.current.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: numberToHex(CHAIN.id), chainName: CHAIN.name, nativeCurrency: CHAIN.nativeCurrency, rpcUrls: RPC_URLS }],
      });
    }
    const after = Number(await provider.current.request({ method: "eth_chainId" }));
    if (after !== CHAIN.id) throw new Error(`Switch your wallet to ${CHAIN.name} to continue`);
  }, [mode]);

  const write = useCallback<WalletCtx["write"]>(
    async (label, w, opts = {}) => {
      const wc = client.current;
      if (!wc?.account || !address) return null;
      const id = toasts.push({ kind: "pending", title: label, detail: "Checking…" });
      const attempt = async (retry: boolean): Promise<Hex | null> => {
        try {
          await ensureChain();
          // Pre-flight: the exact call, simulated against the chain.
          const { request } = await publicClient.simulateContract({ account: wc.account!, ...w, args: w.args ?? [] } as never);
          const gas = await publicClient.estimateContractGas({ account: wc.account!, ...w, args: w.args ?? [] } as never).catch(() => 400_000n);
          const price = await publicClient.getGasPrice().catch(() => 1_000_000_000n);
          const need = (w.value ?? 0n) + (gas * price * 12n) / 10n;
          const have = await refreshBalance();
          if (have < need) {
            if (mode === "burner") {
              toasts.update(id, { detail: "Topping up test ETH…" });
              const ok = await faucet({ silent: true });
              if (!ok || (await refreshBalance()) < need) throw Object.assign(new Error("Not enough test ETH for this and gas"), { faucet: true });
            } else {
              throw Object.assign(new Error("Not enough test ETH for this and gas"), { faucet: true });
            }
          }
          toasts.update(id, { detail: mode === "injected" ? "Confirm in your wallet" : "Sending…" });
          const hash = await wc.writeContract({ ...(request as object), account: wc.account!, chain: CHAIN } as never);
          toasts.update(id, { detail: "Waiting for confirmation…", hash });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The transaction failed on-chain");
          toasts.update(id, { kind: "success", title: label, detail: "Confirmed", hash });
          void refreshBalance();
          opts.onSuccess?.(hash);
          return hash;
        } catch (e) {
          const f = friendly(e);
          if (retry && f.fix === "retry") {
            await new Promise((r) => setTimeout(r, 1500));
            return attempt(false);
          }
          const isFaucet = (e as { faucet?: boolean }).faucet || f.fix === "faucet";
          toasts.update(id, {
            kind: "error",
            title: isFaucet ? "Not enough test ETH for this and gas" : f.title,
            detail: f.detail,
            action: isFaucet ? { label: "Get test ETH", run: () => void faucet() } : f.fix === "refresh" ? { label: "Refresh prices", run: () => window.dispatchEvent(new Event("till:refresh")) } : undefined,
          });
          return null;
        }
      };
      return attempt(true);
    },
    [address, ensureChain, faucet, mode, refreshBalance, toasts],
  );

  const signTypedData = useCallback<WalletCtx["signTypedData"]>(
    async (typed) => {
      const wc = client.current;
      if (!wc?.account) throw new Error("No wallet");
      await ensureChain();
      return wc.signTypedData({ ...(typed as object), account: wc.account } as never);
    },
    [ensureChain],
  );

  const sendRaw = useCallback<WalletCtx["sendRaw"]>(async (to, data, value, gas) => {
    const wc = client.current;
    if (!wc?.account) throw new Error("No wallet");
    await ensureChain();
    const hash = await wc.sendTransaction({ account: wc.account, chain: CHAIN, to, data, value, gas } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    void refreshBalance();
    return { hash, status: r.status };
  }, [ensureChain, refreshBalance]);

  const useInjectedWallet = useCallback(async (i: Injected) => {
    const accounts = (await i.provider.request({ method: "eth_requestAccounts" })) as Address[];
    if (!accounts[0]) throw new Error("No account");
    provider.current = i.provider;
    client.current = createWalletClient({ account: accounts[0], chain: CHAIN, transport: custom(i.provider) });
    setAddress(accounts[0]);
    setMode("injected");
    save(MODE_KEY, "injected");
  }, []);

  const useBurnerWallet = useCallback(() => {
    if (!burnerKey) return;
    const account = privateKeyToAccount(burnerKey);
    provider.current = null;
    client.current = createWalletClient({ account, chain: CHAIN, transport: transport() });
    setAddress(account.address);
    setMode("burner");
    save(MODE_KEY, "burner");
  }, [burnerKey]);

  const importBurner = useCallback((key: Hex) => {
    const account = privateKeyToAccount(key);
    save(BURNER_KEY, key);
    remove(MODE_KEY);
    setBurnerKey(key);
    provider.current = null;
    client.current = createWalletClient({ account, chain: CHAIN, transport: transport() });
    setAddress(account.address);
    setMode("burner");
  }, []);

  const value = useMemo<WalletCtx>(
    () => ({ ready, address, mode, balance, injected, burnerKey, refreshBalance, write, signTypedData, faucet, sendRaw, useInjected: useInjectedWallet, useBurner: useBurnerWallet, importBurner }),
    [ready, address, mode, balance, injected, burnerKey, refreshBalance, write, signTypedData, faucet, sendRaw, useInjectedWallet, useBurnerWallet, importBurner],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const NETWORK_LABEL = NETWORK === "sepolia" ? "Sepolia testnet" : "Local devnet";
