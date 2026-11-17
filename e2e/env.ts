// Clients and contract helpers for the E2E tests.
import {
  type Abi,
  type Address,
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact } from "../scripts/lib/artifacts.ts";
import { ANVIL_KEYS, label, uriWords } from "../scripts/lib/encoding.ts";
import { deployContract } from "../scripts/lib/deploy.ts";

export const rpc = () => process.env.E2E_RPC ?? "http://127.0.0.1:8646";

export const anvil = defineChain({
  id: 31337,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc()] } },
});

export const client = createPublicClient({ chain: anvil, transport: http(rpc()) });
export const testClient = createTestClient({ chain: anvil, mode: "anvil", transport: http(rpc()) });

export const accounts = ANVIL_KEYS.map((k) => privateKeyToAccount(k));
export const wallets = accounts.map((account) => createWalletClient({ account, chain: anvil, transport: http(rpc()) }));

// Cast of characters, each a distinct EOA.
export const [ADA, TOBI, ALICE, BOB, MALLORY, KEMI] = [0, 1, 2, 3, 4, 5] as const;

export const URI_BASE = "http://localhost:3000/api/pass/";

export function abi(name: string): Abi {
  return artifact(name).abi;
}

export function data(contract: string, functionName: string, args: readonly unknown[] = []): Hex {
  return encodeFunctionData({ abi: abi(contract), functionName, args } as never);
}

export async function read<T>(contract: string, address: Address, functionName: string, args: readonly unknown[] = []): Promise<T> {
  return (await client.readContract({ address, abi: abi(contract), functionName, args } as never)) as T;
}

/** Simulate, send and wait. Throws a decoded error name on revert. */
export async function write(
  who: number,
  contract: string,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
  value = 0n,
) {
  const wallet = wallets[who]!;
  const { request } = await client.simulateContract({
    account: wallet.account,
    address,
    abi: abi(contract),
    functionName,
    args,
    value,
  } as never);
  const hash = await wallet.writeContract(request as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted on-chain`);
  return { hash, receipt };
}

/** Send without simulating first (to land a revert on-chain or measure gas). */
export async function rawSend(who: number, to: Address, calldata: Hex, value = 0n, gas?: bigint) {
  const wallet = wallets[who]!;
  const hash = await wallet.sendTransaction({ to, data: calldata, value, gas });
  return client.waitForTransactionReceipt({ hash });
}

export type Revert = { name: string; args: readonly unknown[] };

/** The decoded custom error a call reverts with. */
export async function revertOf(
  who: number,
  contract: string,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
  value = 0n,
): Promise<Revert> {
  try {
    await client.simulateContract({
      account: accounts[who]!,
      address,
      abi: abi(contract),
      functionName,
      args,
      value,
    } as never);
  } catch (e) {
    if (e instanceof BaseError) {
      const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
      if (r instanceof ContractFunctionRevertedError) {
        return { name: r.data?.errorName ?? r.signature ?? "unknown", args: r.data?.args ?? [] };
      }
    }
    throw e;
  }
  throw new Error(`${functionName} did not revert`);
}

export async function freshShop(owner = ADA, name = "Uyo Dev Meetup") {
  const [u0, u1, ul] = uriWords(URI_BASE);
  const factory = await deployContract(wallets[owner]! as never, client as never, "ShopFactory", [u0, u1, ul]);
  await write(owner, "ShopFactory", factory.address, "open", [label(name), label("UYO")]);
  const count = await read<bigint>("ShopFactory", factory.address, "count");
  const shop = await read<Address>("ShopFactory", factory.address, "shopAt", [count - 1n]);
  return { factory: factory.address, shop };
}

export async function now(): Promise<bigint> {
  return (await client.getBlock()).timestamp;
}

export async function addItem(shop: Address, price: bigint, supply = 100n, opts: { cap?: bigint; releaseIn?: bigint; kind?: number; name?: string } = {}) {
  const t = await now();
  const r = await write(ADA, "Shop", shop, "addItem", [
    price,
    supply,
    opts.cap ?? 0n,
    t + (opts.releaseIn ?? 3600n),
    opts.kind ?? 0,
    label(opts.name ?? "General"),
  ]);
  const count = await read<bigint>("Shop", shop, "itemCount");
  return { id: count - 1n, ...r };
}

export const buy = (item: bigint, qty: bigint) => data("Shop", "buy", [item, qty]);
export const tip = (amount: bigint) => data("Shop", "tip", [amount]);
