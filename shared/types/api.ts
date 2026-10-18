// Shapes the API sends and receives. Nothing here may carry a solution until a
// game has finished.

import type { Difficulty, GameStatus, Hint, Move, MoveResult, Placement, PlacementReason, SwapMap, SwapReason } from "#engine";

export type GameMode = "ranked" | "practice" | "assisted";

export interface PuzzleView {
  id: string;
  number: number;
  kind: "daily" | "practice";
  /** The local date a daily puzzle is for. */
  date: string | null;
  ciphertext: string;
  cribs: string[];
  difficulty: Difficulty;
  par: number;
}

export interface MoveLogEntry {
  seq: number;
  move: Move;
  /** Null for hints. */
  correct: boolean | null;
  /** Why a mistake was impossible, if it was. */
  reasons: (PlacementReason | SwapReason)[];
  hint: Hint | null;
  at: number;
}

export interface FinishedView {
  /** The decrypted message with its spaces. */
  text: string;
  plaintext: string;
  score: number;
  durationMs: number;
}

export interface GameView {
  id: string;
  mode: GameMode;
  status: GameStatus;
  puzzle: PuzzleView;
  known: SwapMap;
  locked: Placement[];
  moves: number;
  mistakes: number;
  hints: number;
  maxMistakes: number;
  log: MoveLogEntry[];
  /** Only present once the game is over. */
  finished: FinishedView | null;
}

export interface MoveResponse {
  result: MoveResult;
  game: GameView;
}

export interface PracticeItem {
  id: string;
  number: number;
  difficulty: Difficulty;
  par: number;
  length: number;
  /** The player's latest game on this puzzle, if any. */
  status: GameStatus | null;
}

export type StartGameRequest =
  | { kind: "daily"; localDate: string }
  | { kind: "practice"; puzzleId: string; localDate: string; fresh?: boolean };

// The files written by `npm run generate`, posted to the admin import endpoint.

export interface PuzzleFileEntry {
  id: string;
  ciphertext: string;
  cribs: string[];
  difficulty: Difficulty;
  par: number;
  length: number;
}

export interface SolutionFileEntry {
  id: string;
  text: string;
  plaintext: string;
  positions: Record<string, number>;
  key: string;
  seed: string;
}

export interface ImportRequest {
  puzzles: PuzzleFileEntry[];
  solutions: SolutionFileEntry[];
  /** Make the first `count` new puzzles daily, on consecutive free dates from `from`. The rest become practice. */
  daily?: { count: number; from: string };
}

export interface ImportSummary {
  added: number;
  skipped: string[];
  dailyDates: string[];
  practice: number;
}
