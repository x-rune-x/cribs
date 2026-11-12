import { describe, expect, it } from "vitest";
import { STANDARD_VARIANT } from "#engine";
import { resultsText } from "./share";
import type { GameView } from "./types/api";

const base: GameView = {
  id: "g",
  mode: "ranked",
  status: "won",
  puzzle: {
    id: "p",
    number: 17,
    kind: "daily",
    date: "2026-11-12",
    ciphertext: "UKKOGOOYKTVRUWVVGORGIX",
    cribs: ["DAWN", "MEET", "MILL", "THE"],
    difficulty: "easy",
    par: 3,
    variant: STANDARD_VARIANT,
    label: null,
  },
  known: {},
  locked: [],
  moves: 3,
  mistakes: 1,
  hints: 0,
  maxMistakes: 5,
  log: [
    { seq: 1, move: { kind: "lock", crib: "MEET", pos: 4 }, correct: false, reasons: [], hint: null, at: 0 },
    { seq: 2, move: { kind: "lock", crib: "MILL", pos: 12 }, correct: true, reasons: [], hint: null, at: 0 },
    { seq: 3, move: { kind: "lock", crib: "DAWN", pos: 18 }, correct: true, reasons: [], hint: null, at: 0 },
    { seq: 4, move: { kind: "lock", crib: "THE", pos: 6 }, correct: true, reasons: [], hint: null, at: 0 },
  ],
  finished: { text: "MEET AT THE OLD MILL AT DAWN", plaintext: "MEETATTHEOLDMILLATDAWN", score: 85, durationMs: 161_000 },
};

describe("resultsText", () => {
  it("summarises a game without spoilers", () => {
    const text = resultsText(base);
    expect(text).toBe(
      ["Crib daily No. 017 · Easy", "Solved in 3 moves (par 3) · 1 mistake · 0 hints", "Score 85 · 2:41", "🟥🟩🟩🟩"].join("\n"),
    );
    for (const spoiler of ["MEET", "MILL", "DAWN", "MEETATTHE", "UKKOG"]) expect(text).not.toContain(spoiler);
  });

  it("names Lab variants and leaves out par in blind mode", () => {
    const lab: GameView = {
      ...base,
      puzzle: { ...base.puzzle, kind: "lab", label: "Blind, decoy", variant: { ...STANDARD_VARIANT, feedback: "blind" } },
      log: [{ seq: 1, move: { kind: "hint" }, correct: null, reasons: [], hint: null, at: 0 }],
    };
    expect(resultsText(lab).split("\n").slice(0, 2)).toEqual(["Crib Lab No. 017 · Blind, decoy", "Solved · 1 mistake · 0 hints"]);
    expect(resultsText(lab)).toContain("💡");
  });

  it("reports a loss", () => {
    expect(resultsText({ ...base, status: "failed", mistakes: 5 })).toContain("Out of mistakes · 5 mistakes");
  });
});
