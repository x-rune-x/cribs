import { type APIRequestContext, type Page, expect } from "@playwright/test";
import { type Variant, formatKey } from "../src/engine";
import { GOLDEN_KEY, GOLDEN_TEXT, goldenPuzzle, goldenSolution } from "../src/engine/fixtures/golden";
import type { ImportRequest } from "../shared/types/api";
import { E2E_ADMIN_TOKEN } from "./env";

export async function importPuzzles(request: APIRequestContext, data: ImportRequest) {
  const response = await request.post("/api/admin/puzzles", {
    headers: { authorization: `Bearer ${E2E_ADMIN_TOKEN}` },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** The golden puzzle, optionally as a Lab puzzle with other rules. Re-importing is a no-op. */
export function golden(id: string, overrides: { variant?: Variant; cribs?: string[]; difficulty?: "easy" | "medium" | "hard"; par?: number; positions?: Record<string, number> } = {}): Pick<ImportRequest, "puzzles" | "solutions"> {
  return {
    puzzles: [
      {
        id,
        ciphertext: goldenPuzzle.ciphertext,
        cribs: overrides.cribs ?? [...goldenPuzzle.cribs],
        difficulty: overrides.difficulty ?? "easy",
        par: overrides.par ?? goldenPuzzle.par,
        length: goldenPuzzle.ciphertext.length,
        ...(overrides.variant ? { variant: overrides.variant, label: "Test" } : {}),
      },
    ],
    solutions: [
      {
        id,
        text: GOLDEN_TEXT,
        plaintext: goldenSolution.plaintext,
        positions: overrides.positions ?? { ...goldenSolution.positions },
        key: formatKey(GOLDEN_KEY),
        seed: "golden",
      },
    ],
  };
}

/** Picks a word (or types one, with your own words), slides it to a 1-based spot with the arrow keys and presses Enter. */
export async function placeWithKeyboard(page: Page, word: string, spot: number, options: { type?: boolean } = {}) {
  if (options.type) {
    await page.getByLabel("A word you think is in the message").fill(word);
    await page.getByRole("button", { name: "Slide it" }).click();
  } else {
    await page.getByRole("button", { name: word, exact: true }).click();
  }
  const slider = page.getByRole("slider", { name: `Position of ${word}` });
  const start = Number(await slider.getAttribute("aria-valuenow"));
  const key = spot > start ? "ArrowRight" : "ArrowLeft";
  // Move focus off the text box so the arrow keys reach the game.
  if (options.type) await slider.focus();
  for (let i = 0; i < Math.abs(spot - start); i++) await page.keyboard.press(key);
  await expect(page.getByRole("button", { name: new RegExp(`^(Lock|Place) ${word} at ${spot}$`) })).toBeVisible();
  await page.keyboard.press("Enter");
}
