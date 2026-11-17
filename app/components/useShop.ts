"use client";
import { useCallback, useEffect, useState } from "react";
import { type Address, isAddress } from "viem";
import { type Books, type Item, readBooks, readItems, readShopMeta } from "@/lib/contracts";
import { publicClient } from "@/lib/client";

export type ShopState = {
  loading: boolean;
  error?: string;
  name?: string;
  symbol?: string;
  owner?: Address;
  items: Item[];
  books?: Books;
  now: bigint;
  reload: () => Promise<void>;
};

export function useShop(shop: string): ShopState {
  const [state, setState] = useState<Omit<ShopState, "reload">>({ loading: true, items: [], now: 0n });
  const reload = useCallback(async () => {
    if (!isAddress(shop)) {
      setState((s) => ({ ...s, loading: false, error: "That isn't a shop address" }));
      return;
    }
    try {
      const code = await publicClient.getCode({ address: shop });
      if (!code || code === "0x") throw new Error("No shop at this address on this network");
      const [meta, items, books, block] = await Promise.all([readShopMeta(shop), readItems(shop), readBooks(shop), publicClient.getBlock()]);
      setState({ loading: false, ...meta, items, books, now: block.timestamp });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [shop]);
  useEffect(() => {
    void reload();
    const onRefresh = () => void reload();
    window.addEventListener("till:refresh", onRefresh);
    const t = setInterval(() => void reload(), 15000);
    return () => {
      window.removeEventListener("till:refresh", onRefresh);
      clearInterval(t);
    };
  }, [reload]);
  return { ...state, reload };
}
