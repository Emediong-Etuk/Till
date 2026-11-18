import { expect } from "@playwright/test";
import { DEMO_SHOP, test } from "./fixtures";

for (const path of ["/", `/s/${DEMO_SHOP}`, "/lab", "/passes", "/new"]) {
  test(`mobile: ${path} fits the screen`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${path.replace(/\W+/g, "_") || "home"}.png`), fullPage: true });
  });
}

test("mobile: tap targets in the cart are at least 44px", async ({ page }) => {
  await page.goto(`/s/${DEMO_SHOP}`);
  const plus = page.getByTestId("add-0");
  await expect(plus).toBeVisible();
  const box = await plus.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
});
