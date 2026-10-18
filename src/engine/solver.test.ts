import { describe, expect, it } from "vitest";
import { type Key, type Letter, type SwapMap, applyKey, createRng, generateKey, swapMapOf } from "./cipher";
import { GOLDEN_CIPHERTEXT, goldenPuzzle, goldenSolution } from "./fixtures/golden";
import { cribCandidates, parseMessage } from "./generator";
import { type Placement, checkPlacement } from "./rules";
import {
  type Board,
  type Level,
  candidates,
  countSolutions,
  explainForced,
  findSolutions,
  forcedMoves,
  shortestPath,
  toMove,
  whyImpossible,
} from "./solver";
import { type GameState, applyMove, decryption, newGame } from "./state";

const start = newGame(goldenPuzzle);
const LEVELS: Level[] = [1, 2, 3];

describe("candidates on the golden puzzle", () => {
  it("L1 checks each crib on its own: MILL has only one legal position", () => {
    expect(Object.fromEntries(candidates(start, 1))).toEqual({
      DAWN: [6, 7, 8, 9, 15, 17, 18],
      MEET: [0, 4, 13],
      MILL: [12],
      THE: [2, 6, 10, 11, 12, 15, 16, 17, 18, 19],
    });
  });

  it("L2 also removes positions that leave another crib nowhere to go", () => {
    expect(Object.fromEntries(candidates(start, 2))).toEqual({
      DAWN: [18],
      MEET: [0],
      MILL: [12],
      THE: [6],
    });
  });

  it("leaves locked cribs out", () => {
    const state = applyMove(start, { kind: "lock", crib: "MILL", pos: 12 }, goldenSolution).state;
    expect([...candidates(state, 1).keys()]).toEqual(["DAWN", "MEET", "THE"]);
    expect(candidates(state, 1).get("DAWN")).toEqual([18]);
  });
});

describe("forcedMoves on the golden puzzle", () => {
  it("at L1, only MILL is forced at the start", () => {
    expect(forcedMoves(start, 1)).toEqual([{ kind: "lock", crib: "MILL", pos: 12, level: 1 }]);
  });

  it("at L2, every crib is forced, tagged with the lowest level that proves it", () => {
    const moves = forcedMoves(start, 2);
    expect(moves).toContainEqual({ kind: "lock", crib: "MILL", pos: 12, level: 1 });
    expect(moves).toContainEqual({ kind: "lock", crib: "MEET", pos: 0, level: 2 });
    expect(moves).toContainEqual({ kind: "lock", crib: "DAWN", pos: 18, level: 2 });
    expect(moves).toContainEqual({ kind: "lock", crib: "THE", pos: 6, level: 2 });
    expect(moves[0]).toEqual({ kind: "lock", crib: "MILL", pos: 12, level: 1 });
  });

  it("finds a swap implied by every remaining candidate of a crib", () => {
    // OAB fits only at 0 and 6, and both spots say O⇄T, A⇄X and B⇄Y.
    const board: Board = {
      puzzle: { ciphertext: "TXYOABTXY", cribs: ["OAB"] },
      known: {},
      locked: [],
    };
    expect(candidates(board, 1).get("OAB")).toEqual([0, 6]);
    const implied = { kind: "implied", crib: "OAB" } as const;
    expect(forcedMoves(board, 1)).toEqual([
      { kind: "swap", pair: ["A", "X"], level: 1, because: implied },
      { kind: "swap", pair: ["B", "Y"], level: 1, because: implied },
      { kind: "swap", pair: ["O", "T"], level: 1, because: implied },
    ]);
  });

  it("pairs the last two unpaired letters", () => {
    const pairs = [
      "AB", "CD", "EF", "GH", "IJ", "KL", "MN", "OP", "QR", "ST", "UV", "WX",
    ].map((p) => [p[0], p[1]] as [Letter, Letter]);
    const board: Board = {
      puzzle: { ciphertext: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", cribs: [] },
      known: swapMapOf(pairs),
      locked: [],
    };
    expect(forcedMoves(board, 1)).toEqual([
      { kind: "swap", pair: ["Y", "Z"], level: 1, because: { kind: "last-pair" } },
    ]);
  });
});

describe("countSolutions", () => {
  it("finds exactly one solution for the golden puzzle", () => {
    expect(countSolutions(goldenPuzzle)).toBe(1);
    expect(findSolutions(goldenPuzzle, 5)).toEqual([{ DAWN: 18, MEET: 0, MILL: 12, THE: 6 }]);
  });

  it("stays unique with OLD as a fifth crib", () => {
    expect(countSolutions({ ciphertext: GOLDEN_CIPHERTEXT, cribs: ["DAWN", "MEET", "MILL", "OLD", "THE"] })).toBe(1);
  });

  it("stops counting at the limit", () => {
    const loose = { ciphertext: GOLDEN_CIPHERTEXT, cribs: ["THE"] };
    expect(countSolutions(loose)).toBe(2);
    expect(countSolutions(loose, 50)).toBe(10);
  });

  it("agrees with brute force on random puzzles", () => {
    for (let i = 0; i < 40; i++) {
      const { ciphertext, cribs } = randomPuzzle(`brute-${i}`, 2, 3);
      expect(countSolutions({ ciphertext, cribs }, 1000)).toBe(bruteForceCount(ciphertext, cribs));
    }
  });
});

describe("soundness", () => {
  it("never removes a true position, at any level, from any reachable state", () => {
    for (let i = 0; i < 60; i++) {
      const { state, truth, key } = randomReachableState(`sound-${i}`);
      for (const level of LEVELS) {
        const cands = candidates(state, level);
        for (const [crib, positions] of cands) {
          expect(positions, `${crib} at level ${level}`).toContain(truth[crib]);
        }
        for (const move of forcedMoves(state, level)) {
          if (move.kind === "lock") expect(move.pos).toBe(truth[move.crib]);
          else expect(key[move.pair[0]]).toBe(move.pair[1]);
        }
      }
    }
  });

  it("L1 agrees with the rules module", () => {
    for (let i = 0; i < 30; i++) {
      const { state } = randomReachableState(`agree-${i}`);
      const { ciphertext } = state.puzzle;
      for (const [crib, positions] of candidates(state, 1)) {
        const expected: number[] = [];
        for (let pos = 0; pos + crib.length <= ciphertext.length; pos++) {
          if (checkPlacement(ciphertext, { crib, pos }, state.known, state.locked).ok) expected.push(pos);
        }
        expect(positions).toEqual(expected);
      }
    }
  });

  it("each level is at least as strong as the one below", () => {
    for (let i = 0; i < 30; i++) {
      const { state } = randomReachableState(`levels-${i}`);
      const [c1, c2, c3] = LEVELS.map((level) => candidates(state, level));
      for (const [crib, positions] of c3!) {
        for (const pos of positions) expect(c2!.get(crib)).toContain(pos);
        for (const pos of c2!.get(crib)!) expect(c1!.get(crib)).toContain(pos);
      }
    }
  });
});

describe("shortestPath", () => {
  it("finds MILL → DAWN → THE on the golden puzzle", () => {
    const path = shortestPath(start, 2);
    expect(path?.map((m) => m.kind === "lock" && `${m.crib}@${m.pos}`)).toEqual([
      "MILL@12",
      "DAWN@18",
      "THE@6",
    ]);
    expect(shortestPath(start, 1)).toHaveLength(3);
  });

  it("beats the greedy route, which takes 4 moves", () => {
    expect(greedyMoves(start, 2)).toBe(4);
  });

  it("returns an empty path for a finished board", () => {
    let state = start;
    for (const move of shortestPath(start, 2)!) state = applyMove(state, toMove(move), goldenSolution).state;
    expect(state.status).toBe("won");
    expect(shortestPath(state, 2)).toEqual([]);
  });
});

describe("explainForced", () => {
  it("names the lowest level that proves a move", () => {
    expect(explainForced(start, { kind: "lock", crib: "MILL", pos: 12 }, 3)).toEqual({
      kind: "lock",
      crib: "MILL",
      pos: 12,
      level: 1,
    });
    expect(explainForced(start, { kind: "lock", crib: "MEET", pos: 0 }, 1)).toBeNull();
    expect(explainForced(start, { kind: "lock", crib: "MEET", pos: 0 }, 2)?.level).toBe(2);
  });

  it("treats a swap implied by a single-candidate crib as forced", () => {
    // MILL has one spot, so M⇄U is forced even before MILL is locked.
    expect(explainForced(start, { kind: "swap", a: "U", b: "M" }, 1)).toEqual({
      kind: "swap",
      pair: ["M", "U"],
      level: 1,
      because: { kind: "implied", crib: "MILL" },
    });
    expect(explainForced(start, { kind: "swap", a: "H", b: "Y" }, 1)).toBeNull();
    expect(explainForced(start, { kind: "swap", a: "H", b: "Y" }, 2)?.level).toBe(2);
  });
});

describe("whyImpossible", () => {
  it("uses the rules first", () => {
    expect(whyImpossible(start, { crib: "MILL", pos: 3 }, 1)).toEqual({
      level: 1,
      reasons: [{ kind: "self-contradiction", letter: "O", partners: ["M", "L"], indices: [3, 5] }],
    });
  });

  it("names the crib left with nowhere to go at L2", () => {
    expect(whyImpossible(start, { crib: "DAWN", pos: 6 }, 1)).toBeNull();
    expect(whyImpossible(start, { crib: "DAWN", pos: 6 }, 2)).toEqual({ level: 2, blocked: "MILL" });
    expect(whyImpossible(start, { crib: "MEET", pos: 4 }, 2)).toEqual({ level: 2, blocked: "MILL" });
  });

  it("returns null for the true position", () => {
    expect(whyImpossible(start, { crib: "MEET", pos: 0 }, 3)).toBeNull();
  });
});

// Helpers

const MESSAGES = [
  "MEET AT THE OLD MILL AT DAWN",
  "THE EAGLE LANDS AT MIDNIGHT",
  "BURN THIS NOTE AFTER READING",
  "TRUST NO ONE IN THE EMBASSY",
  "CROSS THE BRIDGE AFTER DARK",
  "THE COURIER CARRIES A RED UMBRELLA",
  "RADIO SILENCE UNTIL FURTHER NOTICE",
  "THE TARGET IS STAYING AT A GRAND HOTEL",
];

interface RandomPuzzle {
  ciphertext: string;
  cribs: string[];
  truth: Record<string, number>;
  key: Key;
  plaintext: string;
}

function randomPuzzle(seed: string, minCribs = 3, maxCribs = 6): RandomPuzzle {
  const rng = createRng(seed);
  const message = parseMessage(rng.pick(MESSAGES));
  const words = cribCandidates(message);
  const key = generateKey(rng);
  const k = rng.range(Math.min(minCribs, words.length), Math.min(maxCribs, words.length));
  const cribs = rng.shuffle(words).slice(0, k).sort();
  const truth = Object.fromEntries(cribs.map((c) => [c, message.plaintext.indexOf(c)]));
  return { ciphertext: applyKey(key, message.plaintext), cribs, truth, key, plaintext: message.plaintext };
}

/** A puzzle part-way through: some true cribs locked and some true swaps declared. */
function randomReachableState(seed: string): { state: GameState; truth: Record<string, number>; key: Key } {
  const p = randomPuzzle(seed);
  const rng = createRng(`${seed}:state`);
  const solution = { plaintext: p.plaintext, positions: p.truth, key: p.key };
  let state = newGame({ ciphertext: p.ciphertext, cribs: p.cribs, difficulty: "easy", par: 0 });
  for (const crib of rng.shuffle(p.cribs).slice(0, rng.int(p.cribs.length))) {
    if (state.status !== "playing") break;
    state = applyMove(state, { kind: "lock", crib, pos: p.truth[crib]! }, solution).state;
  }
  const letters = [...new Set(p.ciphertext)] as Letter[];
  for (const letter of rng.shuffle(letters).slice(0, rng.int(3))) {
    if (state.status !== "playing" || state.known[letter]) continue;
    state = applyMove(state, { kind: "swap", a: letter, b: p.key[letter] }, solution).state;
  }
  return { state, truth: p.truth, key: p.key };
}

function bruteForceCount(ciphertext: string, cribs: readonly string[]): number {
  let count = 0;
  const place = (i: number, known: SwapMap, locked: Placement[]) => {
    if (i === cribs.length) {
      count++;
      return;
    }
    const crib = cribs[i]!;
    for (let pos = 0; pos + crib.length <= ciphertext.length; pos++) {
      const check = checkPlacement(ciphertext, { crib, pos }, known, locked);
      if (!check.ok) continue;
      const next = { ...known } as Record<Letter, Letter>;
      for (const [a, b] of check.pairs) {
        next[a] = b;
        next[b] = a;
      }
      place(i + 1, next, [...locked, { crib, pos }]);
    }
  };
  place(0, {}, []);
  return count;
}

/** Plays the forced move that decrypts the most letters, until the game is won. */
function greedyMoves(state: GameState, level: Level): number {
  let moves = 0;
  while (state.status === "playing") {
    const shownBefore = decryption(state).filter(Boolean).length;
    let best: GameState | null = null;
    let bestGain = -1;
    for (const forced of forcedMoves(state, level)) {
      const next = applyMove(state, toMove(forced), goldenSolution).state;
      const gain = decryption(next).filter(Boolean).length - shownBefore;
      if (gain > bestGain) {
        best = next;
        bestGain = gain;
      }
    }
    if (!best) throw new Error("greedy got stuck");
    state = best;
    moves++;
  }
  return moves;
}
