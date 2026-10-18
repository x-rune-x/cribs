// Every query the app runs, in one place. Better Auth runs its own queries
// through its adapter. Keep SQL here portable: no SQLite-only functions.

import type { RunResult } from "better-sqlite3";
import { and, desc, eq, gte, inArray, max, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";
import { games, moves, puzzleSolutions, puzzles } from "./schema";

/** The database or a transaction. */
export type Db = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;

export type PuzzleRow = typeof puzzles.$inferSelect;
export type NewPuzzle = typeof puzzles.$inferInsert;
export type SolutionRow = typeof puzzleSolutions.$inferSelect;
export type NewSolution = typeof puzzleSolutions.$inferInsert;
export type GameRow = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type MoveRow = typeof moves.$inferSelect;
export type NewMove = typeof moves.$inferInsert;

/** Runs `fn` in a transaction. better-sqlite3 transactions are synchronous, so `fn` must be too. */
export function inTransaction<T>(db: Db, fn: (tx: Db) => T): T {
  return db.transaction((tx) => fn(tx));
}

export function ping(db: Db): boolean {
  return db.get<{ ok: number }>(sql`select 1 as ok`)?.ok === 1;
}

// Puzzles

export function findPuzzle(db: Db, id: string): PuzzleRow | undefined {
  return db.select().from(puzzles).where(eq(puzzles.id, id)).get();
}

export function findDailyPuzzle(db: Db, date: string): PuzzleRow | undefined {
  return db
    .select()
    .from(puzzles)
    .where(and(eq(puzzles.kind, "daily"), eq(puzzles.publishDate, date)))
    .get();
}

export function listPracticePuzzles(db: Db): PuzzleRow[] {
  return db.select().from(puzzles).where(eq(puzzles.kind, "practice")).orderBy(puzzles.number).all();
}

export function puzzleIdsIn(db: Db, ids: string[]): Set<string> {
  if (ids.length === 0) return new Set();
  const rows = db.select({ id: puzzles.id }).from(puzzles).where(inArray(puzzles.id, ids)).all();
  return new Set(rows.map((r) => r.id));
}

export function maxPuzzleNumber(db: Db): number {
  return db.select({ n: max(puzzles.number) }).from(puzzles).get()?.n ?? 0;
}

/** Dates on or after `from` that already have a daily puzzle. */
export function dailyDatesFrom(db: Db, from: string): Set<string> {
  const rows = db
    .select({ date: puzzles.publishDate })
    .from(puzzles)
    .where(and(eq(puzzles.kind, "daily"), gte(puzzles.publishDate, from)))
    .all();
  return new Set(rows.map((r) => r.date!));
}

export function insertPuzzle(db: Db, puzzle: NewPuzzle, solution: NewSolution): void {
  db.insert(puzzles).values(puzzle).run();
  db.insert(puzzleSolutions).values(solution).run();
}

/** Server only. Never pass the result to an API response before the game is over. */
export function findSolution(db: Db, puzzleId: string): SolutionRow | undefined {
  return db.select().from(puzzleSolutions).where(eq(puzzleSolutions.puzzleId, puzzleId)).get();
}

// Games

export function findGame(db: Db, id: string): GameRow | undefined {
  return db.select().from(games).where(eq(games.id, id)).get();
}

export function findRankedGame(db: Db, userId: string, puzzleId: string): GameRow | undefined {
  return db
    .select()
    .from(games)
    .where(and(eq(games.userId, userId), eq(games.puzzleId, puzzleId), eq(games.mode, "ranked")))
    .get();
}

export function findLatestGame(db: Db, userId: string, puzzleId: string): GameRow | undefined {
  return db
    .select()
    .from(games)
    .where(and(eq(games.userId, userId), eq(games.puzzleId, puzzleId)))
    .orderBy(desc(games.startedAt))
    .limit(1)
    .get();
}

/** Each puzzle's most recent game by this player. */
export function latestGamesByPuzzle(db: Db, userId: string): Map<string, GameRow> {
  const rows = db.select().from(games).where(eq(games.userId, userId)).orderBy(games.startedAt).all();
  return new Map(rows.map((row) => [row.puzzleId, row]));
}

export function insertGame(db: Db, game: NewGame): void {
  db.insert(games).values(game).run();
}

export function updateGame(db: Db, id: string, patch: Partial<NewGame>): void {
  db.update(games).set(patch).where(eq(games.id, id)).run();
}

// Moves

export function listMoves(db: Db, gameId: string): MoveRow[] {
  return db.select().from(moves).where(eq(moves.gameId, gameId)).orderBy(moves.seq).all();
}

export function nextMoveSeq(db: Db, gameId: string): number {
  return (db.select({ n: max(moves.seq) }).from(moves).where(eq(moves.gameId, gameId)).get()?.n ?? 0) + 1;
}

export function insertMove(db: Db, move: NewMove): void {
  db.insert(moves).values(move).run();
}
