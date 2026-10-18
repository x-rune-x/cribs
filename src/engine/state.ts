// Pure game state. applyMove runs on the server, which holds the solution;
// preview only uses public data, so the client can call it.

import { type Key, type Letter, type Pair, type SwapMap, isLetter, pair } from "./cipher";
import { MAX_MISTAKES } from "./config";
import { type Placement, type PlacementReason, type SwapReason, checkPlacement, checkSwap, fitsMessage } from "./rules";
import { type ForcedMove, bestMove, candidates, reasoningLevel } from "./solver";

export type Difficulty = "easy" | "medium" | "hard";

/** What the client may see. */
export interface PublicPuzzle {
  readonly ciphertext: string;
  /** Alphabetical, so their order says nothing about where they go. */
  readonly cribs: readonly string[];
  readonly difficulty: Difficulty;
  readonly par: number;
}

/** Server only. */
export interface Solution {
  readonly plaintext: string;
  /** Each crib's true 0-based position. */
  readonly positions: Readonly<Record<string, number>>;
  readonly key: Key;
}

export type GameStatus = "playing" | "won" | "failed";

export interface GameState {
  readonly puzzle: PublicPuzzle;
  readonly known: SwapMap;
  readonly locked: readonly Placement[];
  /** Correct lock and swap moves: the number compared with par. */
  readonly moves: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly status: GameStatus;
}

export type Move =
  | { readonly kind: "lock"; readonly crib: string; readonly pos: number }
  | { readonly kind: "swap"; readonly a: Letter; readonly b: Letter }
  | { readonly kind: "hint" };

export type Hint =
  | { readonly kind: "forced"; readonly move: ForcedMove }
  /** Fallback when no move is forced: a correct move, without a proof. */
  | { readonly kind: "reveal"; readonly move: Move };

export type MoveOutcome =
  | { readonly kind: "lock"; readonly correct: true; readonly revealed: Pair[] }
  /** Empty reasons: the placement was possible, but it isn't there. */
  | { readonly kind: "lock"; readonly correct: false; readonly reasons: PlacementReason[] }
  | { readonly kind: "swap"; readonly correct: true; readonly revealed: Pair[] }
  | { readonly kind: "swap"; readonly correct: false; readonly reasons: SwapReason[] }
  | { readonly kind: "hint"; readonly hint: Hint };

export type MoveResult = MoveOutcome & { readonly status: GameStatus };

export type InvalidMoveCode =
  | "game-over"
  | "unknown-move"
  | "unknown-crib"
  | "already-locked"
  | "out-of-range"
  | "not-a-letter"
  | "same-letter"
  | "not-in-message"
  | "already-known";

/** A move that can't be played at all. It doesn't count as a mistake. */
export class InvalidMoveError extends Error {
  readonly code: InvalidMoveCode;

  constructor(code: InvalidMoveCode, message: string) {
    super(message);
    this.name = "InvalidMoveError";
    this.code = code;
  }
}

export function newGame(puzzle: PublicPuzzle): GameState {
  return { puzzle, known: {}, locked: [], moves: 0, mistakes: 0, hints: 0, status: "playing" };
}

/** Throws InvalidMoveError if the move can't be played in this state. */
export function validateMove(state: GameState, move: Move): void {
  const fail = (code: InvalidMoveCode, message: string): never => {
    throw new InvalidMoveError(code, message);
  };
  if (state.status !== "playing") fail("game-over", "The game is over");
  const { ciphertext, cribs } = state.puzzle;
  switch (move.kind) {
    case "lock":
      if (!cribs.includes(move.crib)) fail("unknown-crib", `${move.crib} isn't a crib in this puzzle`);
      if (state.locked.some((p) => p.crib === move.crib)) fail("already-locked", `${move.crib} is already locked`);
      if (!fitsMessage(ciphertext, move.crib, move.pos)) fail("out-of-range", `${move.crib} doesn't fit at ${move.pos}`);
      return;
    case "swap":
      if (!isLetter(move.a) || !isLetter(move.b)) fail("not-a-letter", "Swaps are between two letters A–Z");
      if (move.a === move.b) fail("same-letter", "A letter can't swap with itself");
      if (!ciphertext.includes(move.a) && !ciphertext.includes(move.b)) {
        fail("not-in-message", `Neither ${move.a} nor ${move.b} is in the message`);
      }
      if (state.known[move.a] === move.b) fail("already-known", `${move.a}⇄${move.b} is already known`);
      return;
    case "hint":
      return;
    default:
      fail("unknown-move", "Unknown move");
  }
}

export function applyMove(state: GameState, move: Move, solution: Solution): { state: GameState; result: MoveResult } {
  validateMove(state, move);
  switch (move.kind) {
    case "lock":
      return lock(state, move, solution);
    case "swap":
      return declare(state, move, solution);
    case "hint":
      return hint(state, solution);
  }
}

function lock(state: GameState, move: Extract<Move, { kind: "lock" }>, solution: Solution) {
  const placement: Placement = { crib: move.crib, pos: move.pos };
  const check = checkPlacement(state.puzzle.ciphertext, placement, state.known, state.locked);
  if (solution.positions[move.crib] !== move.pos) {
    return mistake(state, { kind: "lock", correct: false, reasons: check.ok ? [] : check.reasons });
  }
  if (!check.ok) throw new Error(`Inconsistent state: the true position of ${move.crib} was rejected`);
  const revealed = check.pairs.filter(([a, b]) => state.known[a] !== b);
  return progress(
    { ...state, known: withPairs(state.known, revealed), locked: [...state.locked, placement] },
    { kind: "lock", correct: true, revealed },
  );
}

function declare(state: GameState, move: Extract<Move, { kind: "swap" }>, solution: Solution) {
  if (solution.key[move.a] !== move.b) {
    return mistake(state, { kind: "swap", correct: false, reasons: checkSwap(state.known, move.a, move.b) });
  }
  const revealed = [pair(move.a, move.b)];
  return progress({ ...state, known: withPairs(state.known, revealed) }, { kind: "swap", correct: true, revealed });
}

function hint(state: GameState, solution: Solution) {
  const forced = bestMove(state, reasoningLevel(state.puzzle.difficulty));
  const result: Hint = forced ? { kind: "forced", move: forced } : { kind: "reveal", move: revealMove(state, solution) };
  const next = { ...state, hints: state.hints + 1 };
  return { state: next, result: { kind: "hint", hint: result, status: next.status } as const };
}

/** The true position of the unlocked crib with the fewest candidates, or failing that a true swap. */
function revealMove(state: GameState, solution: Solution): Move {
  const unlocked = [...candidates(state, 1)].sort((a, b) => a[1].length - b[1].length);
  const first = unlocked[0];
  if (first) return { kind: "lock", crib: first[0], pos: solution.positions[first[0]]! };
  const letter = [...state.puzzle.ciphertext].find((ch) => !state.known[ch as Letter]) as Letter;
  return { kind: "swap", a: letter, b: solution.key[letter] };
}

function progress(state: GameState, outcome: MoveOutcome) {
  const next: GameState = {
    ...state,
    moves: state.moves + 1,
    status: isSolved(state.puzzle.ciphertext, state.known) ? "won" : "playing",
  };
  return { state: next, result: { ...outcome, status: next.status } };
}

function mistake(state: GameState, outcome: MoveOutcome) {
  const mistakes = state.mistakes + 1;
  const next: GameState = { ...state, mistakes, status: mistakes >= MAX_MISTAKES ? "failed" : "playing" };
  return { state: next, result: { ...outcome, status: next.status } };
}

function withPairs(known: SwapMap, pairs: readonly Pair[]): SwapMap {
  const map: Partial<Record<Letter, Letter>> = { ...known };
  for (const [a, b] of pairs) {
    map[a] = b;
    map[b] = a;
  }
  return map;
}

export function isSolved(ciphertext: string, known: SwapMap): boolean {
  return [...ciphertext].every((ch) => known[ch as Letter] !== undefined);
}

/** The decrypted letter at each position, or null where it isn't known yet. */
export function decryption(state: Pick<GameState, "puzzle" | "known">): (Letter | null)[] {
  return [...state.puzzle.ciphertext].map((ch) => state.known[ch as Letter] ?? null);
}

export interface PreviewCell {
  readonly cipher: Letter;
  /** The letter already decrypted here, if any. */
  readonly known: Letter | null;
  /** The letter to show while previewing. */
  readonly shown: Letter | null;
  /** "crib" under the crib itself, "implied" where the preview's swaps reach elsewhere. */
  readonly source: "known" | "crib" | "implied" | null;
}

/**
 * What a placement would decrypt. It deliberately says nothing about whether the
 * placement is possible: spotting that is the player's job in ranked play.
 */
export function preview(state: Pick<GameState, "puzzle" | "known">, crib: string, pos: number): PreviewCell[] {
  const { ciphertext } = state.puzzle;
  if (!fitsMessage(ciphertext, crib, pos)) throw new RangeError(`${crib} doesn't fit at ${pos}`);
  const implied = new Map<Letter, Letter>();
  for (let i = 0; i < crib.length; i++) {
    const w = crib[i] as Letter;
    const c = ciphertext[pos + i] as Letter;
    if (w === c) continue;
    if (!state.known[c] && !implied.has(c)) implied.set(c, w);
    if (!state.known[w] && !implied.has(w)) implied.set(w, c);
  }
  return [...ciphertext].map((ch, i): PreviewCell => {
    const cipher = ch as Letter;
    const known = state.known[cipher] ?? null;
    if (i >= pos && i < pos + crib.length) return { cipher, known, shown: crib[i - pos] as Letter, source: "crib" };
    if (known) return { cipher, known, shown: known, source: "known" };
    const guess = implied.get(cipher);
    return guess ? { cipher, known, shown: guess, source: "implied" } : { cipher, known, shown: null, source: null };
  });
}
