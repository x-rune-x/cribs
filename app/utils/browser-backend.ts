// The static playtest build's backend: the engine runs in the browser, games
// are saved in localStorage, and the answers come with the puzzles. Fine for a
// playtest among friends; the real game keeps answers on the server.

import { type GameState, type Move, type MoveResult, type Solution, InvalidMoveError, MAX_MISTAKES, applyMove, parseKey, score } from "#engine";
import type { GameMode, GameView, MoveLogEntry, PracticeItem, PuzzleView, StartGameRequest } from "#shared/types/api";
import { PLAYTEST_DATA_FILE, type PlaytestData, type PlaytestPuzzle } from "#shared/types/playtest";
import { BackendError } from "./api";
import type { GameBackend } from "./backend";

interface SavedGame {
  id: string;
  puzzleId: string;
  mode: GameMode;
  localDate: string;
  state: Pick<GameState, "known" | "locked" | "moves" | "mistakes" | "hints" | "status">;
  log: MoveLogEntry[];
  startedAt: number;
  finishedAt: number | null;
  score: number | null;
}

export async function createBrowserBackend(baseURL: string): Promise<GameBackend> {
  const response = await fetch(`${baseURL}${PLAYTEST_DATA_FILE}`);
  if (!response.ok) throw new BackendError(503, "no-data", "Couldn't load the puzzles");
  const data = (await response.json()) as PlaytestData;
  const puzzles = new Map(data.puzzles.map((p) => [p.id, p]));
  // A new puzzle set gets a new seed, so games from an old set are simply left behind.
  const storageKey = `crib:playtest:${data.seed}`;

  const load = (): Record<string, SavedGame> => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  };
  const save = (games: Record<string, SavedGame>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(games));
    } catch {
      // Storage may be full or blocked; the game carries on for this visit.
    }
  };

  const latestFor = (games: Record<string, SavedGame>, puzzleId: string) =>
    Object.values(games)
      .filter((g) => g.puzzleId === puzzleId)
      .sort((a, b) => b.startedAt - a.startedAt)[0];

  function start(games: Record<string, SavedGame>, puzzle: PlaytestPuzzle, mode: GameMode, localDate: string): GameView {
    const game: SavedGame = {
      id: crypto.randomUUID(),
      puzzleId: puzzle.id,
      mode,
      localDate,
      state: { known: {}, locked: [], moves: 0, mistakes: 0, hints: 0, status: "playing" },
      log: [],
      startedAt: Date.now(),
      finishedAt: null,
      score: null,
    };
    games[game.id] = game;
    save(games);
    return toView(game, puzzle);
  }

  return {
    async startGame(request: StartGameRequest) {
      const games = load();
      if (request.kind === "daily") {
        const puzzle = data.puzzles.find((p) => p.kind === "daily" && p.date === request.localDate);
        if (!puzzle) throw new BackendError(404, "no-daily", "There's no puzzle for today yet");
        const existing = Object.values(games).find((g) => g.puzzleId === puzzle.id && g.mode === "ranked");
        return existing ? toView(existing, puzzle) : start(games, puzzle, "ranked", request.localDate);
      }
      const puzzle = puzzles.get(request.puzzleId);
      if (!puzzle || puzzle.kind === "daily") throw new BackendError(404, "not-found", "Practice puzzle not found");
      const latest = latestFor(games, puzzle.id);
      if (latest && (latest.state.status === "playing" || !request.fresh)) return toView(latest, puzzle);
      return start(games, puzzle, "practice", request.localDate);
    },

    async move(gameId: string, move: Move) {
      const games = load();
      const game = games[gameId];
      const puzzle = game && puzzles.get(game.puzzleId);
      if (!game || !puzzle) throw new BackendError(404, "not-found", "Game not found");
      let next: GameState;
      let result: MoveResult;
      try {
        ({ state: next, result } = applyMove(toEngineState(game, puzzle), move, toSolution(puzzle)));
      } catch (error) {
        if (error instanceof InvalidMoveError) throw new BackendError(error.code === "game-over" ? 409 : 400, error.code, error.message);
        throw error;
      }
      const now = Date.now();
      game.log.push(toLogEntry(game.log.length + 1, move, result, now));
      game.state = { known: next.known, locked: [...next.locked], moves: next.moves, mistakes: next.mistakes, hints: next.hints, status: next.status };
      if (next.status !== "playing") {
        game.finishedAt = now;
        game.score = score(next, puzzle.par);
      }
      save(games);
      return { result, game: toView(game, puzzle) };
    },

    async enableAssist(gameId: string) {
      const games = load();
      const game = games[gameId];
      const puzzle = game && puzzles.get(game.puzzleId);
      if (!game || !puzzle) throw new BackendError(404, "not-found", "Game not found");
      if (game.mode === "ranked") throw new BackendError(403, "assist-not-allowed", "Assist mode is only for practice puzzles");
      game.mode = "assisted";
      save(games);
      return toView(game, puzzle);
    },

    async listPuzzles(kind: "practice" | "lab") {
      const games = load();
      return data.puzzles
        .filter((p) => p.kind === kind)
        .map(
          (p): PracticeItem => ({
            id: p.id,
            number: p.number,
            label: p.label,
            variant: p.variant,
            difficulty: p.difficulty,
            par: p.par,
            length: p.ciphertext.length,
            status: latestFor(games, p.id)?.state.status ?? null,
          }),
        );
    },
  };
}

function publicView({ solution: _solution, ...puzzle }: PlaytestPuzzle): PuzzleView {
  return puzzle;
}

function toEngineState(game: SavedGame, puzzle: PlaytestPuzzle): GameState {
  const { ciphertext, cribs, difficulty, par, variant } = puzzle;
  return { puzzle: { ciphertext, cribs, difficulty, par, variant }, ...game.state };
}

function toSolution(puzzle: PlaytestPuzzle): Solution {
  const { plaintext, positions, key, text } = puzzle.solution;
  return { plaintext, positions, key: parseKey(key), text };
}

function toLogEntry(seq: number, move: Move, result: MoveResult, at: number): MoveLogEntry {
  if (result.kind === "hint") return { seq, move, correct: null, reasons: [], hint: result.hint, at };
  if (result.kind === "submit" || result.correct) return { seq, move, correct: result.correct, reasons: [], hint: null, at };
  return { seq, move, correct: false, reasons: result.reasons, hint: null, at };
}

function toView(game: SavedGame, puzzle: PlaytestPuzzle): GameView {
  const status = game.state.status;
  return {
    id: game.id,
    mode: game.mode,
    status,
    puzzle: publicView(puzzle),
    known: game.state.known,
    locked: [...game.state.locked],
    moves: game.state.moves,
    mistakes: game.state.mistakes,
    hints: game.state.hints,
    maxMistakes: MAX_MISTAKES,
    log: game.log,
    finished:
      status === "playing"
        ? null
        : {
            text: puzzle.solution.text,
            plaintext: puzzle.solution.plaintext,
            score: game.score ?? 0,
            durationMs: (game.finishedAt ?? game.startedAt) - game.startedAt,
          },
  };
}
