import { expect, test } from "@playwright/test";
import { STANDARD_VARIANT } from "../src/engine";
import { GOLDEN_TEXT } from "../src/engine/fixtures/golden";
import { golden, importPuzzles, placeWithKeyboard } from "./helpers";

test.beforeAll(async ({ request }) => {
  const lab = (data: ReturnType<typeof golden>) => importPuzzles(request, { ...data, lab: true });
  await lab(golden("lab-blind", { variant: { ...STANDARD_VARIANT, feedback: "blind" }, par: 0 }));
  await lab(golden("lab-free", { variant: { ...STANDARD_VARIANT, words: "free" }, cribs: [], difficulty: "hard", positions: {} }));
  await lab(golden("lab-decoy", { variant: { ...STANDARD_VARIANT, decoy: true }, cribs: ["DAWN", "MEET", "MILL", "OAK", "THE"], difficulty: "hard" }));
});

test("lists the Lab puzzles", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Lab" })).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: "No." })).toHaveCount(3);
});

test("blind mode: places words unchecked, flags clashes, and checks only the submission", async ({ page }) => {
  await page.goto("/lab/lab-blind");
  await expect(page.getByText("Blind: placements aren't checked.")).toBeVisible();

  // A wrong placement isn't flagged as wrong, but it clashes with MILL once both are down.
  await placeWithKeyboard(page, "MEET", 5);
  await expect(page.getByText("MEET placed at 5. Nothing is checked until you submit.")).toBeVisible();
  await placeWithKeyboard(page, "MILL", 13);
  await expect(page.getByText("Your placements clash")).toBeVisible();
  await page.getByRole("button", { name: "Remove MEET from 5" }).click();
  await expect(page.getByText("Your placements clash")).toBeHidden();

  await placeWithKeyboard(page, "DAWN", 19);
  await placeWithKeyboard(page, "THE", 7);
  await page.getByRole("button", { name: "Submit decryption" }).click();
  await expect(page.getByRole("heading", { name: "Message decrypted" })).toBeVisible();
  await expect(page.getByText(GOLDEN_TEXT)).toBeVisible();
});

test("your own words: type a word, slide it and lock it", async ({ page }) => {
  await page.goto("/lab/lab-free");
  await expect(page.getByText("No word list")).toBeVisible();
  await placeWithKeyboard(page, "MOLE", 13, { type: true });
  await expect(page.getByText("MOLE at 13 is impossible")).toBeVisible();

  await placeWithKeyboard(page, "MILL", 13, { type: true });
  await expect(page.getByText("MILL locked at 13")).toBeVisible();
  await placeWithKeyboard(page, "DAWN", 19, { type: true });
  await placeWithKeyboard(page, "THEOLD", 7, { type: true });
  await expect(page.getByRole("heading", { name: "Message decrypted" })).toBeVisible();
});

test("decoy: one listed word isn't in the message", async ({ page }) => {
  await page.goto("/lab/lab-decoy");
  await expect(page.getByRole("heading", { name: "Words: one isn't in the message" })).toBeVisible();
  await placeWithKeyboard(page, "OAK", 10);
  await expect(page.getByText(/OAK (isn't at 10|at 10 is impossible)/)).toBeVisible();
});
