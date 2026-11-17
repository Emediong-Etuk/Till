// Checks that deployed runtime code equals a fresh build: out/<C>.runtime.bin
// followed by the contract's immutable words (Fe appends immutables to the
// runtime and reads them with CODECOPY). Etherscan cannot verify Fe source,
// so this script is the verification.
//
//   make build && tsx scripts/verify-bytecode.ts --network sepolia
import { type Address, type Hex, concat, encodeAbiParameters } from "viem";
import { artifact } from "./lib/artifacts.ts";
import { uriWords } from "./lib/encoding.ts";
import { type Net, arg, deployment, network } from "./lib/net.ts";

const net = (arg("network", "local") as Net) ?? "local";
const { client } = network(net);
const d = deployment(net);
const [u0, u1, ul] = uriWords(d.tokenUriBase);
const shopAbi = artifact("Shop").abi;

async function word(address: Address, fn: string): Promise<Hex> {
  // name()/symbol() are stored as bytes32 labels; recover them from the
  // ShopOpened event instead of re-encoding strings.
  return (await client.readContract({ address, abi: shopAbi, functionName: fn } as never)) as Hex;
}

function check(name: string, onchain: Hex | undefined, expected: Hex) {
  const ok = onchain?.toLowerCase() === expected.toLowerCase();
  console.log(`${ok ? "MATCH" : "DIFF "}  ${name}  (${((onchain?.length ?? 2) - 2) / 2} bytes)`);
  return ok;
}

const factoryCode = await client.getCode({ address: d.factory.address });
const factoryExpected = concat([
  artifact("ShopFactory").runtime,
  encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [u0, u1, ul]),
]);

const opened = await client.getContractEvents({
  address: d.factory.address,
  abi: artifact("ShopFactory").abi,
  eventName: "ShopOpened",
  fromBlock: BigInt(d.factory.block),
} as never);
const shopEvent = (opened as unknown as { args: { shop: Address; name: Hex } }[]).find((e) => e.args.shop.toLowerCase() === d.demoShop.address.toLowerCase());
if (!shopEvent) throw new Error("ShopOpened event for the demo shop not found");
const symbolString = (await word(d.demoShop.address, "symbol")) as unknown as string;
const symbolWord = `0x${Buffer.from(symbolString).toString("hex").padEnd(64, "0")}` as Hex;
const shopCode = await client.getCode({ address: d.demoShop.address });
const shopExpected = concat([
  artifact("Shop").runtime,
  encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [shopEvent.args.name, symbolWord, u0, u1, ul],
  ),
]);
const naiveCode = await client.getCode({ address: d.naiveShop.address });
const naiveExpected = concat([artifact("NaiveShop").runtime, encodeAbiParameters([{ type: "address" }], [d.deployer])]);

const all = [
  check("ShopFactory", factoryCode, factoryExpected),
  check("Shop (demo)", shopCode, shopExpected),
  check("NaiveShop", naiveCode, naiveExpected),
];
if (!all.every(Boolean)) process.exit(1);
