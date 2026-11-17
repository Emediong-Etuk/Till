// Gas benchmarks: Till vs the naive shop, per entry. Written to docs/gas.json.
import { describe, expect, it, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { parseEther } from "viem";
import { ADA, TOBI, accounts, addItem, buy, client, data, freshShop, rawSend, wallets, write } from "./env.ts";
import { deployContract } from "../scripts/lib/deploy.ts";
import { signCheckIn } from "../scripts/lib/checkin.ts";

const results: Record<string, unknown> = {};

afterAll(() => {
  writeFileSync(new URL("../docs/gas.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
});

describe("gas", () => {
  it("batched buys: Till vs naive, per entry", async () => {
    const { shop } = await freshShop();
    const item = (await addItem(shop, 1000n, 100000n)).id;
    const naive = (await deployContract(wallets[ADA]! as never, client as never, "NaiveShop", [accounts[ADA]!.address])).address;
    await write(ADA, "NaiveShop", naive, "addItem", [1000n, 100000n]);
    // Warm both (first mint touches cold slots that later ones do not).
    await write(TOBI, "Shop", shop, "buy", [item, 1n], 1000n);
    await write(TOBI, "NaiveShop", naive, "buy", [0n, 1n], 1000n);
    const rows: { entries: number; till: string; naive: string; tillPerEntry: string; naivePerEntry: string; overheadPerEntry: string }[] = [];
    for (const n of [1, 2, 5, 10, 20]) {
      const t = await rawSend(TOBI, shop, data("Shop", "multicall", [Array.from({ length: n }, () => buy(item, 1n))]), 1000n * BigInt(n));
      const v = await rawSend(TOBI, naive, data("NaiveShop", "multicall", [Array.from({ length: n }, () => data("NaiveShop", "buy", [0n, 1n]))]), 1000n);
      // The naive shop accepts one payment of 1000 for any number of entries (the bug).
      expect(t.status).toBe("success");
      expect(v.status).toBe("success");
      rows.push({
        entries: n,
        till: t.gasUsed.toString(),
        naive: v.gasUsed.toString(),
        tillPerEntry: (t.gasUsed / BigInt(n)).toString(),
        naivePerEntry: (v.gasUsed / BigInt(n)).toString(),
        overheadPerEntry: ((t.gasUsed - v.gasUsed) / BigInt(n)).toString(),
      });
    }
    results.batchedBuys = rows;
  });

  it("Till's own cost: TillProbe vs PlainProbe (same bookkeeping, no Till)", async () => {
    const till = (await deployContract(wallets[ADA]! as never, client as never, "TillProbe", [])).address;
    const plain = (await deployContract(wallets[ADA]! as never, client as never, "PlainProbe", [])).address;
    const dep = (c: string) => data(c, "deposit", [1000n]);
    // Warm the caller's balance slot in both.
    await rawSend(TOBI, till, dep("TillProbe"), 1000n);
    await rawSend(TOBI, plain, dep("PlainProbe"), 1000n);
    const rows: { entries: number; till: string; plain: string; tillOverhead: string; overheadPerEntry: string }[] = [];
    for (const n of [1, 2, 5, 10, 20, 50]) {
      const t = await rawSend(TOBI, till, data("TillProbe", "multicall", [Array.from({ length: n }, () => dep("TillProbe"))]), 1000n * BigInt(n));
      // PlainProbe double-counts: one payment of 1000 satisfies every entry.
      const p = await rawSend(TOBI, plain, data("PlainProbe", "multicall", [Array.from({ length: n }, () => dep("PlainProbe"))]), 1000n);
      expect(t.status).toBe("success");
      expect(p.status).toBe("success");
      rows.push({
        entries: n,
        till: t.gasUsed.toString(),
        plain: p.gasUsed.toString(),
        tillOverhead: (t.gasUsed - p.gasUsed).toString(),
        overheadPerEntry: ((t.gasUsed - p.gasUsed) / BigInt(n)).toString(),
      });
    }
    results.tillIsolated = rows;
  });

  it("direct buy vs one-entry batch", async () => {
    const { shop } = await freshShop();
    const item = (await addItem(shop, 1000n, 1000n)).id;
    await write(TOBI, "Shop", shop, "buy", [item, 1n], 1000n);
    const direct = await rawSend(TOBI, shop, buy(item, 1n), 1000n);
    const batched = await rawSend(TOBI, shop, data("Shop", "multicall", [[buy(item, 1n)]]), 1000n);
    results.directBuy = direct.gasUsed.toString();
    results.oneEntryBatch = batched.gasUsed.toString();
    expect(direct.status).toBe("success");
  });

  it("redeem (EIP-712 + ecrecover) and refund", async () => {
    const { shop } = await freshShop();
    const item = (await addItem(shop, parseEther("0.001"), 1000n)).id;
    await write(TOBI, "Shop", shop, "buy", [item, 2n], parseEther("0.002"));
    const deadline = (await client.getBlock()).timestamp + 600n;
    const sig = await signCheckIn(accounts[TOBI]!, await client.getChainId(), shop, 1n, deadline);
    const r = await write(ADA, "Shop", shop, "redeem", [1n, deadline, sig]);
    results.redeem = r.receipt.gasUsed.toString();
    await write(ADA, "Shop", shop, "cancel", [item]);
    const f = await write(TOBI, "Shop", shop, "refund", [2n]);
    results.refund = f.receipt.gasUsed.toString();
    expect(r.receipt.status).toBe("success");
  });

  it("deployment", async () => {
    const { factory } = await freshShop();
    const open = await write(ADA, "ShopFactory", factory, "open", [`0x${"41".repeat(1)}${"00".repeat(31)}`, `0x${"42".padEnd(64, "0")}`]);
    results.openShop = open.receipt.gasUsed.toString();
    expect(open.receipt.status).toBe("success");
  });
});
