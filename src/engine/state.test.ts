import { describe, expect, it } from "vitest";
import { MAX_MISTAKES } from "./config";
import { GOLDEN_PLAINTEXT, goldenPuzzle, goldenSolution } from "./fixtures/golden";
import {
  type GameState,
  type Move,
  InvalidMoveError,
  applyMove,
  decryption,
  newGame,
  preview,
} from "./state";

function play(moves: Move[], state: GameState = newGame(goldenPuzzle)): GameState {
  for (const move of moves) state = applyMove(state, move, goldenSolution).state;
  return state;
}

const lock = (crib: string, pos: number): Move => ({ kind: "lock", crib, pos });

function expectInvalid(state: GameState, move: Move, code: string) {
  try {
    applyMove(state, move, goldenSolution);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidMoveError);
    expect((error as InvalidMoveError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${JSON.stringify(move)} to be rejected with ${code}`);
}

describe("newGame", () => {
  it("starts with nothing known", () => {
    expect(newGame(goldenPuzzle)).toEqual({
      puzzle: goldenPuzzle,
      known: {},
      locked: [],
      moves: 0,
      mistakes: 0,
      hints: 0,
      status: "playing",
    });
  });
});

describe("applyMove: lock", () => {
  it("adds a correct crib's swaps and decrypts every occurrence", () => {
    const { state, result } = applyMove(newGame(goldenPuzzle), lock("MILL", 12), goldenSolution);
    expect(result).toEqual({
      kind: "lock",
      correct: true,
      revealed: [
        ["I", "W"],
        ["L", "V"],
        ["M", "U"],
      ],
      status: "playing",
    });
    expect(state.locked).toEqual([{ crib: "MILL", pos: 12 }]);
    expect(state.moves).toBe(1);
    const shown = decryption(state);
    expect(shown[0]).toBe("M"); // the U at 1 decrypts too
    expect(shown[10]).toBe("L"); // and the V at 11
    expect(shown.slice(12, 16)).toEqual(["M", "I", "L", "L"]);
    expect(shown[1]).toBeNull();
  });

  it("rejects a possible but wrong placement without saying why", () => {
    const start = newGame(goldenPuzzle);
    const { state, result } = applyMove(start, lock("MEET", 4), goldenSolution);
    expect(result).toEqual({ kind: "lock", correct: false, reasons: [], status: "playing" });
    expect(state.mistakes).toBe(1);
    expect(state.moves).toBe(0);
    expect(state.known).toEqual(start.known);
    expect(state.locked).toEqual(start.locked);
  });

  it("explains why an impossible placement was rejected", () => {
    const { result } = applyMove(newGame(goldenPuzzle), lock("MILL", 3), goldenSolution);
    expect(result.kind === "lock" && !result.correct && result.reasons).toEqual([
      { kind: "self-contradiction", letter: "O", partners: ["M", "L"], indices: [3, 5] },
    ]);
  });
});

describe("applyMove: swap", () => {
  it("adds a correct declared swap", () => {
    const { state, result } = applyMove(
      newGame(goldenPuzzle),
      { kind: "swap", a: "Y", b: "H" },
      goldenSolution,
    );
    expect(result).toEqual({ kind: "swap", correct: true, revealed: [["H", "Y"]], status: "playing" });
    expect(decryption(state)[7]).toBe("H");
    expect(state.moves).toBe(1);
  });

  it("counts a wrong declared swap as a mistake", () => {
    const { state, result } = applyMove(
      newGame(goldenPuzzle),
      { kind: "swap", a: "G", b: "E" },
      goldenSolution,
    );
    expect(result).toEqual({ kind: "swap", correct: false, reasons: [], status: "playing" });
    expect(state.mistakes).toBe(1);
  });

  it("explains a declared swap that clashes with a known one", () => {
    const state = play([lock("MILL", 12)]);
    const { result } = applyMove(state, { kind: "swap", a: "U", b: "E" }, goldenSolution);
    expect(result).toEqual({
      kind: "swap",
      correct: false,
      reasons: [{ kind: "conflicts-known", letter: "U", would: "E", known: "M" }],
      status: "playing",
    });
  });
});

describe("applyMove: hint", () => {
  it("reveals a forced move without changing the board", () => {
    const start = newGame(goldenPuzzle);
    const { state, result } = applyMove(start, { kind: "hint" }, goldenSolution);
    expect(result.kind).toBe("hint");
    if (result.kind === "hint") {
      expect(result.hint.kind).toBe("forced");
    }
    expect(state.hints).toBe(1);
    expect(state.known).toEqual(start.known);
    expect(state.moves).toBe(0);
  });
});

describe("winning and failing", () => {
  it("wins once every letter is decrypted, without placing every crib", () => {
    const state = play([lock("MILL", 12), lock("DAWN", 18), lock("THE", 6)]);
    expect(state.status).toBe("won");
    expect(state.moves).toBe(3);
    expect(decryption(state).join("")).toBe(GOLDEN_PLAINTEXT);
  });

  it(`fails after ${MAX_MISTAKES} mistakes`, () => {
    const wrong = Array.from({ length: MAX_MISTAKES }, () => lock("MEET", 4));
    const state = play(wrong);
    expect(state.status).toBe("failed");
    expect(state.mistakes).toBe(MAX_MISTAKES);
    expectInvalid(state, lock("MILL", 12), "game-over");
  });
});

describe("invalid moves", () => {
  const state = play([lock("MILL", 12)]);

  it("are rejected without counting as mistakes", () => {
    expectInvalid(state, lock("OLD", 9), "unknown-crib");
    expectInvalid(state, lock("MILL", 12), "already-locked");
    expectInvalid(state, lock("DAWN", 19), "out-of-range");
    expectInvalid(state, lock("DAWN", -1), "out-of-range");
    expectInvalid(state, lock("DAWN", 1.5), "out-of-range");
    expectInvalid(state, { kind: "swap", a: "E", b: "E" }, "same-letter");
    expectInvalid(state, { kind: "swap", a: "B", b: "C" }, "not-in-message");
    expectInvalid(state, { kind: "swap", a: "W", b: "I" }, "already-known");
    expectInvalid(state, { kind: "swap", a: "e", b: "K" } as unknown as Move, "not-a-letter");
    expectInvalid(state, { kind: "teleport" } as unknown as Move, "unknown-move");
  });
});

describe("preview", () => {
  const state = play([lock("MILL", 12)]);

  it("shows what a placement would decrypt, as in the mockup", () => {
    const cells = preview(state, "DAWN", 18);
    expect(cells).toHaveLength(22);
    expect(cells.slice(18).map((c) => [c.shown, c.source])).toEqual([
      ["D", "crib"],
      ["A", "crib"],
      ["W", "crib"],
      ["N", "crib"],
    ]);
    expect(cells[4]).toEqual({ cipher: "G", known: null, shown: "A", source: "implied" });
    expect(cells[11]).toEqual({ cipher: "R", known: null, shown: "D", source: "implied" });
    expect(cells[0]).toEqual({ cipher: "U", known: "M", shown: "M", source: "known" });
    expect(cells[1]).toEqual({ cipher: "K", known: null, shown: null, source: null });
  });

  it("renders impossible placements too, without judging them", () => {
    const cells = preview(state, "DAWN", 11);
    expect(cells[13]).toEqual({ cipher: "W", known: "I", shown: "W", source: "crib" });
    expect(cells.every((cell) => !("valid" in cell))).toBe(true);
  });

  it("does not change the game", () => {
    const before = JSON.stringify(state);
    preview(state, "DAWN", 18);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("serialisation", () => {
  it("survives a JSON round trip", () => {
    const state = play([lock("MILL", 12)]);
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    const next = play([lock("DAWN", 18), lock("THE", 6)], copy);
    expect(next.status).toBe("won");
  });
});
