// The static playtest build ships every puzzle, answers included, in one file.
// Only for playtests: anyone can read the answers in the browser.

import type { PuzzleView } from "./api";

export interface PlaytestPuzzle extends PuzzleView {
  solution: {
    text: string;
    plaintext: string;
    positions: Record<string, number>;
    /** All 13 swaps, as "A⇄G B⇄C …". */
    key: string;
  };
}

export interface PlaytestData {
  /** Changes whenever the puzzle set does, so saved games from an old set are ignored. */
  seed: string;
  generatedAt: number;
  puzzles: PlaytestPuzzle[];
}

/** Where the build writes the puzzle file, relative to the site's base URL. */
export const PLAYTEST_DATA_FILE = "playtest-data.json";
