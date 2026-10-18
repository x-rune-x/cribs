// Crib's tables. Kept portable to Postgres: timestamps are integer epoch
// milliseconds, JSON goes through Drizzle's JSON mode, and calendar dates are
// YYYY-MM-DD text. Better Auth's tables are generated into auth-schema.ts
// (npm run auth:schema).

import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Difficulty, GameStatus, Move, Placement, SwapMap } from "#engine";
import { user } from "./auth-schema";

export * from "./auth-schema";

export const GAME_MODES = ["ranked", "practice", "assisted"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const puzzles = sqliteTable(
  "puzzles",
  {
    id: text("id").primaryKey(),
    /** Shown to players, e.g. "No. 017". */
    number: integer("number").notNull().unique(),
    /** The local date a daily puzzle is for; null for practice puzzles. */
    publishDate: text("publish_date").unique(),
    kind: text("kind", { enum: ["daily", "practice"] }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    cribs: text("cribs", { mode: "json" }).$type<string[]>().notNull(),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).$type<Difficulty>().notNull(),
    par: integer("par").notNull(),
    length: integer("length").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("puzzles_kind_idx").on(t.kind)],
);

/** Server only: never selected by any query that feeds an API response before a game ends. */
export const puzzleSolutions = sqliteTable("puzzle_solutions", {
  puzzleId: text("puzzle_id")
    .primaryKey()
    .references(() => puzzles.id, { onDelete: "cascade" }),
  /** The message with its spaces, revealed on the end screen. */
  text: text("text").notNull(),
  plaintext: text("plaintext").notNull(),
  positions: text("positions", { mode: "json" }).$type<Record<string, number>>().notNull(),
  /** All 13 swaps, as "A⇄G B⇄C …". */
  key: text("key").notNull(),
  seed: text("seed").notNull(),
});

/** The public board, stored as JSON so a move doesn't need to replay the game. */
export interface StoredBoard {
  known: SwapMap;
  locked: Placement[];
}

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.id),
    mode: text("mode", { enum: GAME_MODES }).notNull(),
    status: text("status", { enum: ["playing", "won", "failed"] }).$type<GameStatus>().notNull(),
    /** The player's local date when the game started. */
    localDate: text("local_date").notNull(),
    board: text("board", { mode: "json" }).$type<StoredBoard>().notNull(),
    moveCount: integer("move_count").notNull().default(0),
    mistakeCount: integer("mistake_count").notNull().default(0),
    hintCount: integer("hint_count").notNull().default(0),
    score: integer("score"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    // At most one ranked game per player per daily puzzle.
    uniqueIndex("games_one_ranked_idx").on(t.userId, t.puzzleId).where(sql`${t.mode} = 'ranked'`),
    index("games_user_idx").on(t.userId, t.startedAt),
    index("games_puzzle_idx").on(t.puzzleId),
  ],
);

export const moves = sqliteTable(
  "moves",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["lock", "swap", "hint"] }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Move>().notNull(),
    /** Null for hints. */
    correct: integer("correct", { mode: "boolean" }),
    /** The engine's typed result: reasons for a mistake, or the hint. */
    reason: text("reason", { mode: "json" }).$type<unknown>(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.seq] })],
);
