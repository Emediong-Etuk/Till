import { type Address, type Chain, defineChain } from "viem";
import { sepolia } from "viem/chains";
import localDeployment from "./deployments/local.json";
import sepoliaDeployment from "./deployments/sepolia.json";

export type Network = "local" | "sepolia";

export const NETWORK: Network = (process.env.NEXT_PUBLIC_CHAIN as Network) === "sepolia" ? "sepolia" : "local";

export const localChain = defineChain({
  id: 31337,
  name: "Anvil (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const CHAIN: Chain = NETWORK === "sepolia" ? sepolia : localChain;

const defaultRpcs =
  NETWORK === "sepolia"
    ? ["https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org"]
    : ["http://127.0.0.1:8545"];

export const RPC_URLS: string[] = (process.env.NEXT_PUBLIC_RPC_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(defaultRpcs);

type DeploymentFile = {
  missing?: boolean;
  factory?: { address: Address; block: string };
  demoShop?: { address: Address };
  naiveShop?: { address: Address };
  labShop?: { address: Address };
};

const d = (NETWORK === "sepolia" ? sepoliaDeployment : localDeployment) as DeploymentFile;

export const DEPLOYMENT = {
  ready: !d.missing && !!d.factory,
  factory: d.factory?.address,
  fromBlock: BigInt(d.factory?.block ?? "0"),
  demoShop: d.demoShop?.address,
  naiveShop: d.naiveShop?.address,
  labShop: d.labShop?.address,
};

export const EXPLORER = NETWORK === "sepolia" ? "https://sepolia.etherscan.io" : null;

export function txUrl(hash: string): string | null {
  return EXPLORER ? `${EXPLORER}/tx/${hash}` : null;
}

export function addressUrl(addr: string): string | null {
  return EXPLORER ? `${EXPLORER}/address/${addr}` : null;
}

/** Static ₦ estimate for display only. Not a price feed. */
export const NGN_PER_ETH = Number(process.env.NEXT_PUBLIC_NGN_PER_ETH ?? 5_200_000);

export const TESTNET_ONLY = true;
