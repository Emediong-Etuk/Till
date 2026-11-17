import { describe, expect, it, beforeAll } from "vitest";
import { type Address, decodeEventLog, parseEther, getAddress } from "viem";
import {
  ADA, ALICE, BOB, KEMI, MALLORY, TOBI, abi, accounts, addItem, buy, client, data, freshShop, read, revertOf, tip, write, now,
} from "./env.ts";
import { label, unlabel } from "../scripts/lib/encoding.ts";

type Acc = { total_escrow: bigint; seller_available: bigint; tips_total: bigint; balance: bigint };

async function books(shop: Address) {
  const b = await read<Acc>("Shop", shop, "accounting");
  expect(b.balance).toBe(await client.getBalance({ address: shop }));
  return b;
}

function events(receipt: { logs: { data: `0x${string}`; topics: readonly `0x${string}`[] }[] }) {
  return receipt.logs.map((l) => decodeEventLog({ abi: abi("Shop"), data: l.data, topics: l.topics as never }));
}

describe("factory and seller setup", () => {
  let factory: Address;
  let shop: Address;
  beforeAll(async () => ({ factory, shop } = await freshShop()));

  it("opens a shop owned by the seller", async () => {
    expect(await read<Address>("Shop", shop, "owner")).toBe(accounts[ADA]!.address);
    expect(await read<string>("Shop", shop, "name")).toBe("Uyo Dev Meetup");
    expect(await read<string>("Shop", shop, "symbol")).toBe("UYO");
  });

  it("predicts the next shop address before it is opened", async () => {
    const count = await read<bigint>("ShopFactory", factory, "count");
    const predicted = await read<Address>("ShopFactory", factory, "predict", [accounts[KEMI]!.address, label("Kemi"), label("KMI"), count]);
    await write(KEMI, "ShopFactory", factory, "open", [label("Kemi"), label("KMI")]);
    expect(await read<Address>("ShopFactory", factory, "shopAt", [count])).toBe(predicted);
    expect(await read<Address>("ShopFactory", factory, "ownerOfShop", [predicted])).toBe(accounts[KEMI]!.address);
  });

  it("adds three items in one zero-value multicall", async () => {
    const t = await now();
    const calls = [
      data("Shop", "addItem", [parseEther("0.001"), 120n, 4n, t + 86400n, 0, label("General")]),
      data("Shop", "addItem", [parseEther("0.003"), 20n, 2n, t + 86400n, 0, label("VIP")]),
      data("Shop", "addItem", [parseEther("0.0015"), 60n, 0n, t + 86400n, 1, label("T-shirt")]),
    ];
    const { receipt } = await write(ADA, "Shop", shop, "multicall", [calls]);
    const names = events(receipt).map((e) => e.eventName);
    expect(names.filter((n) => n === "ItemAdded")).toHaveLength(3);
    expect(names).toContain("BatchSettled");
    expect(await read<bigint>("Shop", shop, "itemCount")).toBe(3n);
    const vip = await read<{ price: bigint; label: `0x${string}`; kind: number }>("Shop", shop, "itemOf", [1n]);
    expect(vip.price).toBe(parseEther("0.003"));
    expect(unlabel(vip.label)).toBe("VIP");
  });

  it("rejects addItem from a stranger with NotOwner", async () => {
    const r = await revertOf(MALLORY, "Shop", shop, "addItem", [1n, 1n, 0n, 0n, 0, label("x")]);
    expect(r.name).toBe("NotOwner");
    expect(getAddress(r.args[0] as string)).toBe(accounts[MALLORY]!.address);
  });
});

describe("one-tap checkout (real transactions, distinct EOAs)", () => {
  let shop: Address;
  let general: bigint;
  let shirt: bigint;
  beforeAll(async () => {
    ({ shop } = await freshShop());
    general = (await addItem(shop, parseEther("0.001"), 100n, { cap: 4n })).id;
    shirt = (await addItem(shop, parseEther("0.0015"), 100n, { kind: 1, name: "T-shirt" })).id;
  });

  it("Tobi buys 2 tickets, 1 shirt and tips in ONE tx paying the exact total once", async () => {
    const total = parseEther("0.001") * 2n + parseEther("0.0015") + parseEther("0.0005");
    const before = await client.getBalance({ address: shop });
    const { receipt } = await write(TOBI, "Shop", shop, "multicall", [[buy(general, 2n), buy(shirt, 1n), tip(parseEther("0.0005"))]], total);
    expect(await client.getBalance({ address: shop })).toBe(before + total);
    const ev = events(receipt);
    const settled = ev.find((e) => e.eventName === "BatchSettled")!.args as unknown as { payer: Address; paid: bigint; entries: bigint };
    expect(settled.payer).toBe(accounts[TOBI]!.address);
    expect(settled.paid).toBe(total);
    expect(settled.entries).toBe(3n);
    expect(ev.filter((e) => e.eventName === "Transfer")).toHaveLength(3);
    expect(ev.filter((e) => e.eventName === "Purchased")).toHaveLength(2);
    expect(await read<bigint>("Shop", shop, "balanceOf", [accounts[TOBI]!.address])).toBe(3n);
    const b = await books(shop);
    expect(b.total_escrow + b.seller_available).toBe(b.balance);
    expect(b.tips_total).toBe(parseEther("0.0005"));
  });

  it("overpaying by 1 wei reverts with Unspent{1}", async () => {
    const r = await revertOf(TOBI, "Shop", shop, "multicall", [[buy(general, 1n)]], parseEther("0.001") + 1n);
    expect(r).toEqual({ name: "Unspent", args: [1n] });
  });

  it("underpaying by 1 wei reverts with Overspend", async () => {
    const r = await revertOf(TOBI, "Shop", shop, "multicall", [[buy(general, 1n)]], parseEther("0.001") - 1n);
    expect(r.name).toBe("Overspend");
    expect(r.args).toEqual([parseEther("0.001"), parseEther("0.001") - 1n]);
  });

  it("listing the same Buy twice for one payment reverts with Overspend", async () => {
    const r = await revertOf(MALLORY, "Shop", shop, "multicall", [[buy(general, 1n), buy(general, 1n)]], parseEther("0.001"));
    expect(r.name).toBe("Overspend");
  });

  it("a gift goes to the recipient and counts against their cap", async () => {
    const kemi = accounts[KEMI]!.address;
    await write(ALICE, "Shop", shop, "multicall", [[data("Shop", "buyFor", [general, 4n, kemi])]], parseEther("0.004"));
    expect(await read<bigint>("Shop", shop, "boughtBy", [general, kemi])).toBe(4n);
    const r = await revertOf(BOB, "Shop", shop, "buyFor", [general, 1n, kemi], parseEther("0.001"));
    expect(r.name).toBe("WalletCapExceeded");
  });

  it("a nested multicall reverts with NestedBatch", async () => {
    const inner = data("Shop", "multicall", [[buy(general, 1n)]]);
    const r = await revertOf(TOBI, "Shop", shop, "multicall", [[buy(general, 1n), inner]], parseEther("0.002"));
    expect(r.name).toBe("NestedBatch");
  });

  it("a payout handler in a zero-value batch reverts with ExternalCallInBatch", async () => {
    const r = await revertOf(ADA, "Shop", shop, "multicall", [[data("Shop", "withdraw", [accounts[ADA]!.address])]]);
    expect(r.name).toBe("ExternalCallInBatch");
  });

  it("stray ETH to a zero-wei handler reverts with Unspent", async () => {
    const r = await revertOf(TOBI, "Shop", shop, "note", [label("hi")], 5n);
    expect(r).toEqual({ name: "Unspent", args: [5n] });
  });

  it("the till is clean after every transaction", async () => {
    const s = await read<{ left: bigint; batching: boolean; entries: bigint }>("Shop", shop, "tillState");
    expect(s).toEqual({ left: 0n, batching: false, entries: 0n });
  });

  it("a 50-entry batch fits in a block", async () => {
    const calls = Array.from({ length: 50 }, () => buy(shirt, 1n));
    const { receipt } = await write(BOB, "Shop", shop, "multicall", [calls], parseEther("0.0015") * 50n);
    expect(receipt.gasUsed).toBeLessThan(30_000_000n);
    expect(await read<bigint>("Shop", shop, "balanceOf", [accounts[BOB]!.address])).toBe(50n);
  });
});

describe("seller lifecycle: release, withdraw, cancel, refund", () => {
  let shop: Address;
  let item: bigint;
  beforeAll(async () => {
    ({ shop } = await freshShop());
    item = (await addItem(shop, parseEther("0.01"), 10n, { releaseIn: 3600n })).id;
    await write(ALICE, "Shop", shop, "buy", [item, 2n], parseEther("0.02"));
  });

  it("release before release_at reverts with TooEarly", async () => {
    expect((await revertOf(ADA, "Shop", shop, "release", [item])).name).toBe("TooEarly");
  });

  it("withdraw with nothing released reverts with NothingToWithdraw", async () => {
    expect((await revertOf(ADA, "Shop", shop, "withdraw", [accounts[ADA]!.address])).name).toBe("NothingToWithdraw");
  });

  it("after release_at (evm_increaseTime) the escrow is released and withdrawn", async () => {
    const { testClient } = await import("./env.ts");
    await testClient.increaseTime({ seconds: 3601 });
    await testClient.mine({ blocks: 1 });
    await write(ADA, "Shop", shop, "release", [item]);
    const b = await books(shop);
    expect(b.seller_available).toBe(parseEther("0.02"));
    const to = accounts[KEMI]!.address;
    const before = await client.getBalance({ address: to });
    const { receipt } = await write(ADA, "Shop", shop, "withdraw", [to]);
    expect(await client.getBalance({ address: to })).toBe(before + parseEther("0.02"));
    expect(events(receipt).some((e) => e.eventName === "Withdrawn")).toBe(true);
    expect((await books(shop)).balance).toBe(0n);
  });

  it("cancel then refund pays each holder exactly what they paid", async () => {
    const { shop: s2 } = await freshShop();
    const it2 = (await addItem(s2, parseEther("0.004"), 10n)).id;
    await write(TOBI, "Shop", s2, "buy", [it2, 1n], parseEther("0.004"));
    await write(ADA, "Shop", s2, "updateItem", [it2, parseEther("0.009"), 10n, 0n]);
    await write(BOB, "Shop", s2, "buy", [it2, 1n], parseEther("0.009"));
    await write(ADA, "Shop", s2, "cancel", [it2]);
    const tobiBefore = await client.getBalance({ address: accounts[TOBI]!.address });
    const r1 = await write(TOBI, "Shop", s2, "refund", [1n]);
    const gas1 = r1.receipt.gasUsed * r1.receipt.effectiveGasPrice;
    expect(await client.getBalance({ address: accounts[TOBI]!.address })).toBe(tobiBefore + parseEther("0.004") - gas1);
    await write(BOB, "Shop", s2, "refund", [2n]);
    const b = await books(s2);
    expect(b.total_escrow).toBe(0n);
    expect(b.balance).toBe(0n);
  });

  it("refund of a non-cancelled item reverts with NotRefundable", async () => {
    const { shop: s3 } = await freshShop();
    const i3 = (await addItem(s3, 1000n, 10n)).id;
    await write(TOBI, "Shop", s3, "buy", [i3, 1n], 1000n);
    expect((await revertOf(TOBI, "Shop", s3, "refund", [1n])).name).toBe("NotRefundable");
  });

  it("transfer ownership is two-step", async () => {
    const { shop: s4 } = await freshShop();
    await write(ADA, "Shop", s4, "transferOwnership", [accounts[KEMI]!.address]);
    expect(await read<Address>("Shop", s4, "owner")).toBe(accounts[ADA]!.address);
    expect((await revertOf(MALLORY, "Shop", s4, "acceptOwnership")).name).toBe("NotPendingOwner");
    await write(KEMI, "Shop", s4, "acceptOwnership");
    expect(await read<Address>("Shop", s4, "owner")).toBe(accounts[KEMI]!.address);
  });
});
