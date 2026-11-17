import { expect, test } from "@playwright/test";
import { expectSuccess, fund, walletContext } from "./fixtures";

test("seller withdraws, cancels an item, and the buyer refunds 100% from a banner", async ({ browser }) => {
  // Fresh shop owned by this test's seller burner.
  const s = await walletContext(browser);
  await s.page.goto("/new");
  await fund(s.page);
  await s.page.getByTestId("shop-name").fill("Refund Test Shop");
  await s.page.getByTestId("create-shop").click();
  await expect(s.page).toHaveURL(/admin\?setup=1/, { timeout: 60_000 });
  await s.page.getByTestId("add-items").click();
  await expectSuccess(s.page, "Add 3 items");
  const shopUrl = s.page.url().replace(/\/admin.*$/, "");

  const b = await walletContext(browser);
  await b.page.goto(shopUrl);
  await fund(b.page);
  await b.page.getByTestId("add-0").click();
  await b.page.getByTestId("add-1").click();
  await b.page.getByTestId("tip-0.001").click();
  await b.page.getByTestId("review").click();
  await b.page.getByTestId("pay").click();
  await expect(b.page.getByTestId("checkout-done")).toBeVisible({ timeout: 60_000 });

  // Tips are withdrawable at once.
  await s.page.reload();
  await expect(s.page.getByTestId("available")).toContainText("0.001 ETH");
  await s.page.getByTestId("withdraw").click();
  await expectSuccess(s.page, /Withdraw/);
  await expect(s.page.getByTestId("available")).toContainText("0 ETH");

  // Cancel the VIP item: its holder sees a refund banner.
  s.page.once("dialog", (d) => void d.accept());
  await s.page.getByTestId("cancel-1").click();
  await expectSuccess(s.page, "Cancel item");
  await expect(s.page.getByTestId("status-1")).toHaveText("Cancelled");

  await b.page.goto("/passes");
  const banner = b.page.locator('[data-testid^="refund-banner-"]');
  await expect(banner).toHaveCount(1, { timeout: 60_000 });
  await banner.getByRole("button", { name: "Refund 100%" }).click();
  await expectSuccess(b.page, /Refund pass/);
  await expect(b.page.locator('[data-testid^="refund-banner-"]')).toHaveCount(0, { timeout: 60_000 });
  await s.ctx.close();
  await b.ctx.close();
});
