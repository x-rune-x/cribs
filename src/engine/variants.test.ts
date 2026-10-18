import { describe, expect, it } from "vitest";
import { type Letter, applyKey, createRng, generateKey, pair } from "./cipher";
import { GOLDEN_CIPHERTEXT, GOLDEN_KEY, GOLDEN_TEXT, goldenPuzzle, goldenSolution } from "./fixtures/golden";
import { covers, cribCandidates, generateVariant, parseMessage, verifyPuzzle, wordCoverPar } from "./generator";
import { grade } from "./grader";
import { candidates, countSolutions, findSolutions, forcedMoves } from "./solver";
import { type GameState, type Move, type PublicPuzzle, type Solution, InvalidMoveError, applyMove, newGame } from "./state";
import { LAB_VARIANTS, STANDARD_VARIANT, type Variant, blindBoard } from "./variants";
import { score } from "./scoring";

const lock = (crib: string, pos: number): Move => ({ kind: "lock", crib, pos });
const withVariant = (variant: Partial<Variant>, extra: Partial<PublicPuzzle> = {}): PublicPuzzle => ({
  ...goldenPuzzle,
  variant: { ...STANDARD_VARIANT, ...variant },
  ...extra,
});
const solution: Solution = { ...goldenSolution, text: GOLDEN_TEXT };

function play(puzzle: PublicPuzzle, moves: Move[], s: Solution = solution): GameState {
  let state = newGame(puzzle);
  for (const move of moves) state = applyMove(state, move, s).state;
  return state;
}

function invalidCode(state: GameState, move: Move, s: Solution = solution): string | null {
  try {
    applyMove(state, move, s);
    return null;
  } catch (error) {
    if (error instanceof InvalidMoveError) return error.code;
    throw error;
  }
}

/** The key, restricted to the message's letters: a correct blind submission. */
const fullMapping = () =>
  Object.fromEntries([...GOLDEN_CIPHERTEXT].flatMap((c) => [[c, GOLDEN_KEY[c as Letter]], [GOLDEN_KEY[c as Letter], c]]));

describe("blindBoard", () => {
  it("combines placements into a full mapping once every letter has one partner", () => {
    const board = blindBoard(GOLDEN_CIPHERTEXT, {}, [
      { crib: "MILL", pos: 12 },
      { crib: "DAWN", pos: 18 },
      { crib: "THE", pos: 6 },
    ], []);
    expect(board.clashes).toEqual([]);
    expect(applyKey(board.mapping!, GOLDEN_CIPHERTEXT)).toBe(goldenSolution.plaintext);
  });

  it("reports clashes between the player's own placements, and stays incomplete", () => {
    // MEET at 5 says M⇄G; MILL at 13 says M⇄U.
    const board = blindBoard(GOLDEN_CIPHERTEXT, {}, [
      { crib: "MEET", pos: 4 },
      { crib: "MILL", pos: 12 },
    ], []);
    expect(board.clashes).toContain("M");
    expect(board.partners.M).toEqual(["G", "U"]);
    expect(board.mapping).toBeNull();
  });

  it("treats a letter placed over itself as a clash", () => {
    expect(blindBoard(GOLDEN_CIPHERTEXT, {}, [{ crib: "DAWN", pos: 11 }], []).clashes).toEqual(["W"]);
  });

  it("includes declared swaps", () => {
    expect(blindBoard(GOLDEN_CIPHERTEXT, {}, [], [pair("H", "Y")]).partners.Y).toEqual(["H"]);
  });
});

describe("your own words", () => {
  const puzzle = withVariant({ words: "free" }, { cribs: [], par: 3 });
  const free: Solution = { ...solution, positions: {} };

  it("accepts any word that really is in the message there", () => {
    const state = play(puzzle, [lock("MILL", 12), lock("THEOLD", 6)], free);
    expect(state.moves).toBe(2);
    expect(state.mistakes).toBe(0);
    // Overlapping true words are fine: THE and THEOLD share letters.
    expect(play(puzzle, [lock("THE", 6), lock("THEOLD", 6)], free).mistakes).toBe(0);
    // Even across a word boundary.
    expect(play(puzzle, [lock("ATTHE", 4)], free).mistakes).toBe(0);
  });

  it("counts a word that isn't there as a mistake", () => {
    const { result } = applyMove(newGame(puzzle), lock("MOLE", 12), free);
    expect(result).toMatchObject({ kind: "lock", correct: false });
  });

  it("rejects things that aren't words", () => {
    const state = newGame(puzzle);
    expect(invalidCode(state, lock("AB", 0), free)).toBe("bad-word");
    expect(invalidCode(state, lock("mill", 12), free)).toBe("bad-word");
    expect(invalidCode(play(puzzle, [lock("MILL", 12)], free), lock("MILL", 12), free)).toBe("already-locked");
  });

  it("hints by revealing a word from the message", () => {
    const { result } = applyMove(newGame(puzzle), { kind: "hint" }, free);
    expect(result).toMatchObject({ kind: "hint", hint: { kind: "reveal", move: { kind: "lock" } } });
    if (result.kind === "hint" && result.hint.kind === "reveal" && result.hint.move.kind === "lock") {
      const { crib, pos } = result.hint.move;
      expect(free.plaintext.slice(pos, pos + crib.length)).toBe(crib);
    }
  });

  it("has a par of the fewest words and swaps that decrypt everything", () => {
    expect(wordCoverPar(parseMessage(GOLDEN_TEXT), GOLDEN_CIPHERTEXT)).toBe(3);
  });
});

describe("blind locking", () => {
  const puzzle = withVariant({ feedback: "blind" }, { par: 0 });

  it("keeps placements and swaps off the server", () => {
    const state = newGame(puzzle);
    expect(invalidCode(state, lock("MILL", 12))).toBe("tentative-only");
    expect(invalidCode(state, { kind: "swap", a: "H", b: "Y" })).toBe("tentative-only");
  });

  it("only accepts a submission that assigns every message letter", () => {
    const partial = { kind: "submit", mapping: { U: "M", M: "U" } } as Move;
    expect(invalidCode(newGame(puzzle), partial)).toBe("incomplete");
    expect(invalidCode(newGame(goldenPuzzle), { kind: "submit", mapping: fullMapping() } as Move)).toBe("blind-only");
  });

  it("counts a wrong submission as a mistake and says nothing more", () => {
    const wrong = { ...fullMapping(), U: "N", N: "U", X: "M", M: "X" };
    const { state, result } = applyMove(newGame(puzzle), { kind: "submit", mapping: wrong } as Move, solution);
    expect(result).toEqual({ kind: "submit", correct: false, status: "playing" });
    expect(state.mistakes).toBe(1);
    expect(state.known).toEqual({});
  });

  it("wins on a correct submission, scored on mistakes and hints alone", () => {
    const { state, result } = applyMove(newGame(puzzle), { kind: "submit", mapping: fullMapping() } as Move, solution);
    expect(result).toMatchObject({ kind: "submit", correct: true, status: "won" });
    expect(state.status).toBe("won");
    expect(score(state, puzzle.par)).toBe(100);
  });

  it("applies a hint as a confirmed move", () => {
    const { state, result } = applyMove(newGame(puzzle), { kind: "hint" }, solution);
    expect(result).toMatchObject({ kind: "hint", hint: { kind: "forced", move: { crib: "MILL", pos: 12 } } });
    expect(state.locked).toEqual([{ crib: "MILL", pos: 12 }]);
    expect(state.known.U).toBe("M");
    expect(state.hints).toBe(1);
    expect(state.moves).toBe(0);
  });
});

describe("decoy words", () => {
  const cribs = ["DAWN", "MEET", "MILL", "OAK", "THE"];
  const puzzle = withVariant({ decoy: true }, { cribs });

  it("still has exactly one solution, with the decoy left out", () => {
    expect(countSolutions(puzzle, 5)).toBe(1);
    expect(findSolutions(puzzle, 5)).toEqual([{ DAWN: 18, MEET: 0, MILL: 12, THE: 6 }]);
  });

  it("depends on the decoy rule", () => {
    // Without it every word is required, and OAK fits nowhere alongside the others.
    expect(countSolutions({ ciphertext: GOLDEN_CIPHERTEXT, cribs }, 5)).toBe(0);
  });

  it("forces nothing at L1 or L2, because any word might be the decoy", () => {
    expect(forcedMoves(newGame(puzzle), 1)).toEqual([]);
    expect(forcedMoves(newGame(puzzle), 2)).toEqual([]);
    expect(forcedMoves(newGame(puzzle), 3).length).toBeGreaterThan(0);
  });

  it("needs L3 trial and error to expose the decoy, which makes it Hard", () => {
    const l3 = candidates(newGame(puzzle), 3);
    expect(l3.get("OAK")).toEqual([]);
    expect(Object.fromEntries([...l3].filter(([crib]) => crib !== "OAK"))).toEqual({ DAWN: [18], MEET: [0], MILL: [12], THE: [6] });
    expect(grade(puzzle)).toMatchObject({ difficulty: "hard", par: 3 });
  });

  it("counts placing the decoy as a mistake", () => {
    const state = play(puzzle, [lock("OAK", 3)]);
    expect(state.mistakes).toBe(1);
  });

  it("never rules out the true answer", () => {
    for (let i = 0; i < 40; i++) {
      const { puzzle: p, truth, decoy } = randomDecoyPuzzle(`decoy-${i}`);
      for (const level of [1, 2, 3] as const) {
        const cands = candidates(newGame(p), level);
        for (const [crib, positions] of cands) {
          if (crib !== decoy) expect(positions, `${crib} at L${level}`).toContain(truth[crib]);
        }
        for (const move of forcedMoves(newGame(p), level)) {
          if (move.kind === "lock") expect(move.pos).toBe(truth[move.crib]);
        }
      }
    }
  });
});

describe("generateVariant", () => {
  const messages = [
    "MEET AT THE OLD MILL AT DAWN",
    "THE COURIER CARRIES A RED UMBRELLA",
    "RADIO SILENCE UNTIL FURTHER NOTICE",
    "OUR MAN IN PARIS HAS GONE QUIET",
  ].map(parseMessage);
  const pool = ["OAK", "RIVER", "SILVER", "CASTLE", "PIGEON", "BANK", "WOLF", "LAMP"];

  it.each(LAB_VARIANTS.filter((v) => v.messages === "sentences").map((v) => [v.label, v.variant]))(
    "makes verifiable %s puzzles",
    (_, variant) => {
      let made = 0;
      for (const [i, message] of messages.entries()) {
        const generated = generateVariant(message, variant, { seed: `variant-${i}`, decoyPool: pool, attempts: 300 });
        if (!generated) continue;
        made++;
        expect(verifyPuzzle(generated.puzzle, generated.solution, generated.text)).toBeNull();
        expect(generated.puzzle.variant).toEqual(variant);
        if (variant.feedback === "blind") expect(generated.puzzle.par).toBe(0);
        if (variant.words === "free") expect(generated.puzzle.cribs).toEqual([]);
        if (variant.decoy) {
          const real = Object.keys(generated.solution.positions);
          expect(generated.puzzle.cribs.length).toBe(real.length + 1);
        }
        if (variant.coverage === "partial") {
          const real = Object.keys(generated.solution.positions);
          expect(covers(generated.puzzle.ciphertext, generated.solution.plaintext, real)).toBe(false);
        }
      }
      expect(made).toBeGreaterThan(0);
    },
  );

  it("rejects a tampered puzzle", () => {
    const generated = generateVariant(messages[0]!, { ...STANDARD_VARIANT, decoy: true }, { seed: "tamper", decoyPool: pool })!;
    expect(verifyPuzzle({ ...generated.puzzle, par: generated.puzzle.par + 1 }, generated.solution, generated.text)).not.toBeNull();
    expect(verifyPuzzle({ ...generated.puzzle, variant: STANDARD_VARIANT }, generated.solution, generated.text)).not.toBeNull();
  });
});

function randomDecoyPuzzle(seed: string) {
  const rng = createRng(seed);
  const message = parseMessage(rng.pick(["MEET AT THE OLD MILL AT DAWN", "THE COURIER CARRIES A RED UMBRELLA", "CROSS THE BRIDGE AFTER DARK"]));
  const words = cribCandidates(message);
  const key = generateKey(rng);
  const real = rng.shuffle(words).slice(0, rng.range(2, Math.min(5, words.length)));
  const decoy = rng.pick(["OAK", "RIVER", "LAMP", "WOLF"].filter((w) => !message.plaintext.includes(w)));
  const truth = Object.fromEntries(real.map((c) => [c, message.plaintext.indexOf(c)]));
  const puzzle: PublicPuzzle = {
    ciphertext: applyKey(key, message.plaintext),
    cribs: [...real, decoy].sort(),
    difficulty: "medium",
    par: 0,
    variant: { ...STANDARD_VARIANT, decoy: true },
  };
  return { puzzle, truth, decoy };
}
