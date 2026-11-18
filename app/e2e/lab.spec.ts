import { expect } from "@playwright/test";
import { fund, walletContext, test } from "./fixtures";

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

test("/lab stays runnable: repeated attacks restock a drained NaiveShop, and the loot can be put back", async ({ browser }) => {
  const { ctx, page } = await walletContext(browser);
  await page.goto("/lab");
  await fund(page);
  const attack = page.getByTestId("attack-naive");
  const result = page.getByTestId("lab-naive-result");
  // Each attack drains 0.004 ETH from a 0.009 ETH shop, so within three runs
  // the shop is too low for the refunds and must be restocked first.
  let restocked = false;
  for (let run = 0; run < 3; run++) {
    await expect(attack).toBeEnabled({ timeout: 60_000 });
    await attack.click();
    await expect(attack).toHaveText(/Running/);
    await expect(attack).not.toHaveText(/Running/, { timeout: 90_000 });
    await expect(result).toContainText("other buyers' money is now yours");
    if ((await result.innerText()).includes("restocked it first")) restocked = true;
  }
  expect(restocked).toBe(true);

  await page.getByTestId("restock-naive").click();
  await expect(result).toContainText("Put it back", { timeout: 60_000 });
  await expect(page.getByTestId("lab-naive-balance")).toHaveText("0.009 ETH");
  await ctx.close();
});
