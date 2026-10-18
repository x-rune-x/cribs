// Turns plain messages into puzzles: a seeded key, a crib subset, and checks
// that the result has one solution, covers the message and hits the target
// difficulty.

import { type Key, type Letter, type Rng, applyKey, createRng, generateKey, pair } from "./cipher";
import { CRIB_COUNT, GENERATED_DIFFICULTIES, MESSAGE_LENGTH, MIN_CRIB_LENGTH } from "./config";
import { type Grade, grade } from "./grader";
import { countSolutions } from "./solver";
import type { Difficulty, PublicPuzzle, Solution } from "./state";
import { type Variant, variantOf } from "./variants";

export interface Message {
  /** Upper-case words separated by single spaces, as shown on the end screen. */
  readonly text: string;
  readonly plaintext: string;
  readonly words: readonly string[];
}

export function parseMessage(line: string): Message {
  const words = line.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  return { text: words.join(" "), plaintext: words.join(""), words };
}

/** One message per line. Blank lines and lines starting with # are skipped. */
export function parseMessages(file: string): Message[] {
  return file
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(parseMessage);
}

/**
 * Distinct words of at least 3 letters that occur exactly once in the letters.
 * A word that also appears elsewhere (THE inside OTHER, or across a word
 * boundary) could be placed in two spots, so it can't be a crib.
 */
export function cribCandidates(message: Message): string[] {
  const words = new Set(message.words.filter((w) => w.length >= MIN_CRIB_LENGTH));
  return [...words].filter((w) => occurrences(message.plaintext, w) === 1).sort();
}

function occurrences(text: string, word: string): number {
  let count = 0;
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) count++;
  return count;
}

/** Problems that stop a message from becoming a puzzle (empty if it's fine). */
export function messageProblems(message: Message): string[] {
  const problems: string[] = [];
  const n = message.plaintext.length;
  if (n < MESSAGE_LENGTH.min || n > MESSAGE_LENGTH.max) {
    problems.push(`${n} letters (needs ${MESSAGE_LENGTH.min}–${MESSAGE_LENGTH.max})`);
  }
  const cribs = cribCandidates(message).length;
  if (cribs < CRIB_COUNT.min) problems.push(`only ${cribs} usable cribs (needs at least ${CRIB_COUNT.min})`);
  return problems;
}

/** True if the cribs at their true positions reveal a swap for every letter in the message. */
export function covers(ciphertext: string, plaintext: string, cribs: readonly string[]): boolean {
  const revealed = new Set<string>();
  for (const crib of cribs) {
    const pos = plaintext.indexOf(crib);
    for (let i = 0; i < crib.length; i++) {
      revealed.add(crib[i]!);
      revealed.add(ciphertext[pos + i]!);
    }
  }
  return [...ciphertext].every((ch) => revealed.has(ch));
}

export interface Evaluation {
  readonly ciphertext: string;
  readonly cribs: readonly string[];
  /** Capped at 2. */
  readonly solutions: number;
  readonly covered: boolean;
  /** Only graded when the puzzle is unique and covered; null if L3 can't finish it either. */
  readonly grade: Grade | null;
}

export function evaluate(message: Message, key: Key, cribs: readonly string[]): Evaluation {
  const ciphertext = applyKey(key, message.plaintext);
  const solutions = countSolutions({ ciphertext, cribs }, 2);
  const covered = covers(ciphertext, message.plaintext, cribs);
  const graded = solutions === 1 && covered ? grade({ ciphertext, cribs }) : null;
  return { ciphertext, cribs, solutions, covered, grade: graded };
}

export interface AttemptReport {
  readonly cribCount: number;
  readonly length: number;
  readonly unique: boolean;
  readonly covered: boolean;
  /** Null unless the attempt was unique and covered; "unsolvable" if logic can't finish it. */
  readonly difficulty: Difficulty | "unsolvable" | null;
  readonly par: number | null;
}

export interface GenerateOptions {
  readonly seed: string;
  /** Acceptable difficulties, most wanted first. Defaults to GENERATED_DIFFICULTIES. */
  readonly targets?: readonly Difficulty[];
  /** Attempts before giving up. Each attempt uses a new key and crib subset. */
  readonly attempts?: number;
  readonly cribCount?: { readonly min: number; readonly max: number };
  /** Stop at the first attempt that hits the most wanted difficulty. Defaults to true. */
  readonly stopEarly?: boolean;
  readonly onAttempt?: (report: AttemptReport) => void;
}

export interface GeneratedPuzzle {
  readonly puzzle: PublicPuzzle;
  readonly solution: Solution;
  readonly text: string;
  /** Reproduces this puzzle's key and crib subset. */
  readonly seed: string;
}

export function generatePuzzle(message: Message, options: GenerateOptions): GeneratedPuzzle | null {
  const words = cribCandidates(message);
  const { min, max } = options.cribCount ?? CRIB_COUNT;
  if (words.length < min) return null;
  const targets = options.targets ?? GENERATED_DIFFICULTIES;
  const attempts = options.attempts ?? 200;
  const stopEarly = options.stopEarly ?? true;

  let best: { generated: GeneratedPuzzle; rank: number } | null = null;
  for (let i = 0; i < attempts; i++) {
    const seed = `${options.seed}:${i}`;
    const rng = createRng(seed);
    const key = generateKey(rng);
    const cribs = rng.shuffle(words).slice(0, rng.range(min, Math.min(max, words.length))).sort();
    const result = evaluate(message, key, cribs);
    const unique = result.solutions === 1;
    options.onAttempt?.({
      cribCount: cribs.length,
      length: message.plaintext.length,
      unique,
      covered: result.covered,
      difficulty: unique && result.covered ? (result.grade?.difficulty ?? "unsolvable") : null,
      par: result.grade?.par ?? null,
    });
    if (!result.grade) continue;
    const rank = targets.indexOf(result.grade.difficulty);
    if (rank === -1 || (best && best.rank <= rank)) continue;
    best = {
      rank,
      generated: {
        puzzle: { ciphertext: result.ciphertext, cribs, difficulty: result.grade.difficulty, par: result.grade.par },
        solution: {
          plaintext: message.plaintext,
          positions: Object.fromEntries(cribs.map((crib) => [crib, message.plaintext.indexOf(crib)])),
          key,
        },
        text: message.text,
        seed,
      },
    };
    if (rank === 0 && stopEarly) break;
  }
  return best?.generated ?? null;
}

// Lab variants

/** Distinct swaps the player must read for the message letters that the cribs don't reveal. */
export function uncoveredPairs(ciphertext: string, plaintext: string, cribs: readonly string[]): number {
  const revealed = new Set<string>();
  for (const crib of cribs) {
    const pos = plaintext.indexOf(crib);
    for (let i = 0; i < crib.length; i++) {
      revealed.add(crib[i]!);
      revealed.add(ciphertext[pos + i]!);
    }
  }
  return pairsToRead(ciphertext, plaintext, revealed);
}

function pairsToRead(ciphertext: string, plaintext: string, revealed: Set<string>): number {
  const pairs = new Set<string>();
  for (let i = 0; i < ciphertext.length; i++) {
    const c = ciphertext[i]!;
    if (!revealed.has(c)) pairs.add(pair(c as Letter, plaintext[i] as Letter).join(""));
  }
  return pairs.size;
}

/**
 * Par when players bring their own words: the fewest moves that decrypt
 * everything, using message words of 3+ letters at their positions plus a
 * declared swap for each pair the words leave out.
 */
export function wordCoverPar(message: Message, ciphertext: string): number {
  const words: { word: string; pos: number }[] = [];
  let pos = 0;
  for (const word of message.words) {
    if (word.length >= MIN_CRIB_LENGTH) words.push({ word, pos });
    pos += word.length;
  }
  const n = Math.min(words.length, 16);
  let best = Infinity;
  for (let mask = 0; mask < 1 << n; mask++) {
    const revealed = new Set<string>();
    let used = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      used++;
      const { word, pos: at } = words[i]!;
      for (let j = 0; j < word.length; j++) {
        revealed.add(word[j]!);
        revealed.add(ciphertext[at + j]!);
      }
    }
    best = Math.min(best, used + pairsToRead(ciphertext, message.plaintext, revealed));
  }
  return best;
}

function pickDecoy(rng: Rng, pool: readonly string[], message: Message): string | null {
  const options = pool.filter(
    (w) => w.length >= MIN_CRIB_LENGTH && w.length <= 8 && /^[A-Z]+$/.test(w) && !message.plaintext.includes(w),
  );
  return options.length > 0 ? rng.pick(options) : null;
}

export interface VariantOptions {
  readonly seed: string;
  /** Words a decoy can be drawn from, e.g. every word of every message. */
  readonly decoyPool?: readonly string[];
  readonly attempts?: number;
}

/** Makes a puzzle for a Lab variant, or null if no attempt works for this message. */
export function generateVariant(message: Message, variant: Variant, options: VariantOptions): GeneratedPuzzle | null {
  const blind = variant.feedback === "blind";
  const text = message.text;
  if (variant.words === "free") {
    const seed = `${options.seed}:0`;
    const key = generateKey(createRng(seed));
    const ciphertext = applyKey(key, message.plaintext);
    const par = blind ? 0 : wordCoverPar(message, ciphertext);
    return {
      puzzle: { ciphertext, cribs: [], difficulty: "hard", par, variant },
      solution: { plaintext: message.plaintext, positions: {}, key },
      text,
      seed,
    };
  }

  const words = cribCandidates(message);
  const [min, max] = variant.coverage === "partial" ? [2, 3] : [CRIB_COUNT.min, CRIB_COUNT.max];
  if (words.length < min) return null;
  for (let i = 0; i < (options.attempts ?? 200); i++) {
    const seed = `${options.seed}:${i}`;
    const rng = createRng(seed);
    const key = generateKey(rng);
    const real = rng.shuffle(words).slice(0, rng.range(min, Math.min(max, words.length)));
    const decoy = variant.decoy ? pickDecoy(rng, options.decoyPool ?? [], message) : null;
    if (variant.decoy && !decoy) return null;
    const cribs = [...real, ...(decoy ? [decoy] : [])].sort();
    const ciphertext = applyKey(key, message.plaintext);
    const puzzle = { ciphertext, cribs, variant };
    if (countSolutions(puzzle, 2) !== 1) continue;
    const toRead = uncoveredPairs(ciphertext, message.plaintext, real);
    if (variant.coverage === "full" ? toRead !== 0 : toRead < 1 || toRead > 3) continue;
    const graded = grade(puzzle);
    if (!graded) continue;
    return {
      puzzle: { ...puzzle, difficulty: graded.difficulty, par: blind ? 0 : graded.par + toRead },
      solution: {
        plaintext: message.plaintext,
        positions: Object.fromEntries(real.map((crib) => [crib, message.plaintext.indexOf(crib)])),
        key,
      },
      text,
      seed,
    };
  }
  return null;
}

function isVariant(value: unknown): value is Variant {
  const v = value as Variant | undefined;
  return (
    !!v &&
    (v.words === "cribs" || v.words === "free") &&
    (v.feedback === "per-move" || v.feedback === "blind") &&
    (v.coverage === "full" || v.coverage === "partial") &&
    typeof v.decoy === "boolean"
  );
}

/**
 * Re-checks a generated puzzle of any variant against the engine, so a bad file
 * can't reach players. Returns what's wrong, or null.
 */
export function verifyPuzzle(puzzle: PublicPuzzle, solution: Solution, text: string): string | null {
  if (puzzle.variant !== undefined && !isVariant(puzzle.variant)) return "its variant isn't valid";
  const variant = variantOf(puzzle);
  const blind = variant.feedback === "blind";
  try {
    if (applyKey(solution.key, solution.plaintext) !== puzzle.ciphertext) {
      return "the key doesn't encrypt the plaintext to the ciphertext";
    }
  } catch {
    return "the key doesn't cover the message";
  }
  if (text.replace(/ /g, "") !== solution.plaintext) return "the text doesn't match the plaintext";
  if ([...puzzle.cribs].sort().join() !== puzzle.cribs.join()) return "the cribs aren't in alphabetical order";

  if (variant.words === "free") {
    if (puzzle.cribs.length > 0) return "a puzzle where players bring their own words can't list cribs";
    const par = blind ? 0 : wordCoverPar(parseMessage(text), puzzle.ciphertext);
    return puzzle.par === par ? null : "its par doesn't match the engine";
  }

  const real = puzzle.cribs.filter((crib) => solution.positions[crib] !== undefined);
  const decoys = puzzle.cribs.filter((crib) => solution.positions[crib] === undefined);
  if (decoys.length !== (variant.decoy ? 1 : 0)) {
    return variant.decoy ? "a decoy puzzle needs exactly one decoy" : "every crib needs a position";
  }
  if (decoys.some((d) => solution.plaintext.includes(d))) return "the decoy is in the message";
  for (const crib of real) {
    const pos = solution.positions[crib]!;
    if (solution.plaintext.slice(pos, pos + crib.length) !== crib) return `${crib} isn't at its stated position`;
  }
  if (countSolutions(puzzle, 2) !== 1) return "it doesn't have exactly one solution";
  const toRead = uncoveredPairs(puzzle.ciphertext, solution.plaintext, real);
  if (variant.coverage === "full" && toRead > 0) return "the cribs don't reveal every letter";
  if (variant.coverage === "partial" && toRead === 0) return "partial coverage needs some letters left to read";
  const graded = grade(puzzle);
  if (!graded) return "logic can't place the cribs";
  const par = blind ? 0 : graded.par + toRead;
  if (graded.difficulty !== puzzle.difficulty || par !== puzzle.par) return "its difficulty or par doesn't match the engine";
  return null;
}
