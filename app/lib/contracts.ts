import type { Abi, Address, Hex } from "viem";
import { encodeFunctionData, hexToString, stringToHex } from "viem";
import shopAbiJson from "./abi/Shop.json";
import factoryAbiJson from "./abi/ShopFactory.json";
import naiveAbiJson from "./abi/NaiveShop.json";
import { publicClient } from "./client";

export const shopAbi = shopAbiJson as Abi;
export const factoryAbi = factoryAbiJson as Abi;
export const naiveAbi = naiveAbiJson as Abi;

export const STATUS = { 1: "Active", 2: "Paused", 3: "Cancelled", 4: "Released" } as Record<number, string>;
export const KIND = { 0: "Ticket", 1: "Merch", 2: "Other" } as Record<number, string>;

export type Item = {
  id: bigint;
  price: bigint;
  supply: bigint;
  sold: bigint;
  maxPerWallet: bigint;
  releaseAt: bigint;
  escrow: bigint;
  status: number;
  kind: number;
  label: string;
};

export type Pass = { id: bigint; item: bigint; paid: bigint; redeemed: boolean; owner: Address };

export function label(text: string): Hex {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 31) throw new Error(`"${text}" is ${bytes.length} bytes; names are limited to 31`);
  return stringToHex(text, { size: 32 });
}

export function unlabel(word: Hex): string {
  return hexToString(word, { size: 32 }).replace(/\0+$/, "");
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

type RawItem = {
  price: bigint;
  supply: bigint;
  sold: bigint;
  max_per_wallet: bigint;
  release_at: bigint;
  escrow: bigint;
  status: number;
  kind: number;
  label: Hex;
};

export async function readItems(shop: Address): Promise<Item[]> {
  const count = (await publicClient.readContract({ address: shop, abi: shopAbi, functionName: "itemCount" })) as bigint;
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const raw = await Promise.all(
    ids.map((id) => publicClient.readContract({ address: shop, abi: shopAbi, functionName: "itemOf", args: [id] }) as Promise<RawItem>),
  );
  return raw.map((r, i) => ({
    id: ids[i]!,
    price: r.price,
    supply: r.supply,
    sold: r.sold,
    maxPerWallet: r.max_per_wallet,
    releaseAt: r.release_at,
    escrow: r.escrow,
    status: Number(r.status),
    kind: Number(r.kind),
    label: unlabel(r.label),
  }));
}

export async function readPass(shop: Address, id: bigint): Promise<Pass> {
  const p = (await publicClient.readContract({ address: shop, abi: shopAbi, functionName: "passOf", args: [id] })) as {
    item: bigint;
    paid: bigint;
    redeemed: boolean;
    owner: Address;
  };
  return { id, ...p };
}

export type Books = { total_escrow: bigint; seller_available: bigint; tips_total: bigint; balance: bigint };

export async function readBooks(shop: Address): Promise<Books> {
  return (await publicClient.readContract({ address: shop, abi: shopAbi, functionName: "accounting" })) as Books;
}

export async function readShopMeta(shop: Address) {
  const [name, owner, symbol] = await Promise.all([
    publicClient.readContract({ address: shop, abi: shopAbi, functionName: "name" }) as Promise<string>,
    publicClient.readContract({ address: shop, abi: shopAbi, functionName: "owner" }) as Promise<Address>,
    publicClient.readContract({ address: shop, abi: shopAbi, functionName: "symbol" }) as Promise<string>,
  ]);
  return { name, owner, symbol };
}

export const call = {
  buy: (item: bigint, qty: bigint) => encodeFunctionData({ abi: shopAbi, functionName: "buy", args: [item, qty] }),
  buyFor: (item: bigint, qty: bigint, to: Address) => encodeFunctionData({ abi: shopAbi, functionName: "buyFor", args: [item, qty, to] }),
  tip: (amount: bigint) => encodeFunctionData({ abi: shopAbi, functionName: "tip", args: [amount] }),
  note: (text: string) => encodeFunctionData({ abi: shopAbi, functionName: "note", args: [label(text)] }),
  addItem: (price: bigint, supply: bigint, cap: bigint, releaseAt: bigint, kind: number, name: string) =>
    encodeFunctionData({ abi: shopAbi, functionName: "addItem", args: [price, supply, cap, releaseAt, kind, label(name)] }),
};
