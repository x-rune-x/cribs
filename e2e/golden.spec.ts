import { expect, test } from "@playwright/test";
import { formatKey } from "../src/engine";
import { GOLDEN_KEY, GOLDEN_TEXT, goldenSolution } from "../src/engine/fixtures/golden";
import { localDateString } from "../shared/dates";
import { golden, importPuzzles, placeWithKeyboard as lockWithKeyboard } from "./helpers";

test.beforeAll(async ({ request }) => {
  // The golden puzzle as today's daily. Re-importing is a no-op, so every project can do this.
  await importPuzzles(request, { ...golden("golden"), daily: { count: 1, from: localDateString() } });
});

test("plays the golden puzzle to a win", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Daily · No. 001 · Easy · Par 3")).toBeVisible();

  await lockWithKeyboard(page, "MILL", 13);
  await expect(page.getByText("MILL locked at 13")).toBeVisible();
  await expect(page.getByRole("button", { name: "MILL, locked at 13" })).toBeDisabled();

  await lockWithKeyboard(page, "DAWN", 19);
  await expect(page.getByText("DAWN locked at 19")).toBeVisible();

  await lockWithKeyboard(page, "THE", 7);
  await expect(page.getByRole("heading", { name: "Message decrypted" })).toBeVisible();
  await expect(page.getByText(GOLDEN_TEXT)).toBeVisible();
  const stats = page.locator("dl");
  await expect(stats.getByText("Score")).toBeVisible();
  await expect(stats.locator("dd").first()).toHaveText("100");
  await expect(stats.getByText("on par")).toBeVisible();
});

test("counts a wrong placement as a mistake and keeps the game across reloads", async ({ page }) => {
  await page.goto("/");
  await lockWithKeyboard(page, "MEET", 5);
  await expect(page.getByText("MEET isn't at 5. Mistake 1 of 5.")).toBeVisible();

  await lockWithKeyboard(page, "MILL", 13);
  await expect(page.getByText("MILL locked at 13")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "MILL, locked at 13" })).toBeVisible();
  await expect(page.getByText("1 of 5", { exact: true })).toBeAttached();
});

test("starts a newly picked word clear of locked words", async ({ page }) => {
  await page.goto("/");
  await lockWithKeyboard(page, "MEET", 1);
  await expect(page.getByText("MEET locked at 1")).toBeVisible();

  await page.getByRole("button", { name: "THE", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Position of THE" })).toHaveAttribute("aria-valuenow", "5");
  await expect(page.getByRole("button", { name: "Lock THE at 5" })).toBeVisible();
});

test("never sends the solution before the game ends", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/")) bodies.push(await response.text().catch(() => ""));
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "MILL", exact: true })).toBeVisible();
  await lockWithKeyboard(page, "MILL", 13);
  await expect(page.getByText("MILL locked at 13")).toBeVisible();
  const all = bodies.join("\n");
  expect(all).not.toContain(goldenSolution.plaintext);
  expect(all).not.toContain(GOLDEN_TEXT);
  expect(all).not.toContain(formatKey(GOLDEN_KEY));
});
