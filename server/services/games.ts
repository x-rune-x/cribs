import {
  type GameState,
  type Move,
  type MoveResult,
  type Solution,
  InvalidMoveError,
  MAX_MISTAKES,
  applyMove,
  parseKey,
  score,
} from "#engine";
import { isDateString } from "#shared/dates";
import type { GameMode, GameView, MoveLogEntry, MoveResponse } from "#shared/types/api";
import {
  type Db,
  type GameRow,
  type MoveRow,
  type PuzzleRow,
  type SolutionRow,
  findGame,
  findLatestGame,
  findPuzzle,
  findRankedGame,
  findSolution,
  inTransaction,
  insertGame,
  insertMove,
  listMoves,
  nextMoveSeq,
  updateGame,
} from "../db/queries";
import { ServiceError, badRequest, notFound } from "./errors";
import { dailyPuzzleFor, toPuzzleView } from "./puzzles";

/** Starts today's ranked game, or returns the one already started. */
export function startDailyGame(db: Db, userId: string, localDate: unknown, now: number): GameView {
  const puzzle = dailyPuzzleFor(db, localDate, now);
  const existing = findRankedGame(db, userId, puzzle.id);
  if (existing) return toGameView(db, existing, puzzle);
  const game = newGameRow(userId, puzzle.id, "ranked", localDate as string, now);
  try {
    insertGame(db, game);
  } catch (error) {
    // A parallel request created it first: the unique index allows only one.
    const raced = findRankedGame(db, userId, puzzle.id);
    if (raced) return toGameView(db, raced, puzzle);
    throw error;
  }
  return toGameView(db, findGame(db, game.id)!, puzzle);
}

/** Resumes the player's latest game on a practice or Lab puzzle, or starts one (always, with `fresh`). */
export function startPracticeGame(
  db: Db,
  userId: string,
  puzzleId: unknown,
  options: { localDate: unknown; fresh?: boolean },
  now: number,
): GameView {
  if (typeof puzzleId !== "string") throw badRequest("bad-puzzle", "Send a puzzle id");
  if (!isDateString(options.localDate)) throw badRequest("bad-date", "Send the local date as YYYY-MM-DD");
  const puzzle = findPuzzle(db, puzzleId);
  if (!puzzle || puzzle.kind === "daily") throw notFound("Practice puzzle");
  const latest = findLatestGame(db, userId, puzzle.id);
  if (latest && (latest.status === "playing" || !options.fresh)) return toGameView(db, latest, puzzle);
  const game = newGameRow(userId, puzzle.id, "practice", options.localDate, now);
  insertGame(db, game);
  return toGameView(db, findGame(db, game.id)!, puzzle);
}

export function getGame(db: Db, userId: string, gameId: string): GameView {
  const { game, puzzle } = ownGame(db, userId, gameId);
  return toGameView(db, game, puzzle);
}

/** Checks a move against the solution, records it with the server's timestamp and returns the result. */
export function playMove(db: Db, userId: string, gameId: string, input: unknown, now: number): MoveResponse {
  const move = parseMove(input);
  return inTransaction(db, (tx) => {
    const { game, puzzle } = ownGame(tx, userId, gameId);
    const solution = findSolution(tx, puzzle.id);
    if (!solution) throw new Error(`Puzzle ${puzzle.id} has no solution`);

    let next: GameState;
    let result: MoveResult;
    try {
      ({ state: next, result } = applyMove(toEngineState(game, puzzle), move, toEngineSolution(solution)));
    } catch (error) {
      if (error instanceof InvalidMoveError) throw new ServiceError(error.code === "game-over" ? 409 : 400, error.code, error.message);
      throw error;
    }

    insertMove(tx, {
      gameId: game.id,
      seq: nextMoveSeq(tx, game.id),
      kind: move.kind,
      payload: move,
      correct: result.kind === "hint" ? null : result.correct,
      reason: reasonOf(result),
      createdAt: now,
    });
    const finished = next.status !== "playing";
    updateGame(tx, game.id, {
      board: { known: next.known, locked: [...next.locked] },
      moveCount: next.moves,
      mistakeCount: next.mistakes,
      hintCount: next.hints,
      status: next.status,
      score: finished ? score(next, puzzle.par) : null,
      finishedAt: finished ? now : null,
    });
    return { result, game: toGameView(tx, findGame(tx, game.id)!, puzzle) };
  });
}

/** Turns on assist mode. Practice only, and it can't be turned off: the game becomes "assisted". */
export function enableAssist(db: Db, userId: string, gameId: string): GameView {
  const { game, puzzle } = ownGame(db, userId, gameId);
  if (game.mode === "ranked") throw new ServiceError(403, "assist-not-allowed", "Assist mode is only for practice puzzles");
  if (game.mode === "practice") updateGame(db, game.id, { mode: "assisted" });
  return toGameView(db, findGame(db, game.id)!, puzzle);
}

function ownGame(db: Db, userId: string, gameId: string): { game: GameRow; puzzle: PuzzleRow } {
  const game = findGame(db, gameId);
  // Someone else's game looks the same as a missing one.
  if (!game || game.userId !== userId) throw notFound("Game");
  return { game, puzzle: findPuzzle(db, game.puzzleId)! };
}

function newGameRow(userId: string, puzzleId: string, mode: GameMode, localDate: string, now: number) {
  return {
    id: crypto.randomUUID(),
    userId,
    puzzleId,
    mode,
    status: "playing" as const,
    localDate,
    board: { known: {}, locked: [] },
    startedAt: now,
  };
}

function parseMove(input: unknown): Move {
  const body = (input ?? {}) as Record<string, unknown>;
  switch (body.kind) {
    case "lock":
      if (typeof body.crib !== "string" || typeof body.pos !== "number") throw badRequest("bad-move", "A lock needs a crib and a position");
      return { kind: "lock", crib: body.crib, pos: body.pos };
    case "swap":
      if (typeof body.a !== "string" || typeof body.b !== "string") throw badRequest("bad-move", "A swap needs two letters");
      return { kind: "swap", a: body.a.toUpperCase(), b: body.b.toUpperCase() } as Move;
    case "hint":
      return { kind: "hint" };
    case "submit":
      if (typeof body.mapping !== "object" || body.mapping === null) throw badRequest("bad-move", "A submission needs a mapping");
      return { kind: "submit", mapping: body.mapping as Record<string, string> } as Move;
    default:
      throw badRequest("bad-move", "Unknown move");
  }
}

/** What to record about a move's result: the hint, or why a mistake was impossible. */
function reasonOf(result: MoveResult): unknown {
  if (result.kind === "hint") return { hint: result.hint };
  if (result.kind === "submit" || result.correct) return null;
  return { reasons: result.reasons };
}

function toEngineState(game: GameRow, puzzle: PuzzleRow): GameState {
  return {
    puzzle: {
      ciphertext: puzzle.ciphertext,
      cribs: puzzle.cribs,
      difficulty: puzzle.difficulty,
      par: puzzle.par,
      ...(puzzle.variant ? { variant: puzzle.variant } : {}),
    },
    known: game.board.known,
    locked: game.board.locked,
    moves: game.moveCount,
    mistakes: game.mistakeCount,
    hints: game.hintCount,
    status: game.status,
  };
}

function toEngineSolution(row: SolutionRow): Solution {
  return { plaintext: row.plaintext, positions: row.positions, key: parseKey(row.key), text: row.text };
}

function toLogEntry(row: MoveRow): MoveLogEntry {
  const reason = (row.reason ?? {}) as { reasons?: MoveLogEntry["reasons"]; hint?: MoveLogEntry["hint"] };
  return { seq: row.seq, move: row.payload, correct: row.correct, reasons: reason.reasons ?? [], hint: reason.hint ?? null, at: row.createdAt };
}

function toGameView(db: Db, game: GameRow, puzzle: PuzzleRow): GameView {
  let finished: GameView["finished"] = null;
  if (game.status !== "playing") {
    // The solution is read only once the game is over.
    const solution = findSolution(db, puzzle.id)!;
    finished = {
      text: solution.text,
      plaintext: solution.plaintext,
      score: game.score ?? 0,
      durationMs: (game.finishedAt ?? game.startedAt) - game.startedAt,
    };
  }
  return {
    id: game.id,
    mode: game.mode,
    status: game.status,
    puzzle: toPuzzleView(puzzle),
    known: game.board.known,
    locked: game.board.locked,
    moves: game.moveCount,
    mistakes: game.mistakeCount,
    hints: game.hintCount,
    maxMistakes: MAX_MISTAKES,
    log: listMoves(db, game.id).map(toLogEntry),
    finished,
  };
}
