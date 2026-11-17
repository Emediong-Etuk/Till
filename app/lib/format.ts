import { formatEther, parseEther } from "viem";
import { NGN_PER_ETH } from "./config";

/** ETH with at most 6 decimals, trailing zeros trimmed. */
export function eth(wei: bigint, digits = 6): string {
  const s = formatEther(wei);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, digits).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i!;
}

export function ngn(wei: bigint): string {
  const n = Number(formatEther(wei)) * NGN_PER_ETH;
  return `≈ ₦${Math.round(n).toLocaleString("en-NG")}`;
}

export function parseEthInput(text: string): bigint | null {
  try {
    if (!/^\d*(\.\d{0,18})?$/.test(text.trim()) || text.trim() === "") return null;
    return parseEther(text.trim());
  } catch {
    return null;
  }
}

export function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function when(unix: bigint): string {
  return new Date(Number(unix) * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
