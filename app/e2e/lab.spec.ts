import { expect, test } from "@playwright/test";
import { fund, walletContext } from "./fixtures";

test("/lab: the attack drains NaiveShop and reverts with Overspend on the Till shop", async ({ browser }) => {
  const { ctx, page } = await walletContext(browser);
  await page.goto("/lab");
  await fund(page);
  const before = await page.getByTestId("lab-naive-balance").innerText();
  await page.getByTestId("attack-naive").click();
  await expect(page.getByTestId("lab-naive-result")).toContainText("other buyers' money is now yours", { timeout: 90_000 });
  await expect(page.getByTestId("lab-naive-balance")).not.toHaveText(before);

  const tillBefore = await page.getByTestId("lab-till-balance").innerText();
  await page.getByTestId("attack-till").click();
  await expect(page.getByTestId("lab-till-result")).toContainText("Overspend");
  await expect(page.getByTestId("lab-till-result")).toContainText("Nothing was charged");
  await expect(page.getByTestId("lab-till-balance")).toHaveText(tillBefore);
  await ctx.close();
});
