import type { GameState } from "./state";

export interface ScoringConfig {
  readonly start: number;
  readonly perMistake: number;
  readonly perHint: number;
  /** Beating par takes word recognition via declared swaps. */
  readonly perMoveUnderPar: number;
  readonly perMoveOverPar: number;
  readonly min: number;
  /** null for no ceiling, so a clean game that beats par scores above 100. */
  readonly max: number | null;
}

export const SCORING: ScoringConfig = {
  start: 100,
  perMistake: 15,
  perHint: 10,
  perMoveUnderPar: 5,
  perMoveOverPar: 3,
  min: 0,
  max: null,
};

/** Skill score. Moves are correct lock and swap moves; mistakes and hints are charged separately. */
export function score(
  game: Pick<GameState, "status" | "moves" | "mistakes" | "hints">,
  par: number,
  config: ScoringConfig = SCORING,
): number {
  if (game.status === "failed") return 0;
  const raw =
    config.start -
    config.perMistake * game.mistakes -
    config.perHint * game.hints +
    config.perMoveUnderPar * Math.max(0, par - game.moves) -
    config.perMoveOverPar * Math.max(0, game.moves - par);
  const capped = config.max === null ? raw : Math.min(config.max, raw);
  return Math.max(config.min, capped);
}
