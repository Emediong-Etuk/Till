// Records example transactions on a deployment for the report and the
// video: a batched checkout, a redeem, a refund and a withdraw.
//
//   tsx scripts/examples.ts --network local
//   tsx scripts/examples.ts --network sepolia  (buyer = BUYER_PRIVATE_KEY or the deployer)
import { writeFileSync } from "node:fs";
import { type Address, type Hex, createWalletClient, encodeFunctionData, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ROOT, artifact } from "./lib/artifacts.ts";
import { label, ANVIL_KEYS } from "./lib/encoding.ts";
import { signCheckIn } from "./lib/checkin.ts";
import { type Net, arg, deployment, explorer, network } from "./lib/net.ts";

const net = (arg("network", "local") as Net) ?? "local";
const { client, wallet, chain, rpc } = network(net);
const d = deployment(net);
const shopAbi = artifact("Shop").abi;
const buyerKey = (process.env.BUYER_PRIVATE_KEY ?? (net === "local" ? ANVIL_KEYS[1] : process.env.DEPLOYER_PRIVATE_KEY)) as Hex;
const buyer = createWalletClient({ account: privateKeyToAccount(buyerKey), chain, transport: http(rpc) });
const shop = d.demoShop.address;

async function tx(w: typeof wallet, fn: string, args: unknown[], value = 0n, to: Address = shop): Promise<Hex> {
  const { request } = await client.simulateContract({ account: w.account, address: to, abi: shopAbi, functionName: fn, args, value } as never);
  const hash = await w.writeContract(request as never);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${fn} failed`);
  console.log(`${fn.padEnd(10)} ${explorer(net, hash)}`);
  return hash;
}

type Item = { price: bigint };
const general = (await client.readContract({ address: shop, abi: shopAbi, functionName: "itemOf", args: [0n] } as never)) as Item;
const shirt = (await client.readContract({ address: shop, abi: shopAbi, functionName: "itemOf", args: [2n] } as never)) as Item;
const tipAmount = parseEther("0.0005");
const total = general.price * 2n + shirt.price + tipAmount;
const entries = [
  encodeFunctionData({ abi: shopAbi, functionName: "buy", args: [0n, 2n] } as never),
  encodeFunctionData({ abi: shopAbi, functionName: "buy", args: [2n, 1n] } as never),
  encodeFunctionData({ abi: shopAbi, functionName: "tip", args: [tipAmount] } as never),
];
const minted = (await client.readContract({ address: shop, abi: shopAbi, functionName: "totalMinted" } as never)) as bigint;
const checkout = await tx(buyer, "multicall", [entries], total);

const deadline = (await client.getBlock()).timestamp + 3600n;
const pass = minted + 1n;
const sig = await signCheckIn(buyer.account, chain.id, shop, pass, deadline);
const redeem = await tx(wallet, "redeem", [pass, deadline, sig]);

// A separate item to cancel and refund, so the demo items stay on sale.
const now = (await client.getBlock()).timestamp;
await tx(wallet, "addItem", [parseEther("0.0001"), 10n, 0n, now + 86400n, 2, label("Cancelled workshop")]);
const count = (await client.readContract({ address: shop, abi: shopAbi, functionName: "itemCount" } as never)) as bigint;
const workshop = count - 1n;
await tx(buyer, "buy", [workshop, 1n], parseEther("0.0001"));
const refundPass = (await client.readContract({ address: shop, abi: shopAbi, functionName: "totalMinted" } as never)) as bigint;
await tx(wallet, "cancel", [workshop]);
const refund = await tx(buyer, "refund", [refundPass]);
const withdraw = await tx(wallet, "withdraw", [wallet.account.address]);

d.examples = { batchedCheckout: checkout, redeem, refund, withdraw };
writeFileSync(`${ROOT}deployments/${net}.json`, JSON.stringify(d, null, 2) + "\n");
console.log(`recorded examples in deployments/${net}.json`);
