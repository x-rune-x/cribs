import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LAB_VARIANTS, parseKey, parseMessages, verifyPuzzle } from "../../src/engine";
import { addDays } from "../../shared/dates";
import { buildPlaytestSet } from "./playtest-set";

const sentences = parseMessages(readFileSync(new URL("../../content/messages.txt", import.meta.url), "utf8"));
const lists = parseMessages(readFileSync(new URL("../../content/lab-messages.txt", import.meta.url), "utf8"));
const options = { seed: "test", start: "2026-11-12", days: 5, practice: 3, perVariant: 1 };

describe("buildPlaytestSet", () => {
  const set = buildPlaytestSet(sentences, lists, options);

  it("schedules one daily puzzle per day from the start date", () => {
    const dates = set.puzzles.filter((p) => p.kind === "daily").map((p) => p.date);
    expect(dates).toEqual([0, 1, 2, 3, 4].map((d) => addDays("2026-11-12", d)));
  });

  it("includes practice puzzles and one Lab puzzle per variant", () => {
    expect(set.puzzles.filter((p) => p.kind === "practice")).toHaveLength(3);
    expect(set.puzzles.filter((p) => p.kind === "lab").map((p) => p.label)).toEqual(LAB_VARIANTS.map((v) => v.label));
  });

  it("never uses a message twice", () => {
    const texts = set.puzzles.map((p) => p.solution.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("numbers puzzles uniquely and only ships verified puzzles", () => {
    expect(set.puzzles.map((p) => p.number)).toEqual(set.puzzles.map((_, i) => i + 1));
    expect(new Set(set.puzzles.map((p) => p.id)).size).toBe(set.puzzles.length);
    for (const p of set.puzzles) {
      const solution = { plaintext: p.solution.plaintext, positions: p.solution.positions, key: parseKey(p.solution.key) };
      expect(verifyPuzzle(p, solution, p.solution.text), p.solution.text).toBeNull();
    }
  });

  it("gives the same puzzles for the same options", () => {
    const again = buildPlaytestSet(sentences, lists, options);
    expect(again.puzzles).toEqual(set.puzzles);
  });

  it("keeps earlier daily puzzles when more days are added", () => {
    const longer = buildPlaytestSet(sentences, lists, { ...options, days: 8 });
    const daily = (s: typeof set) => s.puzzles.filter((p) => p.kind === "daily").slice(0, 5).map((p) => [p.id, p.date]);
    expect(daily(longer)).toEqual(daily(set));
  });

  it("can put the golden puzzle first, for end-to-end tests", () => {
    const withGolden = buildPlaytestSet(sentences, lists, { ...options, golden: true });
    expect(withGolden.puzzles[0]).toMatchObject({ kind: "daily", date: "2026-11-12", ciphertext: "UKKOGOOYKTVRUWVVGORGIX" });
  });
});
