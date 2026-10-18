import { STANDARD_VARIANT, parseKey, verifyPuzzle } from "#engine";
import { addDays, daysBetween, isDateString, utcDateString } from "#shared/dates";
import type { ImportRequest, ImportSummary, PracticeItem, PuzzleFileEntry, PuzzleView, SolutionFileEntry } from "#shared/types/api";
import {
  type Db,
  type PuzzleRow,
  dailyDatesFrom,
  findDailyPuzzle,
  inTransaction,
  insertPuzzle,
  latestGamesByPuzzle,
  listPuzzlesOfKind,
  maxPuzzleNumber,
  puzzleIdsIn,
} from "../db/queries";
import { ServiceError, badRequest } from "./errors";

export function toPuzzleView(row: PuzzleRow): PuzzleView {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    date: row.publishDate,
    ciphertext: row.ciphertext,
    cribs: row.cribs,
    difficulty: row.difficulty,
    par: row.par,
    variant: row.variant ?? STANDARD_VARIANT,
    label: row.label,
  };
}

/**
 * The daily puzzle for a player's local date. Time zones span about a day either
 * side of UTC, so any other date is refused, and no later puzzle is ever served.
 */
export function dailyPuzzleFor(db: Db, localDate: unknown, now: number): PuzzleRow {
  if (!isDateString(localDate)) throw badRequest("bad-date", "Send the local date as YYYY-MM-DD");
  if (Math.abs(daysBetween(utcDateString(now), localDate)) > 1) {
    throw new ServiceError(422, "date-out-of-range", "That date isn't today anywhere");
  }
  const puzzle = findDailyPuzzle(db, localDate);
  if (!puzzle) throw new ServiceError(404, "no-daily", "There's no puzzle for today yet");
  return puzzle;
}

/** Practice or Lab puzzles, with the player's progress on each. */
export function listPuzzles(db: Db, userId: string, kind: "practice" | "lab"): PracticeItem[] {
  const latest = latestGamesByPuzzle(db, userId);
  return listPuzzlesOfKind(db, kind).map((p) => ({
    id: p.id,
    number: p.number,
    label: p.label,
    variant: p.variant ?? STANDARD_VARIANT,
    difficulty: p.difficulty,
    par: p.par,
    length: p.length,
    status: latest.get(p.id)?.status ?? null,
  }));
}

/** Checks and stores generated puzzles. Puzzles whose id already exists are skipped, so re-importing is safe. */
export function importPuzzles(db: Db, request: ImportRequest, now: number): ImportSummary {
  const solutions = new Map(request.solutions.map((s) => [s.id, s]));
  const checked = request.puzzles.map((puzzle) => {
    const solution = solutions.get(puzzle.id);
    if (!solution) throw badRequest("bad-import", `No solution for ${puzzle.id}`);
    const problem = checkPuzzle(puzzle, solution);
    if (problem) throw badRequest("bad-import", `${puzzle.id}: ${problem}`);
    return { puzzle, solution };
  });
  if (request.lab && request.daily) throw badRequest("bad-import", "Lab puzzles can't be daily puzzles");
  if (request.daily && (!isDateString(request.daily.from) || !Number.isInteger(request.daily.count) || request.daily.count < 0)) {
    throw badRequest("bad-import", "daily needs a count and a YYYY-MM-DD start date");
  }

  return inTransaction(db, (tx) => {
    const existing = puzzleIdsIn(tx, checked.map((c) => c.puzzle.id));
    const fresh = checked.filter((c) => !existing.has(c.puzzle.id));
    const dailyCount = Math.min(request.daily?.count ?? 0, fresh.length);
    const dates = request.daily ? freeDates(tx, request.daily.from, dailyCount) : [];
    let number = maxPuzzleNumber(tx);
    fresh.forEach(({ puzzle, solution }, i) => {
      const date = dates[i] ?? null;
      insertPuzzle(
        tx,
        {
          id: puzzle.id,
          number: ++number,
          publishDate: date,
          kind: request.lab ? "lab" : date ? "daily" : "practice",
          ciphertext: puzzle.ciphertext,
          cribs: puzzle.cribs,
          difficulty: puzzle.difficulty,
          par: puzzle.par,
          length: puzzle.ciphertext.length,
          variant: puzzle.variant ?? null,
          label: puzzle.label ?? null,
          createdAt: now,
        },
        {
          puzzleId: puzzle.id,
          text: solution.text,
          plaintext: solution.plaintext,
          positions: solution.positions,
          key: solution.key,
          seed: solution.seed,
        },
      );
    });
    return {
      added: fresh.length,
      skipped: checked.filter((c) => existing.has(c.puzzle.id)).map((c) => c.puzzle.id),
      dailyDates: dates,
      practice: fresh.length - dates.length,
    };
  });
}

function freeDates(db: Db, from: string, count: number): string[] {
  const taken = dailyDatesFrom(db, from);
  const dates: string[] = [];
  for (let date = from; dates.length < count; date = addDays(date, 1)) {
    if (!taken.has(date)) dates.push(date);
  }
  return dates;
}

/** Re-checks a generated puzzle against the engine, so a bad file can't reach players. */
function checkPuzzle(puzzle: PuzzleFileEntry, solution: SolutionFileEntry): string | null {
  let key;
  try {
    key = parseKey(solution.key);
  } catch {
    return "the key doesn't parse";
  }
  return verifyPuzzle(
    { ciphertext: puzzle.ciphertext, cribs: puzzle.cribs, difficulty: puzzle.difficulty, par: puzzle.par, variant: puzzle.variant },
    { plaintext: solution.plaintext, positions: solution.positions, key },
    solution.text,
  );
}
