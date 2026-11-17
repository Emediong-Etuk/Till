// Deploys the factory, a demo shop with seeded items and the NaiveShop used
// by /lab. Used by `make demo`, `make deploy-sepolia` and the E2E tests.
import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  encodeFunctionData,
  parseEther,
} from "viem";
import { artifact } from "./artifacts.ts";
import { label, uriWords } from "./encoding.ts";

export type Wallet = WalletClient<Transport, Chain, Account>;

export async function deployContract(
  wallet: Wallet,
  client: PublicClient,
  name: string,
  args: readonly unknown[] = [],
  value = 0n,
): Promise<{ address: Address; hash: Hex; block: bigint; gasUsed: bigint }> {
  const a = artifact(name);
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args, value } as never);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`deploying ${name} failed (${hash})`);
  return { address: r.contractAddress, hash, block: r.blockNumber, gasUsed: r.gasUsed };
}

export async function send(
  wallet: Wallet,
  client: PublicClient,
  to: Address,
  abiName: string,
  functionName: string,
  args: readonly unknown[] = [],
  value = 0n,
) {
  const { abi } = artifact(abiName);
  const { request } = await client.simulateContract({
    account: wallet.account,
    address: to,
    abi,
    functionName,
    args,
    value,
  } as never);
  const hash = await wallet.writeContract(request as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} failed (${hash})`);
  return { hash, receipt };
}

export const LAB_PRICE = parseEther("0.001");
export const LAB_HONEST = 9n;

export type DemoItem = { label: string; price: bigint; supply: bigint; cap: bigint; kind: number; releaseIn: bigint };

export const DEMO_ITEMS: DemoItem[] = [
  { label: "General admission", price: parseEther("0.001"), supply: 120n, cap: 4n, kind: 0, releaseIn: 7n * 86400n },
  { label: "VIP + dinner", price: parseEther("0.003"), supply: 20n, cap: 2n, kind: 0, releaseIn: 7n * 86400n },
  { label: "Meetup T-shirt", price: parseEther("0.0015"), supply: 60n, cap: 0n, kind: 1, releaseIn: 7n * 86400n },
];

export function addItemsCalldata(shopAbiName: string, items: DemoItem[], now: bigint): Hex[] {
  const { abi } = artifact(shopAbiName);
  return items.map((it) =>
    encodeFunctionData({
      abi,
      functionName: "addItem",
      args: [it.price, it.supply, it.cap, now + it.releaseIn, it.kind, label(it.label)],
    } as never),
  );
}

export type Deployment = {
  network: string;
  chainId: number;
  feVersion: string;
  gitSha: string;
  deployedAt: string;
  deployer: Address;
  tokenUriBase: string;
  factory: { address: Address; hash: Hex; block: string };
  demoShop: { address: Address; hash: Hex; block: string; itemsTx: Hex };
  naiveShop: { address: Address; hash: Hex; block: string; itemTx: Hex };
  labShop: { address: Address; hash: Hex; block: string };
  examples?: Record<string, Hex>;
};

export async function deployAll(opts: {
  wallet: Wallet;
  client: PublicClient;
  network: string;
  tokenUriBase: string;
  feVersion: string;
  gitSha: string;
  shopName?: string;
  shopSymbol?: string;
}): Promise<Deployment> {
  const { wallet, client } = opts;
  const [u0, u1, ulen] = uriWords(opts.tokenUriBase);
  const factory = await deployContract(wallet, client, "ShopFactory", [u0, u1, ulen]);

  const open = await send(wallet, client, factory.address, "ShopFactory", "open", [
    label(opts.shopName ?? "Uyo Dev Meetup"),
    label(opts.shopSymbol ?? "UYO"),
  ]);
  const shop = (await client.readContract({
    address: factory.address,
    abi: artifact("ShopFactory").abi,
    functionName: "shopAt",
    args: [0n],
  })) as Address;

  const block = await client.getBlock();
  const data = addItemsCalldata("Shop", DEMO_ITEMS, block.timestamp);
  const items = await send(wallet, client, shop, "Shop", "multicall", [data]);

  // The /lab pair: a NaiveShop and a Till shop selling the same 0.001 ETH
  // ticket, each holding 9 honest purchases so there is money to steal.
  const naive = await deployContract(wallet, client, "NaiveShop", [wallet.account.address]);
  const naiveItem = await send(wallet, client, naive.address, "NaiveShop", "addItem", [LAB_PRICE, 100000n]);
  await send(wallet, client, naive.address, "NaiveShop", "buy", [0n, LAB_HONEST], LAB_PRICE * LAB_HONEST);
  const labOpen = await send(wallet, client, factory.address, "ShopFactory", "open", [label("Till Lab"), label("LAB")]);
  const lab = (await client.readContract({
    address: factory.address,
    abi: artifact("ShopFactory").abi,
    functionName: "shopAt",
    args: [1n],
  })) as Address;
  await send(wallet, client, lab, "Shop", "addItem", [LAB_PRICE, 100000n, 0n, block.timestamp + 365n * 86400n, 0, label("Lab ticket")]);
  await send(wallet, client, lab, "Shop", "buy", [0n, LAB_HONEST], LAB_PRICE * LAB_HONEST);

  return {
    network: opts.network,
    chainId: await client.getChainId(),
    feVersion: opts.feVersion,
    gitSha: opts.gitSha,
    deployedAt: new Date().toISOString(),
    deployer: wallet.account.address,
    tokenUriBase: opts.tokenUriBase,
    factory: { address: factory.address, hash: factory.hash, block: factory.block.toString() },
    demoShop: { address: shop, hash: open.hash, block: open.receipt.blockNumber.toString(), itemsTx: items.hash },
    naiveShop: { address: naive.address, hash: naive.hash, block: naive.block.toString(), itemTx: naiveItem.hash },
    labShop: { address: lab, hash: labOpen.hash, block: labOpen.receipt.blockNumber.toString() },
  };
}
