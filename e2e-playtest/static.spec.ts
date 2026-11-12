import { expect, test } from "@playwright/test";
import { GOLDEN_TEXT } from "../src/engine/fixtures/golden";
import { placeWithKeyboard } from "../e2e/helpers";

test("plays the golden daily puzzle to a win entirely in the browser", async ({ page, context }) => {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiCalls.push(request.url());
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("./");
  await expect(page.getByText("Daily · No. 001 · Easy · Par 3")).toBeVisible();
  await placeWithKeyboard(page, "MEET", 5);
  await expect(page.getByText("MEET isn't at 5. Mistake 1 of 5.")).toBeVisible();
  await placeWithKeyboard(page, "MILL", 13);
  await expect(page.getByText("MILL locked at 13")).toBeVisible();
  await placeWithKeyboard(page, "DAWN", 19);
  await placeWithKeyboard(page, "THE", 7);
  await expect(page.getByRole("heading", { name: "Message decrypted" })).toBeVisible();
  await expect(page.getByText(GOLDEN_TEXT)).toBeVisible();

  await page.getByRole("button", { name: "Copy results" }).click();
  await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Crib daily No. 001 · Easy");
  expect(copied).toContain("🟥🟩🟩🟩");
  expect(copied).not.toContain("MILL");

  // The game is saved in the browser.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Message decrypted" })).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test("serves practice and Lab puzzles, including links straight to a puzzle", async ({ page }) => {
  await page.goto("practice");
  await expect(page.getByRole("link").filter({ hasText: "No." })).toHaveCount(12);

  await page.goto("lab");
  await expect(page.getByRole("link").filter({ hasText: "No." })).toHaveCount(27);
  await page.getByRole("link").filter({ hasText: "Blind ·" }).first().click();
  await expect(page.getByText(/^Lab · No\. \d+ · Blind$/)).toBeVisible();

  // GitHub Pages serves 404.html for a deep link; the app must still load the puzzle.
  await page.reload();
  await expect(page.getByText(/^Lab · No\. \d+ · Blind$/)).toBeVisible();
  await expect(page.getByText("Blind: placements aren't checked.")).toBeVisible();
});
