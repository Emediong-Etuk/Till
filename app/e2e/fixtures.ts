import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const json = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const deployment = json("../lib/deployments/local.json");
const shopAbi = json("../lib/abi/Shop.json");

export const SELLER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex; // anvil 0 = deployer
export const DEMO_SHOP = (deployment as { demoShop: { address: Address } }).demoShop.address;
export const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });
export const client = createPublicClient({ chain, transport: http() });
export const seller = createWalletClient({ account: privateKeyToAccount(SELLER_KEY), chain, transport: http() });

/** A browser context whose burner wallet is `key` (fresh if omitted). */
export async function walletContext(browser: Browser, key: Hex = generatePrivateKey()): Promise<{ ctx: BrowserContext; page: Page; key: Hex; address: Address }> {
  const ctx = await browser.newContext();
  await ctx.addInitScript((k) => {
    if (!window.localStorage.getItem("till.burner.v1")) window.localStorage.setItem("till.burner.v1", JSON.stringify(k));
  }, key);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await ctx.newPage();
  return { ctx, page, key, address: privateKeyToAccount(key).address };
}

export async function fund(page: Page) {
  await page.getByTestId("wallet-button").click();
  await page.getByTestId("faucet-button").click();
  await expect(page.getByText("Test ETH received")).toBeVisible();
  await page.getByTestId("wallet-button").click();
}

export async function expectSuccess(page: Page, title: string | RegExp) {
  await expect(page.getByTestId("toast-success").filter({ hasText: title }).first()).toBeVisible({ timeout: 60_000 });
}

export async function shopItemPrice(shop: Address, item: bigint): Promise<bigint> {
  const it = (await client.readContract({ address: shop, abi: shopAbi as never, functionName: "itemOf", args: [item] })) as { price: bigint };
  return it.price;
}

export { shopAbi };
