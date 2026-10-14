import { expect, test } from "@playwright/test";

test("judges can compare real-rule sample verdicts without a wallet", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/plainsign/review.html");
  await expect(page.getByText("Sample preview.", { exact: false })).toBeVisible();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Danger");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("4001");
  await page.getByRole("button", { name: "Verify wallet" }).click();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Danger");
  await page.getByRole("button", { name: "Sign in", exact: false }).click();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Safe");
  // The preview opens on Monad mainnet, so the wrap sample is labelled in MON/WMON.
  await page.getByRole("button", { name: "Wrap MON", exact: false }).click();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Safe");
  await expect(page.locator(".ps-network")).toContainText("chain 143");
  await page.getByLabel("Network", { exact: true }).selectOption("11155111");
  await expect(page.getByRole("button", { name: "Wrap ETH", exact: false })).toBeVisible();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Safe");
  await page.getByRole("button", { name: "Imitation WETH" }).click();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Caution");
  await expect(page.locator(".ps-summary")).toContainText("cannot identify");
  await page.getByText("Inspect this sample request", { exact: true }).click();
  await expect(page.getByLabel("Sample request JSON")).toContainText("0xd0e30db0");
  await expect(page.getByRole("link", { name: "Read the risk rules" })).toBeVisible();
  await page.getByRole("button", { name: "Unknown request" }).click();
  await expect(page.locator(".ps-verdict h1")).toHaveText("Caution");
  expect(await page.evaluate(() => Boolean(window.ethereum))).toBe(false);
});
