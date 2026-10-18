import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { ENGINE_VERSION } from "./config";
import { GOLDEN_CIPHERTEXT, goldenPuzzle, goldenSolution } from "./fixtures/golden";
import type { Move, PublicPuzzle, Solution } from "./state";

const lock = (crib: string, pos: number): Move => ({ kind: "lock", crib, pos });

describe("analyse", () => {
  it("rates a clean game move by move", () => {
    const analysis = analyse(goldenPuzzle, goldenSolution, [
      lock("MILL", 12),
      lock("MEET", 0),
      lock("DAWN", 18),
      lock("THE", 6),
    ]);
    expect(analysis.engineVersion).toBe(ENGINE_VERSION);
    expect(analysis.steps.map((s) => s.rating)).toEqual(["best", "good", "best", "best"]);
    expect(analysis.steps[0]?.explanation).toBe(
      "MILL only fits at 13: every other spot breaks a rule.",
    );
    expect(analysis.summary).toMatchObject({
      status: "won",
      score: 97,
      moves: 4,
      par: 3,
      mistakes: 0,
      hints: 0,
      leaps: 0,
    });
    expect(analysis.summary.cribbotPath).toHaveLength(3);
  });

  it("records the state before each move and Cribbot's best move there", () => {
    const analysis = analyse(goldenPuzzle, goldenSolution, [lock("MILL", 12), lock("MEET", 0)]);
    const second = analysis.steps[1]!;
    expect(second.before.locked).toEqual([{ crib: "MILL", pos: 12 }]);
    expect(second.before.known).toContainEqual(["M", "U"]);
    expect(second.best).toEqual({ kind: "lock", crib: "DAWN", pos: 18, level: 1 });
    expect(analysis.summary.status).toBe("playing");
  });

  it("explains a mistake the rules already ruled out", () => {
    const analysis = analyse(goldenPuzzle, goldenSolution, [lock("MEET", 0), lock("THE", 8)]);
    expect(analysis.steps[1]).toMatchObject({
      rating: "mistake",
      correct: false,
      explanation: "THE at 9 was ruled out: T would pair with K, but you already had T⇄O.",
    });
  });

  it("explains a mistake that deeper logic ruled out", () => {
    const analysis = analyse(goldenPuzzle, goldenSolution, [lock("MEET", 4)]);
    expect(analysis.steps[0]?.explanation).toBe(
      "MEET at 5 was ruled out: it would leave MILL with nowhere to go.",
    );
  });

  it("explains a declared swap that clashed with a known one", () => {
    const analysis = analyse(goldenPuzzle, goldenSolution, [lock("MILL", 12), { kind: "swap", a: "U", b: "E" }]);
    expect(analysis.steps[1]?.explanation).toBe("U⇄E was ruled out: U was already paired with M.");
  });

  it("records hints", () => {
    const analysis = analyse(goldenPuzzle, goldenSolution, [{ kind: "hint" }, lock("MILL", 12)]);
    expect(analysis.steps[0]?.rating).toBe("hint");
    expect(analysis.steps[0]?.explanation).toBe(
      "Cribbot's hint: MILL only fits at 13: every other spot breaks a rule.",
    );
    expect(analysis.summary.hints).toBe(1);
  });

  describe("on a puzzle that crib logic can't finish", () => {
    // Just MILL and THE: MILL is forced, THE has several spots.
    const puzzle: PublicPuzzle = { ciphertext: GOLDEN_CIPHERTEXT, cribs: ["MILL", "THE"], difficulty: "easy", par: 0 };
    const solution: Solution = { ...goldenSolution, positions: { MILL: 12, THE: 6 } };

    it("calls a correct but unprovable move a leap", () => {
      const analysis = analyse(puzzle, solution, [{ kind: "swap", a: "D", b: "R" }]);
      expect(analysis.steps[0]?.rating).toBe("leap");
      expect(analysis.summary.leaps).toBe(1);
    });

    it("says when a wrong move wasn't ruled out yet", () => {
      const analysis = analyse(puzzle, solution, [lock("THE", 2)]);
      expect(analysis.steps[0]).toMatchObject({
        rating: "mistake",
        explanation: "THE isn't at 3, though nothing you knew ruled it out yet.",
      });
    });
  });
});
