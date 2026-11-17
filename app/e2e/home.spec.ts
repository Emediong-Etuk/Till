import { expect, test } from "@playwright/test";

test("home simulator: std multicall delivers five passes for one payment, Till reverts", async ({ page }) => {
  await page.goto("/");
  const sim = page.getByTestId("simulator");
  await sim.getByRole("tab", { name: "std multicall" }).click();
  await page.getByTestId("simulate").click();
  await expect(sim).toContainText("Paid once, delivered five times", { timeout: 10_000 });
  await expect(sim).toContainText("Passes delivered: 5");
  await sim.getByRole("tab", { name: "Till" }).click();
  await page.getByTestId("simulate").click();
  await expect(sim).toContainText("Reverted with Overspend", { timeout: 10_000 });
  await expect(sim).toContainText("Passes delivered: 0");
});

test("reduced motion: the page still renders its content", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("counted");
  await page.getByTestId("simulate").click();
  await expect(page.getByTestId("simulator")).toContainText("Paid once, delivered five times", { timeout: 10_000 });
  await ctx.close();
});
