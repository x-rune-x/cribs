// Turns typed reasons into sentences. Positions are shown 1-based.

import { formatPair } from "./cipher";
import type { Placement, PlacementReason, SwapReason } from "./rules";
import type { Elimination, ForcedMove } from "./solver";
import type { Hint, Move } from "./state";

/** Present tense for live feedback, past tense for post-game analysis. */
export type Tense = "present" | "past";

const at = (index: number) => index + 1;

export function describePlacement({ crib, pos }: Placement): string {
  return `${crib} at ${at(pos)}`;
}

export function describePlacementReason(reason: PlacementReason, tense: Tense = "present"): string {
  switch (reason.kind) {
    case "self-encrypt":
      return `${reason.letter} would encrypt to itself at ${at(reason.index)}`;
    case "self-contradiction":
      return `${reason.letter} would pair with both ${reason.partners[0]} and ${reason.partners[1]}`;
    case "conflicts-known":
      return `${reason.letter} would pair with ${reason.would}, but you already ${tense === "past" ? "had" : "have"} ${reason.letter}⇄${reason.known}`;
    case "overlaps-locked":
      return `it would overlap ${describePlacement(reason.other)}, ${tense === "past" ? "which was" : "which is"} locked`;
  }
}

export function describeSwapReason(reason: SwapReason, tense: Tense = "present"): string {
  return `${reason.letter} ${tense === "past" ? "was" : "is"} already paired with ${reason.known}`;
}

export function describeMove(move: Move): string {
  switch (move.kind) {
    case "lock":
      return `Lock ${describePlacement(move)}`;
    case "swap":
      return `Declare ${move.a}⇄${move.b}`;
    case "hint":
      return "Ask for a hint";
  }
}

export function describeForcedMove(move: ForcedMove): string {
  if (move.kind === "lock") {
    const why =
      move.level === 1
        ? "every other spot breaks a rule"
        : move.level === 2
          ? "every other spot breaks a rule or leaves another word with nowhere to go"
          : "every other spot leads to a contradiction a few steps later";
    return `${move.crib} only fits at ${at(move.pos)}: ${why}.`;
  }
  const swap = formatPair(move.pair);
  if (move.because.kind === "last-pair") {
    return `${move.pair[0]} and ${move.pair[1]} are the only letters left, so ${swap}.`;
  }
  return `Every spot left for ${move.because.crib} pairs ${swap}.`;
}

export function describeElimination(placement: Placement, elimination: Elimination): string {
  const where = describePlacement(placement);
  if (elimination.level === 1) {
    return `${where} was ruled out: ${describePlacementReason(elimination.reasons[0]!, "past")}.`;
  }
  if (elimination.level === 2) {
    return `${where} was ruled out: it would leave ${elimination.blocked} with nowhere to go.`;
  }
  return `${where} was ruled out: following it through leaves ${elimination.blocked} with nowhere to go.`;
}

export function describeHint(hint: Hint): string {
  if (hint.kind === "forced") return describeForcedMove(hint.move);
  return `Nothing is forced yet, so here's one correct move. ${describeMove(hint.move)}.`;
}
