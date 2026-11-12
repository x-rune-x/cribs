// Builds the static playtest site's puzzle set: daily puzzles from a start date,
// practice puzzles and Lab puzzles, each from a different message. The same
// options always give the same puzzles, so rebuilding never changes a day's puzzle.

import {
  type GeneratedPuzzle,
  LAB_VARIANTS,
  type Message,
  STANDARD_VARIANT,
  createRng,
  formatKey,
  generatePuzzle,
  generateVariant,
  verifyPuzzle,
} from "../../src/engine";
import { GOLDEN_TEXT, goldenPuzzle, goldenSolution } from "../../src/engine/fixtures/golden";
import { addDays } from "../../shared/dates";
import type { PlaytestData, PlaytestPuzzle } from "../../shared/types/playtest";

export interface PlaytestOptions {
  /** Change it to make a fresh puzzle set (saved games from the old set are then ignored). */
  seed: string;
  /** The first daily puzzle's date, YYYY-MM-DD. */
  start: string;
  days: number;
  practice: number;
  /** Lab puzzles per Lab variant. */
  perVariant: number;
  /** End-to-end tests only: the golden puzzle as the first daily. */
  golden?: boolean;
}

export function buildPlaytestSet(sentences: Message[], lists: Message[], options: PlaytestOptions): PlaytestData {
  const { seed } = options;
  const rng = createRng(seed);
  const pool = rng.shuffle(sentences);
  const listPool = rng.shuffle(lists);
  const decoyPool = [...new Set([...sentences, ...lists].flatMap((m) => m.words))];
  let next = 0;
  let nextList = 0;
  const puzzles: PlaytestPuzzle[] = [];

  const add = (kind: PlaytestPuzzle["kind"], generated: GeneratedPuzzle, date: string | null, label: string | null) => {
    const { puzzle, solution, text } = generated;
    const problem = verifyPuzzle(puzzle, solution, text);
    if (problem) throw new Error(`Generated a bad puzzle (${problem}): ${text}`);
    const number = puzzles.length + 1;
    puzzles.push({
      // From the content, so a puzzle that changes (say, after editing the config) gets a new id,
      // and a friend's saved game can never end up attached to a different puzzle.
      id: `${seed}-${kind}-${hash(`${puzzle.ciphertext}|${puzzle.cribs.join(",")}`)}`,
      number,
      kind,
      date,
      ciphertext: puzzle.ciphertext,
      cribs: [...puzzle.cribs],
      difficulty: puzzle.difficulty,
      par: puzzle.par,
      variant: puzzle.variant ?? STANDARD_VARIANT,
      label,
      solution: { text, plaintext: solution.plaintext, positions: { ...solution.positions }, key: formatKey(solution.key) },
    });
  };

  // Daily puzzles, alternating which tier is preferred so the week has a mix.
  let day = 0;
  if (options.golden) {
    add("daily", { puzzle: goldenPuzzle, solution: goldenSolution, text: GOLDEN_TEXT, seed: "golden" }, options.start, null);
    day = 1;
  }
  while (day < options.days && next < pool.length) {
    const message = pool[next++]!;
    const targets = day % 2 === 0 ? (["easy", "medium"] as const) : (["medium", "easy"] as const);
    const generated = generatePuzzle(message, { seed: `${seed}:daily:${day}`, targets });
    if (!generated) continue;
    add("daily", generated, addDays(options.start, day), null);
    day++;
  }

  for (let made = 0; made < options.practice && next < pool.length; ) {
    const generated = generatePuzzle(pool[next++]!, { seed: `${seed}:practice:${made}` });
    if (!generated) continue;
    add("practice", generated, null, null);
    made++;
  }

  for (const { label, variant, messages } of LAB_VARIANTS) {
    for (let made = 0; made < options.perVariant; ) {
      const message = messages === "lists" ? listPool[nextList++] : pool[next++];
      if (!message) break;
      const generated = generateVariant(message, variant, { seed: `${seed}:lab:${label}:${made}`, decoyPool });
      if (!generated) continue;
      add("lab", generated, null, label);
      made++;
    }
  }

  return { seed, generatedAt: Date.now(), puzzles };
}

/** FNV-1a, as 8 hex digits. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

