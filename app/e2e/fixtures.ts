import { type Browser, type BrowserContext, type Page, expect, test as base } from "@playwright/test";
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

/**
 * Make `page.goto` and `page.reload` wait until React has hydrated the page
 * (`<html data-hydrated>`), so a test never types into or clicks an element
 * before its handlers exist. Cold dev-server routes made this a real race.
 */
export function hydrating(page: Page): Page {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  const ready = () => page.waitForSelector("html[data-hydrated]", { state: "attached", timeout: 60_000 });
  page.goto = async (...args: Parameters<Page["goto"]>) => {
    const r = await goto(...args);
    await ready();
    return r;
  };
  page.reload = async (...args: Parameters<Page["reload"]>) => {
    const r = await reload(...args);
    await ready();
    return r;
  };
  return page;
}

/** `test` whose built-in `page` waits for hydration after navigating. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await use(hydrating(page));
  },
});

/** A browser context whose burner wallet is `key` (fresh if omitted). */
export async function walletContext(browser: Browser, key: Hex = generatePrivateKey()): Promise<{ ctx: BrowserContext; page: Page; key: Hex; address: Address }> {
  const ctx = await browser.newContext();
  await ctx.addInitScript((k) => {
    if (!window.localStorage.getItem("till.burner.v1")) window.localStorage.setItem("till.burner.v1", JSON.stringify(k));
  }, key);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = hydrating(await ctx.newPage());
  return { ctx, page, key, address: privateKeyToAccount(key).address };
}

export async function fund(page: Page) {
  // On a cold dev server the first click can land before hydration attaches
  // the handler, so open the wallet menu until it is actually open.
  const menu = page.getByTestId("wallet-menu");
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByTestId("wallet-button").click();
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
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
