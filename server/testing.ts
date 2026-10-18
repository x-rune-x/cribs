// Helpers for server tests: a fresh in-memory database with the golden puzzle.

import { formatKey } from "#engine";
import { GOLDEN_KEY, GOLDEN_TEXT, goldenPuzzle, goldenSolution } from "../src/engine/fixtures/golden";
import type { ImportRequest } from "#shared/types/api";
import { createDatabase } from "./db/client";
import { user } from "./db/schema";

export function testDatabase() {
  return createDatabase(":memory:", "server/db/migrations");
}

export function addUser(db: ReturnType<typeof testDatabase>, id: string) {
  db.insert(user).values({ id, name: id, email: `${id}@test.invalid`, isAnonymous: true }).run();
  return id;
}

export function goldenImport(id = "golden", daily?: ImportRequest["daily"]): ImportRequest {
  return {
    puzzles: [{ id, ...goldenPuzzle, cribs: [...goldenPuzzle.cribs], length: goldenPuzzle.ciphertext.length }],
    solutions: [
      {
        id,
        text: GOLDEN_TEXT,
        plaintext: goldenSolution.plaintext,
        positions: { ...goldenSolution.positions },
        key: formatKey(GOLDEN_KEY),
        seed: "golden",
      },
    ],
    daily,
  };
}
