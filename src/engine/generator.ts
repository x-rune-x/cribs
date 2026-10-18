// Turns plain messages into puzzles: a seeded key, a crib subset, and checks
// that the result has one solution, covers the message and hits the target
// difficulty.

import { type Key, applyKey, createRng, generateKey } from "./cipher";
import { CRIB_COUNT, GENERATED_DIFFICULTIES, MESSAGE_LENGTH, MIN_CRIB_LENGTH } from "./config";
import { type Grade, grade } from "./grader";
import { countSolutions } from "./solver";
import type { Difficulty, PublicPuzzle, Solution } from "./state";

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
