import { beforeEach, describe, expect, it } from "vitest";
import { addDays, utcDateString } from "#shared/dates";
import { type Move, STANDARD_VARIANT } from "#engine";
import { games } from "../db/schema";
import { addUser, goldenImport, goldenLabImport, testDatabase } from "../testing";
import { GOLDEN_KEY } from "../../src/engine/fixtures/golden";
import { pairsOf } from "#engine";

const GOLDEN_KEY_PAIRS = pairsOf(GOLDEN_KEY);
import { ServiceError } from "./errors";
import { enableAssist, getGame, playMove, startDailyGame, startPracticeGame } from "./games";
import { dailyPuzzleFor, importPuzzles, listPuzzles } from "./puzzles";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const TODAY = utcDateString(NOW);
const lock = (crib: string, pos: number): Move => ({ kind: "lock", crib, pos });

let db: ReturnType<typeof testDatabase>;
let alice: string;

beforeEach(() => {
  db = testDatabase();
  alice = addUser(db, "alice");
});

function expectServiceError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).status).toBe(status);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected a ${status} ${code} error`);
}

describe("importPuzzles", () => {
  it("stores a daily puzzle and skips it on re-import", () => {
    expect(importPuzzles(db, goldenImport("golden", { count: 1, from: TODAY }), NOW)).toEqual({
      added: 1,
      skipped: [],
      dailyDates: [TODAY],
      practice: 0,
    });
    expect(importPuzzles(db, goldenImport("golden", { count: 1, from: TODAY }), NOW).skipped).toEqual(["golden"]);
  });

  it("puts new dailies on the next free dates and the rest in practice", () => {
    importPuzzles(db, goldenImport("a", { count: 1, from: TODAY }), NOW);
    expect(importPuzzles(db, goldenImport("b", { count: 1, from: TODAY }), NOW).dailyDates).toEqual([addDays(TODAY, 1)]);
    expect(importPuzzles(db, goldenImport("c"), NOW).practice).toBe(1);
  });

  it("rejects a puzzle that doesn't check out", () => {
    const wrongPar = goldenImport();
    wrongPar.puzzles[0]!.par = 2;
    expectServiceError(() => importPuzzles(db, wrongPar, NOW), 400, "bad-import");

    const wrongKey = goldenImport();
    wrongKey.solutions[0]!.key = "AB CD EF GH IJ KL MN OP QR ST UV WX YZ";
    expectServiceError(() => importPuzzles(db, wrongKey, NOW), 400, "bad-import");
  });
});

describe("dailyPuzzleFor", () => {
  beforeEach(() => {
    importPuzzles(db, goldenImport("today", { count: 1, from: TODAY }), NOW);
  });

  it("accepts local dates within a day of UTC", () => {
    expect(dailyPuzzleFor(db, TODAY, NOW).id).toBe("today");
    importPuzzles(db, goldenImport("tomorrow", { count: 1, from: TODAY }), NOW);
    expect(dailyPuzzleFor(db, addDays(TODAY, 1), NOW).id).toBe("tomorrow");
  });

  it("never serves a puzzle for a date that isn't today anywhere", () => {
    importPuzzles(db, goldenImport("later", { count: 1, from: addDays(TODAY, 2) }), NOW);
    expectServiceError(() => dailyPuzzleFor(db, addDays(TODAY, 2), NOW), 422, "date-out-of-range");
    expectServiceError(() => dailyPuzzleFor(db, addDays(TODAY, -2), NOW), 422, "date-out-of-range");
  });

  it("explains a missing puzzle or a malformed date", () => {
    expectServiceError(() => dailyPuzzleFor(db, addDays(TODAY, -1), NOW), 404, "no-daily");
    expectServiceError(() => dailyPuzzleFor(db, "18/10/2026", NOW), 400, "bad-date");
    expectServiceError(() => dailyPuzzleFor(db, "2026-02-30", NOW), 400, "bad-date");
  });
});

describe("daily games", () => {
  beforeEach(() => {
    importPuzzles(db, goldenImport("golden", { count: 1, from: TODAY }), NOW);
  });

  it("starts one ranked game per player and resumes it", () => {
    const first = startDailyGame(db, alice, TODAY, NOW);
    expect(first).toMatchObject({ mode: "ranked", status: "playing", moves: 0, finished: null });
    expect(startDailyGame(db, alice, TODAY, NOW + 1000).id).toBe(first.id);
  });

  it("allows only one ranked game per puzzle in the database itself", () => {
    const game = startDailyGame(db, alice, TODAY, NOW);
    const duplicate = { ...db.select().from(games).get()!, id: "other" };
    expect(() => db.insert(games).values(duplicate).run()).toThrow(/UNIQUE/);
    expect(game.mode).toBe("ranked");
  });

  it("never sends the solution while the game is in progress", () => {
    let view = startDailyGame(db, alice, TODAY, NOW);
    view = playMove(db, alice, view.id, lock("MILL", 12), NOW).game;
    const json = JSON.stringify(view);
    expect(json).not.toContain("MEETATTHE");
    expect(json).not.toContain("MEET AT THE");
    expect(json).not.toContain("A⇄G");
    expect(view.finished).toBeNull();
  });

  it("plays the golden puzzle to a win and scores it", () => {
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    playMove(db, alice, id, lock("MILL", 12), NOW + 1000);
    playMove(db, alice, id, lock("DAWN", 18), NOW + 2000);
    const { result, game } = playMove(db, alice, id, lock("THE", 6), NOW + 3000);
    expect(result).toMatchObject({ kind: "lock", correct: true, status: "won" });
    expect(game.finished).toEqual({
      text: "MEET AT THE OLD MILL AT DAWN",
      plaintext: "MEETATTHEOLDMILLATDAWN",
      score: 100,
      durationMs: 3000,
    });
    expect(game.log.map((e) => e.correct)).toEqual([true, true, true]);
    expectServiceError(() => playMove(db, alice, id, lock("MEET", 0), NOW), 409, "game-over");
  });

  it("records mistakes, with reasons when the placement was impossible", () => {
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    expect(playMove(db, alice, id, lock("MEET", 4), NOW).result).toEqual({
      kind: "lock",
      correct: false,
      reasons: [],
      status: "playing",
    });
    const { game } = playMove(db, alice, id, lock("MILL", 3), NOW);
    expect(game.mistakes).toBe(2);
    expect(game.log[1]?.reasons).toContainEqual(expect.objectContaining({ kind: "self-contradiction", letter: "O" }));
  });

  it("rejects invalid moves without recording them", () => {
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    expectServiceError(() => playMove(db, alice, id, lock("OLD", 9), NOW), 400, "unknown-crib");
    expectServiceError(() => playMove(db, alice, id, { kind: "fly" }, NOW), 400, "bad-move");
    expectServiceError(() => playMove(db, alice, id, { kind: "swap", a: "b", b: "c" }, NOW), 400, "not-in-message");
    expect(getGame(db, alice, id)).toMatchObject({ mistakes: 0, log: [] });
  });

  it("reveals the solution after five mistakes", () => {
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    let game;
    for (let i = 0; i < 5; i++) game = playMove(db, alice, id, lock("MEET", 4), NOW + i).game;
    expect(game).toMatchObject({ status: "failed", finished: { text: "MEET AT THE OLD MILL AT DAWN", score: 0 } });
  });

  it("records hints without changing the board", () => {
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    const { result, game } = playMove(db, alice, id, { kind: "hint" }, NOW);
    expect(result.kind).toBe("hint");
    expect(game).toMatchObject({ hints: 1, moves: 0, known: {} });
    expect(game.log[0]).toMatchObject({ correct: null, hint: { kind: "forced" } });
  });

  it("hides other players' games", () => {
    const bob = addUser(db, "bob");
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    expectServiceError(() => getGame(db, bob, id), 404, "not-found");
    expectServiceError(() => playMove(db, bob, id, lock("MILL", 12), NOW), 404, "not-found");
  });

  it("doesn't allow assist mode", () => {
    const { id } = startDailyGame(db, alice, TODAY, NOW);
    expectServiceError(() => enableAssist(db, alice, id), 403, "assist-not-allowed");
  });
});

describe("practice games", () => {
  beforeEach(() => {
    importPuzzles(db, goldenImport("practice-1"), NOW);
  });

  it("lists practice puzzles with the player's progress", () => {
    expect(listPuzzles(db, alice, "practice")).toEqual([
      { id: "practice-1", number: 1, label: null, variant: STANDARD_VARIANT, difficulty: "easy", par: 3, length: 22, status: null },
    ]);
    startPracticeGame(db, alice, "practice-1", { localDate: TODAY }, NOW);
    expect(listPuzzles(db, alice, "practice")[0]?.status).toBe("playing");
  });

  it("resumes the latest game, and starts a fresh one only when asked after it ends", () => {
    const first = startPracticeGame(db, alice, "practice-1", { localDate: TODAY }, NOW);
    expect(startPracticeGame(db, alice, "practice-1", { localDate: TODAY, fresh: true }, NOW).id).toBe(first.id);
    for (const move of [lock("MILL", 12), lock("DAWN", 18), lock("THE", 6)]) playMove(db, alice, first.id, move, NOW);
    expect(startPracticeGame(db, alice, "practice-1", { localDate: TODAY }, NOW).id).toBe(first.id);
    const again = startPracticeGame(db, alice, "practice-1", { localDate: TODAY, fresh: true }, NOW + 1);
    expect(again.id).not.toBe(first.id);
    expect(again.status).toBe("playing");
  });

  it("turns on assist mode for good", () => {
    const { id } = startPracticeGame(db, alice, "practice-1", { localDate: TODAY }, NOW);
    expect(enableAssist(db, alice, id).mode).toBe("assisted");
    expect(enableAssist(db, alice, id).mode).toBe("assisted");
  });

  it("won't start a daily puzzle as practice", () => {
    importPuzzles(db, goldenImport("daily-1", { count: 1, from: TODAY }), NOW);
    expectServiceError(() => startPracticeGame(db, alice, "daily-1", { localDate: TODAY }, NOW), 404, "not-found");
  });
});

describe("lab games", () => {
  const blind = { ...STANDARD_VARIANT, feedback: "blind" as const };
  const free = { ...STANDARD_VARIANT, words: "free" as const };
  const answer = () =>
    Object.fromEntries([...GOLDEN_KEY_PAIRS].flatMap(([a, b]) => [[a, b], [b, a]]));

  it("imports Lab puzzles separately from practice", () => {
    importPuzzles(db, goldenLabImport("lab-blind", blind, "Blind"), NOW);
    expect(listPuzzles(db, alice, "lab")).toMatchObject([{ id: "lab-blind", label: "Blind", variant: blind }]);
    expect(listPuzzles(db, alice, "practice")).toEqual([]);
  });

  it("rejects a Lab puzzle whose par doesn't match its rules", () => {
    const bad = goldenLabImport("lab-bad", blind);
    bad.puzzles[0]!.par = 3;
    expectServiceError(() => importPuzzles(db, bad, NOW), 400, "bad-import");
  });

  it("plays blind: no locks on the server, a wrong submission is a mistake, a right one wins", () => {
    importPuzzles(db, goldenLabImport("lab-blind", blind), NOW);
    const { id } = startPracticeGame(db, alice, "lab-blind", { localDate: TODAY }, NOW);
    expectServiceError(() => playMove(db, alice, id, lock("MILL", 12), NOW), 400, "tentative-only");
    const wrong = { ...answer(), U: "N", N: "U", X: "M", M: "X" };
    expect(playMove(db, alice, id, { kind: "submit", mapping: wrong }, NOW).result).toEqual({
      kind: "submit",
      correct: false,
      status: "playing",
    });
    const { result, game } = playMove(db, alice, id, { kind: "submit", mapping: answer() }, NOW + 5000);
    expect(result).toMatchObject({ kind: "submit", correct: true, status: "won" });
    expect(game.finished).toMatchObject({ text: "MEET AT THE OLD MILL AT DAWN", score: 85, durationMs: 5000 });
  });

  it("plays with the player's own words", () => {
    importPuzzles(db, goldenLabImport("lab-free", free), NOW);
    const { id, puzzle } = startPracticeGame(db, alice, "lab-free", { localDate: TODAY }, NOW);
    expect(puzzle.cribs).toEqual([]);
    expect(playMove(db, alice, id, lock("THEOLD", 6), NOW).result).toMatchObject({ kind: "lock", correct: true });
    expect(playMove(db, alice, id, lock("MOLE", 12), NOW).game.mistakes).toBe(1);
  });
});
