import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyKey,
  applyMove,
  countSolutions,
  covers,
  generatePuzzle,
  grade,
  messageProblems,
  newGame,
  parseMessages,
  toMove,
} from "../src/engine";

const messages = parseMessages(readFileSync(new URL("../content/messages.txt", import.meta.url), "utf8"));

describe("content/messages.txt", () => {
  it("has only usable, distinct messages", () => {
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) expect(messageProblems(message), message.text).toEqual([]);
    expect(new Set(messages.map((m) => m.plaintext)).size).toBe(messages.length);
  });

  it("makes valid puzzles that Cribbot wins in exactly par moves", () => {
    for (const [i, message] of messages.slice(0, 12).entries()) {
      const generated = generatePuzzle(message, { seed: `content-${i}` });
      expect(generated, message.text).not.toBeNull();
      const { puzzle, solution } = generated!;
      expect(applyKey(solution.key, solution.plaintext)).toBe(puzzle.ciphertext);
      expect(countSolutions(puzzle)).toBe(1);
      expect(covers(puzzle.ciphertext, solution.plaintext, puzzle.cribs)).toBe(true);

      let state = newGame(puzzle);
      for (const step of grade(puzzle)!.path) state = applyMove(state, toMove(step), solution).state;
      expect(state.status).toBe("won");
      expect(state.moves).toBe(puzzle.par);
    }
  });
});
