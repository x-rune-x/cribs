import { describe, expect, it } from "vitest";
import { GOLDEN_CIPHERTEXT, goldenPuzzle } from "./fixtures/golden";
import { grade } from "./grader";
import { reasoningLevel } from "./solver";

describe("grade", () => {
  it("rates the golden puzzle Easy with par 3", () => {
    const result = grade(goldenPuzzle);
    expect(result?.difficulty).toBe("easy");
    expect(result?.par).toBe(3);
    expect(result?.path).toHaveLength(3);
  });

  it("keeps the golden puzzle Easy with OLD added", () => {
    const result = grade({ ciphertext: GOLDEN_CIPHERTEXT, cribs: ["DAWN", "MEET", "MILL", "OLD", "THE"] });
    expect(result?.difficulty).toBe("easy");
    expect(result?.par).toBeLessThanOrEqual(3);
  });

  it("returns null when logic alone can't finish the puzzle", () => {
    // THE on its own has ten legal spots and nothing to choose between them.
    expect(grade({ ciphertext: GOLDEN_CIPHERTEXT, cribs: ["THE"] })).toBeNull();
  });
});

describe("reasoningLevel", () => {
  it("uses L2 for Easy and Medium puzzles and L3 for Hard ones", () => {
    expect(reasoningLevel("easy")).toBe(2);
    expect(reasoningLevel("medium")).toBe(2);
    expect(reasoningLevel("hard")).toBe(3);
  });
});
