import { expect } from "@playwright/test";
import { formatEther, parseEther, type Address } from "viem";
import { DEMO_SHOP, client, expectSuccess, fund, seller, shopAbi, shopItemPrice, walletContext, test } from "./fixtures";

test("Tobi buys 2 tickets, a shirt and a tip with one tap and sees his passes", async ({ browser }) => {
  const { ctx, page, address } = await walletContext(browser);
  await page.goto(`/s/${DEMO_SHOP}`);
  await expect(page.getByTestId("shop-title")).toHaveText("Uyo Dev Meetup");
  await fund(page);
  await page.getByTestId("add-0").click();
  await page.getByTestId("add-0").click();
  await page.getByTestId("add-2").click();
  await page.getByTestId("tip-0.0005").click();
  await page.getByTestId("review").click();
  const general = await shopItemPrice(DEMO_SHOP, 0n);
  const shirt = await shopItemPrice(DEMO_SHOP, 2n);
  const total = general * 2n + shirt + parseEther("0.0005");
  await expect(page.getByTestId("receipt-total")).toHaveText(`${formatEther(total)} ETH`);
  await expect(page.getByTestId("receipt")).toContainText("2 × General admission");
  const shopBefore = await client.getBalance({ address: DEMO_SHOP });
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("checkout-done")).toBeVisible({ timeout: 60_000 });
  expect(await client.getBalance({ address: DEMO_SHOP })).toBe(shopBefore + total);
  const held = (await client.readContract({ address: DEMO_SHOP, abi: shopAbi as never, functionName: "balanceOf", args: [address] })) as bigint;
  expect(held).toBe(3n);

  await page.getByRole("link", { name: "Open my passes" }).click();
  await expect(page.locator('[data-testid^="pass-"]')).toHaveCount(3);
  await ctx.close();
});

test("a stale price is caught before sending and mapped to plain language", async ({ browser }) => {
  // The seller raises the price after the buyer filled the cart: the app
  // re-simulates, and the decoded Overspend becomes "Refresh prices".
  const { ctx, page } = await walletContext(browser);
  await page.goto(`/s/${DEMO_SHOP}`);
  await fund(page);
  await page.getByTestId("add-1").click();
  await page.getByTestId("review").click();
  const old = await shopItemPrice(DEMO_SHOP, 1n);
  const item = (await client.readContract({ address: DEMO_SHOP, abi: shopAbi as never, functionName: "itemOf", args: [1n] })) as { supply: bigint; max_per_wallet: bigint };
  const hash = await seller.writeContract({ address: DEMO_SHOP as Address, abi: shopAbi as never, functionName: "updateItem", args: [1n, old + 1n, item.supply, item.max_per_wallet] });
  await client.waitForTransactionReceipt({ hash });
  await page.getByTestId("pay").click();
  const err = page.getByTestId("toast-error").first();
  await expect(err).toContainText("more than was sent");
  await expect(err.getByRole("button", { name: "Refresh prices" })).toBeVisible();
  // Put the price back for the other specs.
  const back = await seller.writeContract({ address: DEMO_SHOP as Address, abi: shopAbi as never, functionName: "updateItem", args: [1n, old, item.supply, item.max_per_wallet] });
  await client.waitForTransactionReceipt({ hash: back });
  await ctx.close();
});

test("a gift sends the passes to another address", async ({ browser }) => {
  const { ctx, page } = await walletContext(browser);
  const friend = "0x000000000000000000000000000000000000f00d" as Address;
  await page.goto(`/s/${DEMO_SHOP}`);
  await fund(page);
  await page.getByTestId("add-0").click();
  await page.getByTestId("gift").fill(friend);
  await page.getByTestId("review").click();
  await expect(page.getByTestId("receipt")).toContainText(friend);
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("checkout-done")).toBeVisible({ timeout: 60_000 });
  const n = (await client.readContract({ address: DEMO_SHOP, abi: shopAbi as never, functionName: "balanceOf", args: [friend] })) as bigint;
  expect(n).toBeGreaterThanOrEqual(1n);
  await ctx.close();
});
