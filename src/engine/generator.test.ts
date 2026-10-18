import { describe, expect, it } from "vitest";
import { applyKey } from "./cipher";
import { GOLDEN_TEXT } from "./fixtures/golden";
import { covers, cribCandidates, generatePuzzle, messageProblems, parseMessage, parseMessages } from "./generator";
import { grade } from "./grader";
import { countSolutions } from "./solver";

describe("parseMessages", () => {
  it("reads one message per line and skips blanks and comments", () => {
    const messages = parseMessages("# Spy messages\n\nMeet at the old mill, at dawn\n  \nTrust no one\n");
    expect(messages).toEqual([
      {
        text: GOLDEN_TEXT,
        plaintext: "MEETATTHEOLDMILLATDAWN",
        words: ["MEET", "AT", "THE", "OLD", "MILL", "AT", "DAWN"],
      },
      { text: "TRUST NO ONE", plaintext: "TRUSTNOONE", words: ["TRUST", "NO", "ONE"] },
    ]);
  });
});

describe("cribCandidates", () => {
  it("lists distinct words of at least 3 letters, alphabetically", () => {
    expect(cribCandidates(parseMessage(GOLDEN_TEXT))).toEqual(["DAWN", "MEET", "MILL", "OLD", "THE"]);
  });

  it("drops words that occur more than once anywhere in the letters", () => {
    // THE also appears inside THEM, and THEM also appears across THE MILL.
    expect(cribCandidates(parseMessage("MEET THEM AT THE MILL"))).toEqual(["MEET", "MILL"]);
    // NOW also appears inside SNOW.
    expect(cribCandidates(parseMessage("NOW THE SNOW FALLS"))).toEqual(["FALLS", "SNOW", "THE"]);
    // THE also appears across a word boundary: WITH EVERY.
    expect(cribCandidates(parseMessage("THE WITH EVERY"))).toEqual(["EVERY", "WITH"]);
  });
});

describe("messageProblems", () => {
  it("flags messages that are too short, too long or short of cribs", () => {
    expect(messageProblems(parseMessage(GOLDEN_TEXT))).toEqual([]);
    expect(messageProblems(parseMessage("TOO SHORT"))[0]).toMatch(/18/);
    expect(messageProblems(parseMessage("A".repeat(41)))[0]).toMatch(/40/);
    expect(messageProblems(parseMessage("ANTELOPES CHASE ANTELOPES QUICKLY"))).toEqual([
      "only 2 usable cribs (needs at least 3)",
    ]);
  });
});

describe("generatePuzzle", () => {
  const message = parseMessage(GOLDEN_TEXT);

  it("produces a valid puzzle with one solution that covers the message", () => {
    const generated = generatePuzzle(message, { seed: "test" });
    expect(generated).not.toBeNull();
    const { puzzle, solution } = generated!;
    expect(applyKey(solution.key, solution.plaintext)).toBe(puzzle.ciphertext);
    expect(puzzle.cribs.length).toBeGreaterThanOrEqual(3);
    expect(puzzle.cribs.length).toBeLessThanOrEqual(5);
    expect([...puzzle.cribs]).toEqual([...puzzle.cribs].sort());
    expect(countSolutions(puzzle, 2)).toBe(1);
    expect(covers(puzzle.ciphertext, solution.plaintext, puzzle.cribs)).toBe(true);
    for (const crib of puzzle.cribs) {
      expect(solution.plaintext.slice(solution.positions[crib], solution.positions[crib]! + crib.length)).toBe(crib);
    }
    const graded = grade(puzzle);
    expect(graded?.difficulty).toBe(puzzle.difficulty);
    expect(graded?.par).toBe(puzzle.par);
  });

  it("is reproducible from a seed", () => {
    expect(generatePuzzle(message, { seed: "same" })).toEqual(generatePuzzle(message, { seed: "same" }));
  });

  it("hits the requested difficulty", () => {
    expect(generatePuzzle(message, { seed: "easy", targets: ["easy"] })?.puzzle.difficulty).toBe("easy");
  });

  it("reports every attempt", () => {
    const reports: unknown[] = [];
    generatePuzzle(message, { seed: "reports", attempts: 5, stopEarly: false, onAttempt: (r) => reports.push(r) });
    expect(reports).toHaveLength(5);
  });

  it("gives up on a message without enough cribs", () => {
    expect(generatePuzzle(parseMessage("ANTELOPES CHASE ANTELOPES QUICKLY"), { seed: "x" })).toBeNull();
  });
});
