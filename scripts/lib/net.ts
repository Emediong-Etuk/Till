// Network selection for scripts: `local` (anvil) or `sepolia`.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { type Chain, type Hex, createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ROOT } from "./artifacts.ts";
import { ANVIL_KEYS } from "./encoding.ts";
import type { Deployment } from "./deploy.ts";

export type Net = "local" | "sepolia";

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1] : fallback;
}

export function loadEnv() {
  const file = `${ROOT}.env`;
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

export const local = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export function network(net: Net) {
  loadEnv();
  const chain: Chain = net === "sepolia" ? sepolia : local;
  const rpc =
    net === "sepolia"
      ? process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"
      : process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
  const key = (net === "sepolia" ? process.env.DEPLOYER_PRIVATE_KEY : process.env.DEPLOYER_PRIVATE_KEY ?? ANVIL_KEYS[0]) as Hex | undefined;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is not set (see .env.example)");
  const account = privateKeyToAccount(key);
  const client = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  return { chain, rpc, account, client, wallet };
}

export function feVersion(): string {
  try {
    return execSync("fe --version", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    return "unknown";
  }
}

export function deployment(net: Net): Deployment {
  const file = `${ROOT}deployments/${net}.json`;
  if (!existsSync(file)) throw new Error(`${file} not found: deploy first`);
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}

export function explorer(net: Net, hash: string, kind: "tx" | "address" = "tx"): string {
  return net === "sepolia" ? `https://sepolia.etherscan.io/${kind}/${hash}` : `(local) ${hash}`;
}
