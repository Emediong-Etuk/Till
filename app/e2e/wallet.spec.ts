import { expect } from "@playwright/test";
import { walletContext, fund, client, hydrating, test } from "./fixtures";
import type { Address } from "viem";

test("a burner wallet is created silently and survives a reload", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = hydrating(await ctx.newPage());
  await page.goto("/");
  await expect(page.getByTestId("wallet-button")).toContainText("0x");
  await page.getByTestId("wallet-button").click();
  const address = await page.getByTestId("wallet-address").innerText();
  expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  await page.reload();
  await page.getByTestId("wallet-button").click();
  await expect(page.getByTestId("wallet-address")).toHaveText(address);
  await expect(page.getByRole("note").first()).toContainText("test ETH");
  await ctx.close();
});

test("the faucet funds the burner in one tap", async ({ browser }) => {
  const { ctx, page, address } = await walletContext(browser);
  await page.goto("/");
  await fund(page);
  expect(await client.getBalance({ address: address as Address })).toBeGreaterThanOrEqual(10n ** 16n);
  await expect(page.getByTestId("wallet-balance")).not.toHaveText("0 ETH");
  await ctx.close();
});

test("the faucet refuses a wallet that already has enough", async ({ browser }) => {
  const { ctx, page, address } = await walletContext(browser);
  await page.goto("/");
  await fund(page);
  const r = await page.request.post("/api/faucet", { data: { address, chainId: 31337 } });
  expect(r.status()).toBe(429);
  const wrongChain = await page.request.post("/api/faucet", { data: { address, chainId: 1 } });
  expect(wrongChain.status()).toBe(400);
  const junk = await page.request.post("/api/faucet", { data: { address: "0x123", chainId: 31337 } });
  expect(junk.status()).toBe(400);
  await ctx.close();
});
