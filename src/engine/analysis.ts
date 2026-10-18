// Cribbot's post-game analysis: replays a finished game move by move, rates
// each move, and says what Cribbot would have played.

import { type Pair, pairsOf } from "./cipher";
import { ENGINE_VERSION } from "./config";
import { describeElimination, describeForcedMove, describeHint, describeMove, describePlacement, describeSwapReason } from "./explain";
import { type Placement, checkSwap } from "./rules";
import { score } from "./scoring";
import { type ForcedMove, type Level, explainForced, reasoningLevel, shortestPath, toMove, whyImpossible } from "./solver";
import { type GameState, type GameStatus, type Move, type PublicPuzzle, type Solution, applyMove, newGame } from "./state";

/**
 * best:    forced, and on a par-length path from where the player was
 * good:    forced, but it didn't shorten the route (e.g. it revealed nothing new)
 * leap:    correct, but not yet provable from crib logic (word recognition or a lucky guess)
 * mistake: wrong
 * hint:    the player asked Cribbot
 */
export type Rating = "best" | "good" | "leap" | "mistake" | "hint";

export interface AnalysisStep {
  readonly seq: number;
  readonly before: {
    readonly known: Pair[];
    readonly locked: Placement[];
    readonly moves: number;
    readonly mistakes: number;
    readonly hints: number;
  };
  /** Cribbot's best move at this point: the first step of a shortest forced path. */
  readonly best: ForcedMove | null;
  /** Forced moves still needed to win, before this move. Null if logic alone can't finish from here. */
  readonly remaining: number | null;
  readonly move: Move;
  /** Null for hints. */
  readonly correct: boolean | null;
  readonly rating: Rating;
  readonly explanation: string;
}

export interface AnalysisSummary {
  readonly status: GameStatus;
  readonly score: number;
  readonly moves: number;
  readonly par: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly leaps: number;
  readonly cribbotPath: readonly ForcedMove[];
}

export interface Analysis {
  /** Re-analyse stored games when this differs from ENGINE_VERSION. */
  readonly engineVersion: number;
  readonly level: Level;
  readonly steps: readonly AnalysisStep[];
  readonly summary: AnalysisSummary;
}

export function analyse(puzzle: PublicPuzzle, solution: Solution, moves: readonly Move[]): Analysis {
  const level = reasoningLevel(puzzle.difficulty);
  let state = newGame(puzzle);
  const cribbotPath = shortestPath(state, level) ?? [];
  const steps: AnalysisStep[] = [];
  let leaps = 0;

  for (const [i, move] of moves.entries()) {
    if (state.status !== "playing") break;
    const pathBefore = shortestPath(state, level);
    const forced = explainForced(state, move, level);
    const { state: next, result } = applyMove(state, move, solution);

    let rating: Rating;
    let explanation: string;
    if (result.kind === "hint") {
      rating = "hint";
      explanation = `Cribbot's hint: ${describeHint(result.hint)}`;
    } else if (!result.correct) {
      rating = "mistake";
      explanation = explainMistake(state, move, level);
    } else if (!forced) {
      rating = "leap";
      leaps++;
      explanation = "Correct, but the cribs couldn't prove it yet: word recognition or a lucky guess.";
    } else {
      const pathAfter = shortestPath(next, level);
      const onPar = pathBefore !== null && pathAfter !== null && pathAfter.length === pathBefore.length - 1;
      rating = onPar ? "best" : "good";
      explanation = onPar
        ? describeForcedMove(forced)
        : `Forced, but it didn't bring the finish any closer. ${bestAdvice(pathBefore?.[0])}`;
    }

    steps.push({
      seq: i + 1,
      before: snapshot(state),
      best: pathBefore?.[0] ?? null,
      remaining: pathBefore?.length ?? null,
      move,
      correct: result.kind === "hint" ? null : result.correct,
      rating,
      explanation,
    });
    state = next;
  }

  return {
    engineVersion: ENGINE_VERSION,
    level,
    steps,
    summary: {
      status: state.status,
      score: score(state, puzzle.par),
      moves: state.moves,
      par: puzzle.par,
      mistakes: state.mistakes,
      hints: state.hints,
      leaps,
      cribbotPath,
    },
  };
}

function explainMistake(state: GameState, move: Move, level: Level): string {
  if (move.kind === "lock") {
    const placement = { crib: move.crib, pos: move.pos };
    const elimination = whyImpossible(state, placement, level);
    return elimination
      ? describeElimination(placement, elimination)
      : `${move.crib} isn't at ${move.pos + 1}, though nothing you knew ruled it out yet.`;
  }
  if (move.kind === "swap") {
    const [reason] = checkSwap(state.known, move.a, move.b);
    return reason
      ? `${move.a}⇄${move.b} was ruled out: ${describeSwapReason(reason, "past")}.`
      : `${move.a} and ${move.b} don't swap, though nothing you knew ruled it out yet.`;
  }
  if (move.kind === "submit") return "The submitted decryption wasn't right.";
  return "";
}

function bestAdvice(best: ForcedMove | undefined): string {
  return best ? `Cribbot would play: ${describeMove(toMove(best))}.` : "";
}

function snapshot(state: GameState): AnalysisStep["before"] {
  return {
    known: pairsOf(state.known),
    locked: [...state.locked],
    moves: state.moves,
    mistakes: state.mistakes,
    hints: state.hints,
  };
}
