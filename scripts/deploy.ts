// Deploy ShopFactory + a seeded demo shop + NaiveShop (lab only) and write
// deployments/<network>.json.
//
//   tsx scripts/deploy.ts --network local
//   tsx scripts/deploy.ts --network sepolia   (needs DEPLOYER_PRIVATE_KEY)
import { mkdirSync, writeFileSync } from "node:fs";
import { formatEther } from "viem";
import { ROOT } from "./lib/artifacts.ts";
import { deployAll } from "./lib/deploy.ts";
import { type Net, arg, explorer, feVersion, gitSha, network } from "./lib/net.ts";

const net = (arg("network", "local") as Net) ?? "local";
const { client, wallet, account, chain } = network(net);
const appUrl = process.env.APP_URL ?? (net === "local" ? "http://localhost:3000" : "https://till.vercel.app");
const tokenUriBase = `${appUrl.replace(/\/$/, "")}/api/pass/`;

const balance = await client.getBalance({ address: account.address });
console.log(`deployer ${account.address} on ${chain.name} (${formatEther(balance)} ETH)`);
if (balance === 0n) throw new Error("deployer has no ETH: fund it first");

const d = await deployAll({ wallet: wallet as never, client: client as never, network: net, tokenUriBase, feVersion: feVersion(), gitSha: gitSha() });
mkdirSync(`${ROOT}deployments`, { recursive: true });
writeFileSync(`${ROOT}deployments/${net}.json`, JSON.stringify(d, null, 2) + "\n");
console.log(`factory   ${d.factory.address}  ${explorer(net, d.factory.hash)}`);
console.log(`demo shop ${d.demoShop.address}  ${explorer(net, d.demoShop.hash)}`);
console.log(`naive     ${d.naiveShop.address}  ${explorer(net, d.naiveShop.hash)}`);
console.log(`wrote deployments/${net}.json`);
