import { expect } from "@playwright/test";
import { hydrating, test } from "./fixtures";

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
  const page = hydrating(await ctx.newPage());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("counted");
  await expect(page.getByText("249", { exact: true })).toBeVisible();
  await page.getByTestId("simulate").click();
  await expect(page.getByTestId("simulator")).toContainText("Paid once, delivered five times", { timeout: 10_000 });
  expect(errors, "no hydration or runtime errors").toEqual([]);
  await ctx.close();
});
