// Pure game state. applyMove runs on the server, which holds the solution;
// preview only uses public data, so the client can call it.

import { type Key, type Letter, type Pair, type SwapMap, isLetter, pair } from "./cipher";
import { MAX_MISTAKES, MIN_CRIB_LENGTH } from "./config";
import { type Placement, type PlacementReason, type SwapReason, checkPlacement, checkSwap, fitsMessage } from "./rules";
import { type ForcedMove, bestMove, candidates, reasoningLevel, toMove } from "./solver";
import { type Variant, variantOf } from "./variants";

export type Difficulty = "easy" | "medium" | "hard";

/** What the client may see. */
export interface PublicPuzzle {
  readonly ciphertext: string;
  /** Alphabetical, so their order says nothing about where they go. Empty when players bring their own words. */
  readonly cribs: readonly string[];
  readonly difficulty: Difficulty;
  readonly par: number;
  /** Lab puzzles only; standard rules otherwise. */
  readonly variant?: Variant;
}

/** Server only. */
export interface Solution {
  readonly plaintext: string;
  /** Each real crib's true 0-based position. A decoy has none. */
  readonly positions: Readonly<Record<string, number>>;
  readonly key: Key;
  /** The message with its spaces, for hints that reveal a word. */
  readonly text?: string;
}

export type GameStatus = "playing" | "won" | "failed";

export interface GameState {
  readonly puzzle: PublicPuzzle;
  /** Swaps confirmed by the server. */
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
  | { readonly kind: "hint" }
  /** Blind mode: the player's whole decryption, as each message letter's partner. */
  | { readonly kind: "submit"; readonly mapping: SwapMap };

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
  /** In blind mode the hinted move is applied at once, and `revealed` lists its swaps. */
  | { readonly kind: "hint"; readonly hint: Hint; readonly revealed: Pair[] }
  /** Deliberately no detail when it's wrong. */
  | { readonly kind: "submit"; readonly correct: boolean };

export type MoveResult = MoveOutcome & { readonly status: GameStatus };

export type InvalidMoveCode =
  | "game-over"
  | "unknown-move"
  | "unknown-crib"
  | "bad-word"
  | "already-locked"
  | "out-of-range"
  | "not-a-letter"
  | "same-letter"
  | "not-in-message"
  | "already-known"
  | "tentative-only"
  | "blind-only"
  | "incomplete";

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
  const variant = variantOf(state.puzzle);
  const blind = variant.feedback === "blind";
  switch (move.kind) {
    case "lock":
      if (blind) fail("tentative-only", "In blind mode, placements stay on your device until you submit");
      if (variant.words === "free") {
        if (typeof move.crib !== "string" || !/^[A-Z]+$/.test(move.crib) || move.crib.length < MIN_CRIB_LENGTH) {
          fail("bad-word", `Words need at least ${MIN_CRIB_LENGTH} letters, A–Z`);
        }
        if (state.locked.some((p) => p.crib === move.crib && p.pos === move.pos)) fail("already-locked", `${move.crib} is already locked there`);
      } else {
        if (!cribs.includes(move.crib)) fail("unknown-crib", `${move.crib} isn't a crib in this puzzle`);
        if (state.locked.some((p) => p.crib === move.crib)) fail("already-locked", `${move.crib} is already locked`);
      }
      if (!fitsMessage(ciphertext, move.crib, move.pos)) fail("out-of-range", `${move.crib} doesn't fit at ${move.pos}`);
      return;
    case "swap":
      if (blind) fail("tentative-only", "In blind mode, swaps stay on your device until you submit");
      if (!isLetter(move.a) || !isLetter(move.b)) fail("not-a-letter", "Swaps are between two letters A–Z");
      if (move.a === move.b) fail("same-letter", "A letter can't swap with itself");
      if (!ciphertext.includes(move.a) && !ciphertext.includes(move.b)) {
        fail("not-in-message", `Neither ${move.a} nor ${move.b} is in the message`);
      }
      if (state.known[move.a] === move.b) fail("already-known", `${move.a}⇄${move.b} is already known`);
      return;
    case "submit": {
      if (!blind) fail("blind-only", "Submitting a whole decryption is only for blind mode");
      const mapping = (move.mapping ?? {}) as Record<string, unknown>;
      const complete = [...ciphertext].every((c) => {
        const partner = mapping[c];
        return isLetter(partner) && partner !== c && mapping[partner] === c;
      });
      if (!complete) fail("incomplete", "Give every letter in the message a partner before submitting");
      return;
    }
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
    case "submit":
      return submit(state, move, solution);
  }
}

function lock(state: GameState, move: Extract<Move, { kind: "lock" }>, solution: Solution) {
  const placement: Placement = { crib: move.crib, pos: move.pos };
  // With their own words, players may overlap words that are both really there.
  const free = variantOf(state.puzzle).words === "free";
  const check = checkPlacement(state.puzzle.ciphertext, placement, state.known, free ? [] : state.locked);
  const correct = free
    ? solution.plaintext.slice(move.pos, move.pos + move.crib.length) === move.crib
    : solution.positions[move.crib] === move.pos;
  if (!correct) return mistake(state, { kind: "lock", correct: false, reasons: check.ok ? [] : check.reasons });
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
  const variant = variantOf(state.puzzle);
  const forced = variant.words === "free" ? null : bestMove(state, reasoningLevel(state.puzzle.difficulty));
  const result: Hint = forced ? { kind: "forced", move: forced } : { kind: "reveal", move: revealMove(state, solution) };
  let next: GameState = { ...state, hints: state.hints + 1 };
  let revealed: Pair[] = [];
  if (variant.feedback === "blind") {
    // Blind mode has no per-move checks, so a hint confirms its move straight away.
    const move = result.kind === "forced" ? toMove(result.move) : result.move;
    ({ state: next, revealed } = confirm(next, move));
  }
  return { state: next, result: { kind: "hint", hint: result, revealed, status: next.status } as const };
}

function submit(state: GameState, move: Extract<Move, { kind: "submit" }>, solution: Solution) {
  const letters = [...new Set(state.puzzle.ciphertext)] as Letter[];
  if (!letters.every((c) => move.mapping[c] === solution.key[c])) return mistake(state, { kind: "submit", correct: false });
  const known = withPairs(state.known, letters.map((c) => pair(c, solution.key[c])));
  const next: GameState = { ...state, known, status: "won" };
  return { state: next, result: { kind: "submit", correct: true, status: next.status } as const };
}

/** Applies a move known to be correct, without counting it. */
function confirm(state: GameState, move: Move): { state: GameState; revealed: Pair[] } {
  let pairs: Pair[] = [];
  let locked = state.locked;
  if (move.kind === "lock") {
    pairs = [...move.crib].map((w, i) => pair(w as Letter, state.puzzle.ciphertext[move.pos + i] as Letter));
    locked = [...locked, { crib: move.crib, pos: move.pos }];
  } else if (move.kind === "swap") {
    pairs = [pair(move.a, move.b)];
  }
  const revealed = dedupe(pairs).filter(([a, b]) => state.known[a] !== b);
  const known = withPairs(state.known, revealed);
  const status = isSolved(state.puzzle.ciphertext, known) ? "won" : state.status;
  return { state: { ...state, known, locked, status }, revealed };
}

/**
 * A correct move to reveal when nothing is forced: the true position of the crib
 * with the fewest candidates, a word from the message when players bring their own,
 * or failing those a true swap.
 */
function revealMove(state: GameState, solution: Solution): Move {
  const variant = variantOf(state.puzzle);
  if (variant.words === "free" && solution.text) {
    const word = bestWord(state, solution.text);
    if (word) return { kind: "lock", crib: word.word, pos: word.pos };
  } else if (variant.words === "cribs") {
    const unlocked = [...candidates(state, 1)]
      .filter(([crib]) => solution.positions[crib] !== undefined)
      .sort((a, b) => a[1].length - b[1].length);
    const first = unlocked[0];
    if (first) return { kind: "lock", crib: first[0], pos: solution.positions[first[0]]! };
  }
  const letter = [...state.puzzle.ciphertext].find((ch) => !state.known[ch as Letter]) as Letter;
  return { kind: "swap", a: letter, b: solution.key[letter] };
}

/** The message word (3+ letters) that would decrypt the most new letters. */
function bestWord(state: GameState, text: string): { word: string; pos: number } | null {
  let best: { word: string; pos: number; gain: number } | null = null;
  let pos = 0;
  for (const word of text.split(" ")) {
    if (word.length >= MIN_CRIB_LENGTH && !state.locked.some((p) => p.crib === word && p.pos === pos)) {
      const cipher = new Set(state.puzzle.ciphertext.slice(pos, pos + word.length));
      const gain = [...state.puzzle.ciphertext].filter((c) => cipher.has(c) && !state.known[c as Letter]).length;
      if (gain > 0 && (!best || gain > best.gain)) best = { word, pos, gain };
    }
    pos += word.length;
  }
  return best && { word: best.word, pos: best.pos };
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

function dedupe(pairs: readonly Pair[]): Pair[] {
  return [...new Map(pairs.map((p) => [p.join(""), p])).values()];
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
