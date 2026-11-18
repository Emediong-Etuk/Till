import { expect } from "@playwright/test";
import { DEMO_SHOP, SELLER_KEY, expectSuccess, fund, walletContext, test } from "./fixtures";

test("check-in: the holder's signed code is verified at the door, redeemed once, then shows as used", async ({ browser }) => {
  const buyer = await walletContext(browser);
  await buyer.page.goto(`/s/${DEMO_SHOP}`);
  await fund(buyer.page);
  await buyer.page.getByTestId("add-0").click();
  await buyer.page.getByTestId("review").click();
  await buyer.page.getByTestId("pay").click();
  await expect(buyer.page.getByTestId("checkout-done")).toBeVisible({ timeout: 60_000 });
  await buyer.page.goto("/passes");
  const pass = buyer.page.locator('[data-testid^="pass-"]').first();
  await pass.getByRole("button").first().click();
  await pass.getByText("Can't scan? Copy the code").click();
  const code = await pass.getByTestId("checkin-code").inputValue();
  expect(JSON.parse(code).v).toBe(1);

  const door = await walletContext(browser, SELLER_KEY);
  await door.page.goto(`/s/${DEMO_SHOP}/door`);
  await door.page.getByTestId("paste-code").fill(code);
  await door.page.getByTestId("check-code").click();
  await expect(door.page.getByTestId("verdict-ok")).toContainText("Valid");
  await door.page.getByTestId("redeem").click();
  await expectSuccess(door.page, /Check in pass/);
  await expect(door.page.getByTestId("verdict-message")).toContainText("Welcome");

  // The same code again: already used, instantly.
  await door.page.getByTestId("paste-code").fill(code);
  await door.page.getByTestId("check-code").click();
  await expect(door.page.getByTestId("verdict-message")).toContainText("already used");

  // The buyer's pass now shows as used.
  await buyer.page.reload();
  await expect(buyer.page.locator('[data-testid^="pass-"]').first()).toContainText("Used");
  await buyer.ctx.close();
  await door.ctx.close();
});

test("the door rejects a code for another shop and garbage", async ({ browser }) => {
  const door = await walletContext(browser, SELLER_KEY);
  await door.page.goto(`/s/${DEMO_SHOP}/door`);
  const other = JSON.stringify({ v: 1, chainId: 31337, shop: "0x000000000000000000000000000000000000dead", pass: "1", deadline: "99999999999", sig: "0x00" });
  await door.page.getByTestId("paste-code").fill(other);
  await door.page.getByTestId("check-code").click();
  await expect(door.page.getByTestId("verdict-message")).toContainText("different shop");
  await door.page.getByTestId("paste-code").fill("hello");
  await door.page.getByTestId("check-code").click();
  await expect(door.page.getByTestId("verdict-message")).toContainText("isn't a Till pass code");
  await door.ctx.close();
});
