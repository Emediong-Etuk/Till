import type { AbiEvent, Address, Log } from "viem";
import { publicClient } from "./client";
import { DEPLOYMENT, NETWORK } from "./config";

const CHUNK = NETWORK === "sepolia" ? 5_000n : 1_000_000n;

/** getLogs in chunks from the deployment block, so public RPCs accept it. */
export type DecodedLog = Log & { args: Record<string, unknown> };

export async function getLogsChunked(opts: { address: Address | Address[]; event: AbiEvent; args?: Record<string, unknown>; fromBlock?: bigint }): Promise<DecodedLog[]> {
  const latest = await publicClient.getBlockNumber();
  const out: DecodedLog[] = [];
  for (let from = opts.fromBlock ?? DEPLOYMENT.fromBlock; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await publicClient.getLogs({ address: opts.address, event: opts.event, args: opts.args as never, fromBlock: from, toBlock: to } as never);
    out.push(...(logs as unknown as DecodedLog[]));
  }
  return out;
}
