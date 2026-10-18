import { describe, expect, it } from "vitest";
import { SCORING, score } from "./scoring";

const won = (moves: number, mistakes = 0, hints = 0) =>
  ({ status: "won", moves, mistakes, hints }) as const;

describe("score", () => {
  it("gives 100 for a clean game at par", () => {
    expect(score(won(3), 3)).toBe(100);
  });

  it("rewards beating par, with no ceiling by default", () => {
    expect(score(won(2), 3)).toBe(105);
    expect(SCORING.max).toBeNull();
  });

  it("charges for moves over par, mistakes and hints", () => {
    expect(score(won(4), 3)).toBe(97);
    expect(score(won(3, 1, 1), 3)).toBe(75);
  });

  it("never goes below 0", () => {
    expect(score(won(3, 4, 6), 3)).toBe(0);
  });

  it("scores a failed game 0", () => {
    expect(score({ status: "failed", moves: 2, mistakes: 5, hints: 0 }, 3)).toBe(0);
  });

  it("can be tuned with a different config", () => {
    expect(score(won(1), 3, { ...SCORING, max: 100 })).toBe(100);
    expect(score(won(3, 1), 3, { ...SCORING, perMistake: 20 })).toBe(80);
  });
});
