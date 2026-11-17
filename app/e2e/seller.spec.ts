import { expect } from "@playwright/test";
import { walletContext, fund, expectSuccess, test } from "./fixtures";

test("a seller creates a shop, adds 3 items in one tx, and gets a share link and poster", async ({ browser }) => {
  const { ctx, page } = await walletContext(browser);
  await page.goto("/");
  await fund(page);
  await page.getByTestId("cta-sell").click();
  await page.getByTestId("shop-name").fill("Playwright Meetup");
  await expect(page.getByTestId("predicted")).toContainText("0x");
  await page.getByTestId("create-shop").click();
  await expectSuccess(page, "Create shop");
  await expect(page).toHaveURL(/\/s\/0x[0-9a-fA-F]{40}\/admin\?setup=1/);
  await expect(page.getByTestId("admin-title")).toHaveText("Playwright Meetup");

  await page.getByTestId("add-items").click();
  await expectSuccess(page, "Add 3 items");
  await expect(page.getByTestId("admin-item-0")).toContainText("General admission");
  await expect(page.getByTestId("admin-item-2")).toContainText("Meetup T-shirt");

  await expect(page.getByTestId("share-link")).toContainText("/s/0x");
  const download = page.waitForEvent("download");
  await page.getByTestId("poster").click();
  expect((await download).suggestedFilename()).toMatch(/poster\.png$/);
  await ctx.close();
});
