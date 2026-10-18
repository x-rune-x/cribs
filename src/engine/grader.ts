import { type Board, type ForcedMove, closure, emptyBoard, reasoningLevel, shortestPath } from "./solver";
import type { Difficulty } from "./state";

export interface Grade {
  /** Easy: L1 forced moves win. Medium: needs L2. Hard: needs L3 (trial and error). */
  readonly difficulty: Difficulty;
  /** The fewest forced moves that win, at the puzzle's reasoning level. */
  readonly par: number;
  /** One par-length route: Cribbot's own path. */
  readonly path: readonly ForcedMove[];
}

/**
 * Grades a puzzle. It assumes the puzzle has exactly one solution (the generator
 * checks that first), and returns null if even L3 logic can't finish it.
 */
export function grade(puzzle: Board["puzzle"]): Grade | null {
  const board = emptyBoard(puzzle);
  const difficulty: Difficulty | null = closure(board, 1)
    ? "easy"
    : closure(board, 2)
      ? "medium"
      : closure(board, 3)
        ? "hard"
        : null;
  if (!difficulty) return null;
  const path = shortestPath(board, reasoningLevel(difficulty));
  if (!path) throw new Error("A solvable puzzle has no forced path");
  return { difficulty, par: path.length, path };
}
