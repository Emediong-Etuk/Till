// Loads Fe build artifacts (out/<Contract>.{abi.json,bin,runtime.bin}).
import { existsSync, readFileSync } from "node:fs";
import type { Abi, Hex } from "viem";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const OUT = `${ROOT}out`;

export type Artifact = { name: string; abi: Abi; bytecode: Hex; runtime: Hex };

const cache = new Map<string, Artifact>();

export function artifact(name: string): Artifact {
  const hit = cache.get(name);
  if (hit) return hit;
  const base = `${OUT}/${name}`;
  if (!existsSync(`${base}.bin`)) {
    throw new Error(`missing ${base}.bin — run \`make build\` first`);
  }
  const a: Artifact = {
    name,
    abi: JSON.parse(readFileSync(`${base}.abi.json`, "utf8")) as Abi,
    bytecode: `0x${readFileSync(`${base}.bin`, "utf8").trim()}` as Hex,
    runtime: `0x${readFileSync(`${base}.runtime.bin`, "utf8").trim()}` as Hex,
  };
  cache.set(name, a);
  return a;
}
