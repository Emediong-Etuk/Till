import { describe, expect, it, beforeAll } from "vitest";
import { type Address, type Hex, concat, encodeAbiParameters, keccak256, parseEther, toFunctionSelector, toEventSelector, getAddress } from "viem";
import { ADA, ALICE, BOB, MALLORY, TOBI, abi, accounts, addItem, buy, client, data, freshShop, read, revertOf, wallets, write } from "./env.ts";
import { artifact } from "../scripts/lib/artifacts.ts";
import { deployContract } from "../scripts/lib/deploy.ts";
import { label, uriWords } from "../scripts/lib/encoding.ts";
import { checkInDigest } from "../scripts/lib/checkin.ts";

describe("cross-frame safety (EIP-1153) with real transactions", () => {
  let shop: Address;
  let item: bigint;
  let relay: Address;
  beforeAll(async () => {
    ({ shop } = await freshShop());
    item = (await addItem(shop, parseEther("0.01"), 100n)).id;
    relay = (await deployContract(wallets[MALLORY]! as never, client as never, "Relay", [], parseEther("1"))).address;
  });

  it("a relay paying one batch cannot spend leftovers in a second call of the same tx", async () => {
    const first = data("Shop", "multicall", [[buy(item, 1n)]]);
    const second = buy(item, 1n);
    await write(MALLORY, "Relay", relay, "pair", [shop, parseEther("0.01"), first, second]);
    expect(await read<bigint>("Relay", relay, "lastSelector")).toBe(BigInt(toFunctionSelector("Overspend(uint256,uint256)")));
    expect(await read<bigint>("Shop", shop, "balanceOf", [relay])).toBe(1n);
    expect(await read<{ left: bigint; batching: boolean }>("Shop", shop, "tillState")).toEqual({ left: 0n, batching: false, entries: 0n });
  });

  it("the relay can pay twice legitimately in one tx", async () => {
    const first = buy(item, 1n);
    const second = data("Shop", "note", [label("second")]);
    await write(MALLORY, "Relay", relay, "pair", [shop, parseEther("0.01"), first, second]);
    expect(await read<bigint>("Relay", relay, "lastSelector")).toBe(0n);
  });
});

describe("ERC-1271 contract holders", () => {
  it("a smart-wallet holder checks in by approving the digest", async () => {
    const { shop } = await freshShop();
    const item = (await addItem(shop, 1000n, 10n)).id;
    const wallet = (await deployContract(wallets[TOBI]! as never, client as never, "Actor", [], parseEther("0.1"))).address;
    await write(TOBI, "Actor", wallet, "exec", [shop, 1000n, buy(item, 1n)]);
    expect(await read<Address>("Shop", shop, "ownerOf", [1n])).toBe(getAddress(wallet));
    const deadline = (await client.getBlock()).timestamp + 600n;
    const digest = checkInDigest(await client.getChainId(), shop, 1n, deadline);
    expect((await revertOf(ADA, "Shop", shop, "redeem", [1n, deadline, "0x"])).name).toBe("BadSignature");
    await write(TOBI, "Actor", wallet, "approveDigest", [digest]);
    await write(ADA, "Shop", shop, "redeem", [1n, deadline, "0x"]);
    expect((await read<{ redeemed: boolean }>("Shop", shop, "passOf", [1n])).redeemed).toBe(true);
  });

  it("safeTransferFrom to a refusing contract reverts with UnsafeRecipient", async () => {
    const { shop } = await freshShop();
    const item = (await addItem(shop, 1000n, 10n)).id;
    await write(ALICE, "Shop", shop, "buy", [item, 1n], 1000n);
    const wallet = (await deployContract(wallets[BOB]! as never, client as never, "Actor", [])).address;
    await write(BOB, "Actor", wallet, "setAcceptTokens", [false]);
    const r = await revertOf(ALICE, "Shop", shop, "safeTransferFrom", [accounts[ALICE]!.address, wallet, 1n]);
    expect(r.name).toBe("UnsafeRecipient");
    await write(BOB, "Actor", wallet, "setAcceptTokens", [true]);
    await write(ALICE, "Shop", shop, "safeTransferFrom", [accounts[ALICE]!.address, wallet, 1n]);
  });
});

describe("ABI compatibility", () => {
  const shopAbi = artifact("Shop").abi;
  it("the Shop ABI has every handler, event and error the app uses", () => {
    const names = new Set(shopAbi.map((x) => ("name" in x ? `${x.type}:${x.name}` : x.type)));
    for (const f of ["buy", "buyFor", "tip", "note", "multicall", "addItem", "redeem", "refund", "withdraw", "itemOf", "passOf", "accounting", "tillState", "checkInDigest", "tokenURI"]) {
      expect(names.has(`function:${f}`), f).toBe(true);
    }
    for (const e of ["Transfer", "Purchased", "Tipped", "Redeemed", "Refunded", "Withdrawn", "BatchSettled", "ItemAdded"]) {
      expect(names.has(`event:${e}`), e).toBe(true);
    }
    for (const e of ["Overspend", "Unspent", "NestedBatch", "ExternalCallInBatch", "ForeignFrame", "SoldOut", "WalletCapExceeded", "BadSignature"]) {
      expect(names.has(`error:${e}`), e).toBe(true);
    }
  });

  it("ERC-721 selectors and the Transfer topic are the standard ones", () => {
    const fns = shopAbi.filter((x) => x.type === "function").map((x) => toFunctionSelector(x as never));
    for (const s of ["0x70a08231", "0x6352211e", "0x095ea7b3", "0x081812fc", "0xa22cb465", "0xe985e9c5", "0x23b872dd", "0x42842e0e", "0xb88d4fde", "0x01ffc9a7", "0x06fdde03", "0x95d89b41", "0xc87b56dd"]) {
      expect(fns, s).toContain(s);
    }
    const transfer = shopAbi.find((x) => x.type === "event" && x.name === "Transfer")!;
    expect(toEventSelector(transfer as never)).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });

  it("supportsInterface answers ERC-165, ERC-721 and Metadata", async () => {
    const { shop } = await freshShop();
    for (const id of ["0x01ffc9a7", "0x80ac58cd", "0x5b5e139f"]) expect(await read<boolean>("Shop", shop, "supportsInterface", [id])).toBe(true);
    expect(await read<boolean>("Shop", shop, "supportsInterface", ["0xffffffff"])).toBe(false);
  });

  it("tokenURI points at the app's metadata route", async () => {
    const { shop } = await freshShop();
    const item = (await addItem(shop, 0n, 10n)).id;
    await write(TOBI, "Shop", shop, "buy", [item, 1n]);
    expect(await read<string>("Shop", shop, "tokenURI", [1n])).toBe(`http://localhost:3000/api/pass/${shop.toLowerCase()}/1`);
  });
});

describe("reproducible bytecode", () => {
  it("eth_getCode of a deployed Shop equals out/Shop.runtime.bin plus its immutables", async () => {
    const { shop } = await freshShop();
    const code = await client.getCode({ address: shop });
    const [u0, u1, ul] = uriWords("http://localhost:3000/api/pass/");
    const immutables = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [label("Uyo Dev Meetup"), label("UYO"), u0, u1, ul],
    );
    expect(code).toBe(concat([artifact("Shop").runtime, immutables]));
  });

  it("the factory's runtime code is exactly out/ShopFactory.runtime.bin plus its immutables", async () => {
    const { factory } = await freshShop();
    const code = await client.getCode({ address: factory });
    const [u0, u1, ul] = uriWords("http://localhost:3000/api/pass/");
    const immutables = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [u0, u1, ul]);
    expect(code).toBe(concat([artifact("ShopFactory").runtime, immutables]));
    expect(keccak256(code!)).toMatch(/^0x/);
  });
});
