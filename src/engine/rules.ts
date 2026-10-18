// Placement rules. Placing crib `w` at position `p` asserts w[i] ⇄ ciphertext[p+i]
// for every i. Positions are 0-based throughout the engine; the UI adds 1.

import { type Letter, type Pair, type SwapMap, comparePairs, pair, pairsOf } from "./cipher";

/** A crib at a 0-based position in the message. */
export interface Placement {
  readonly crib: string;
  readonly pos: number;
}

export type PlacementReason =
  /** A crib letter sits on the same ciphertext letter. */
  | { readonly kind: "self-encrypt"; readonly letter: Letter; readonly index: number }
  /** The placement pairs one letter with two different letters. */
  | {
      readonly kind: "self-contradiction";
      readonly letter: Letter;
      readonly partners: readonly [Letter, Letter];
      readonly indices: readonly [number, number];
    }
  /** The placement pairs a letter differently from a swap that's already known. */
  | {
      readonly kind: "conflicts-known";
      readonly letter: Letter;
      readonly would: Letter;
      readonly known: Letter;
      readonly index: number;
    }
  | { readonly kind: "overlaps-locked"; readonly other: Placement };

export type PlacementCheck =
  | { readonly ok: true; readonly pairs: Pair[] }
  | { readonly ok: false; readonly reasons: PlacementReason[] };

export function fitsMessage(ciphertext: string, crib: string, pos: number): boolean {
  return Number.isInteger(pos) && pos >= 0 && pos + crib.length <= ciphertext.length;
}

export function overlaps(a: Placement, b: Placement): boolean {
  return a.pos < b.pos + b.crib.length && b.pos < a.pos + a.crib.length;
}

/**
 * Checks a placement against the rules, the known swaps and the locked cribs.
 * Returns the swaps it implies, or every reason it's impossible.
 */
export function checkPlacement(
  ciphertext: string,
  placement: Placement,
  known: SwapMap = {},
  locked: readonly Placement[] = [],
): PlacementCheck {
  const { crib, pos } = placement;
  if (!fitsMessage(ciphertext, crib, pos)) throw new RangeError(`${crib} doesn't fit at ${pos}`);

  const reasons: PlacementReason[] = [];
  const partners = new Map<Letter, { partner: Letter; index: number }>();
  const reported = new Set<string>();
  const pairs = new Map<string, Pair>();
  const report = (key: string, reason: PlacementReason) => {
    if (reported.has(key)) return;
    reported.add(key);
    reasons.push(reason);
  };

  for (let i = 0; i < crib.length; i++) {
    const w = crib[i] as Letter;
    const c = ciphertext[pos + i] as Letter;
    const index = pos + i;
    if (w === c) {
      reasons.push({ kind: "self-encrypt", letter: w, index });
      continue;
    }
    for (const [x, y] of [
      [w, c],
      [c, w],
    ] as const) {
      const prev = partners.get(x);
      if (!prev) partners.set(x, { partner: y, index });
      else if (prev.partner !== y) {
        report(`contradiction:${x}:${[prev.partner, y].sort().join("")}`, {
          kind: "self-contradiction",
          letter: x,
          partners: [prev.partner, y],
          indices: [prev.index, index],
        });
      }
    }
    const conflict = knownConflict(known, w, c);
    if (conflict) report(`known:${conflict.letter}:${conflict.would}`, { kind: "conflicts-known", ...conflict, index });
    const p = pair(w, c);
    pairs.set(p.join(""), p);
  }

  for (const other of locked) {
    if (overlaps(placement, other)) reasons.push({ kind: "overlaps-locked", other });
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, pairs: [...pairs.values()].sort(comparePairs) };
}

function knownConflict(known: SwapMap, a: Letter, b: Letter) {
  const ka = known[a];
  if (ka && ka !== b) return { letter: a, would: b, known: ka };
  const kb = known[b];
  if (kb && kb !== a) return { letter: b, would: a, known: kb };
  return null;
}

/** For every position of a crib, the reasons it's impossible (empty where it fits). Used by assist mode. */
export function scanPlacements(
  ciphertext: string,
  crib: string,
  known: SwapMap = {},
  locked: readonly Placement[] = [],
): PlacementReason[][] {
  const scan: PlacementReason[][] = [];
  for (let pos = 0; pos + crib.length <= ciphertext.length; pos++) {
    const check = checkPlacement(ciphertext, { crib, pos }, known, locked);
    scan.push(check.ok ? [] : check.reasons);
  }
  return scan;
}

export type SwapReason = {
  readonly kind: "conflicts-known";
  readonly letter: Letter;
  readonly would: Letter;
  readonly known: Letter;
};

/** Reasons a declared swap clashes with what's known (empty if it fits). */
export function checkSwap(known: SwapMap, a: Letter, b: Letter): SwapReason[] {
  const reasons: SwapReason[] = [];
  const ka = known[a];
  if (ka && ka !== b) reasons.push({ kind: "conflicts-known", letter: a, would: b, known: ka });
  const kb = known[b];
  if (kb && kb !== a) reasons.push({ kind: "conflicts-known", letter: b, would: a, known: kb });
  return reasons;
}

export type MergeResult =
  | { readonly ok: true; readonly map: SwapMap }
  | { readonly ok: false; readonly letter: Letter; readonly partners: readonly [Letter, Letter] };

export function mergeSwaps(a: SwapMap, b: SwapMap): MergeResult {
  const map: Partial<Record<Letter, Letter>> = { ...a };
  for (const [x, y] of pairsOf(b)) {
    for (const [p, q] of [
      [x, y],
      [y, x],
    ] as const) {
      const existing = map[p];
      if (existing && existing !== q) return { ok: false, letter: p, partners: [existing, q] };
    }
    map[x] = y;
    map[y] = x;
  }
  return { ok: true, map };
}
