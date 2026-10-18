// Experimental rule variants, played in the Lab. A puzzle's variant is public:
// it changes how the game is played, not what the answer is.

import { type Letter, type Pair, type SwapMap, LETTERS } from "./cipher";
import type { Placement } from "./rules";

export interface Variant {
  /** "cribs": the puzzle lists the words. "free": the player types their own. */
  readonly words: "cribs" | "free";
  /** "per-move": the server checks each lock. "blind": placements are unchecked until the whole decryption is submitted. */
  readonly feedback: "per-move" | "blind";
  /** "full": the cribs reveal every letter. "partial": a few swaps are left to read from the decrypted text. */
  readonly coverage: "full" | "partial";
  /** One listed word isn't in the message. */
  readonly decoy: boolean;
}

export const STANDARD_VARIANT: Variant = { words: "cribs", feedback: "per-move", coverage: "full", decoy: false };

export function variantOf(puzzle: { readonly variant?: Variant | null }): Variant {
  return puzzle.variant ?? STANDARD_VARIANT;
}

export function isStandard(variant: Variant): boolean {
  return (Object.keys(STANDARD_VARIANT) as (keyof Variant)[]).every((k) => variant[k] === STANDARD_VARIANT[k]);
}

/** The Lab's combinations. `messages: "lists"` draws from the grammar-light message file. */
export const LAB_VARIANTS: readonly { label: string; variant: Variant; messages: "sentences" | "lists" }[] = [
  { label: "Few words", variant: { ...STANDARD_VARIANT, coverage: "partial" }, messages: "sentences" },
  { label: "Decoy", variant: { ...STANDARD_VARIANT, decoy: true }, messages: "sentences" },
  { label: "Few words, decoy", variant: { ...STANDARD_VARIANT, coverage: "partial", decoy: true }, messages: "sentences" },
  { label: "Lists, few words", variant: { ...STANDARD_VARIANT, coverage: "partial" }, messages: "lists" },
  { label: "Blind", variant: { ...STANDARD_VARIANT, feedback: "blind" }, messages: "sentences" },
  { label: "Blind, decoy", variant: { ...STANDARD_VARIANT, feedback: "blind", decoy: true }, messages: "sentences" },
  { label: "Your own words", variant: { ...STANDARD_VARIANT, words: "free" }, messages: "sentences" },
  { label: "Your own words, blind", variant: { ...STANDARD_VARIANT, words: "free", feedback: "blind" }, messages: "sentences" },
  { label: "Lists, your own words", variant: { ...STANDARD_VARIANT, words: "free" }, messages: "lists" },
];

export interface BlindBoard {
  /** Each letter's partners from confirmed swaps, the player's placements and their declared swaps. */
  readonly partners: Partial<Record<Letter, Letter[]>>;
  /** Letters paired with more than one letter, or placed over themselves. */
  readonly clashes: Letter[];
  /** The full mapping, once every message letter has exactly one partner and nothing clashes. */
  readonly mapping: SwapMap | null;
}

/**
 * Combines what the player has placed in blind mode. Nothing here uses the
 * solution: it only shows where the player's own placements disagree.
 */
export function blindBoard(
  ciphertext: string,
  known: SwapMap,
  placements: readonly Placement[],
  swaps: readonly Pair[],
): BlindBoard {
  const partners = new Map<Letter, Set<Letter>>();
  const clashes = new Set<Letter>();
  const add = (a: Letter, b: Letter) => {
    if (a === b) {
      clashes.add(a);
      return;
    }
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const set = partners.get(x) ?? new Set();
      set.add(y);
      partners.set(x, set);
    }
  };
  for (const letter of LETTERS) {
    const partner = known[letter];
    if (partner) add(letter, partner);
  }
  for (const { crib, pos } of placements) {
    for (let i = 0; i < crib.length; i++) add(crib[i] as Letter, ciphertext[pos + i] as Letter);
  }
  for (const [a, b] of swaps) add(a, b);

  for (const [letter, set] of partners) if (set.size > 1) clashes.add(letter);
  const out: Partial<Record<Letter, Letter[]>> = {};
  for (const [letter, set] of partners) out[letter] = [...set].sort();

  const complete = clashes.size === 0 && [...ciphertext].every((ch) => partners.get(ch as Letter)?.size === 1);
  let mapping: SwapMap | null = null;
  if (complete) {
    const map: Partial<Record<Letter, Letter>> = {};
    for (const [letter, set] of partners) map[letter] = [...set][0]!;
    mapping = map;
  }
  return { partners: out, clashes: [...clashes].sort(), mapping };
}
