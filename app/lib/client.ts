import { createPublicClient, fallback, http } from "viem";
import { CHAIN, RPC_URLS } from "./config";

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: fallback(RPC_URLS.map((u) => http(u, { retryCount: 1, timeout: 15_000 }))),
  batch: { multicall: false },
});
