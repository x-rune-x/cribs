// Imports generated puzzles through the running server, so only the server
// ever writes to the database.
//
//   npm run seed -- data/puzzles/run-<seed> --daily 20     first 20 new puzzles daily from today, the rest practice
//   npm run seed -- data/puzzles/run-<seed> --from 2026-11-01 --daily 60
//   npm run seed -- --golden                               the golden test puzzle as today's daily
//
// Reads ADMIN_TOKEN and CRIB_URL from the environment or .env.local.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatKey } from "../src/engine";
import { GOLDEN_KEY, GOLDEN_TEXT, goldenPuzzle, goldenSolution } from "../src/engine/fixtures/golden";
import { isDateString, localDateString } from "../shared/dates";
import type { ImportRequest, ImportSummary, PuzzleFileEntry, SolutionFileEntry } from "../shared/types/api";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    daily: { type: "string", default: "0" },
    from: { type: "string" },
    url: { type: "string" },
    golden: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const HELP = `Usage: npm run seed -- <run directory> [--daily <n>] [--from YYYY-MM-DD] [--url <server>]
       npm run seed -- --golden

  --daily <n>    make the first n new puzzles daily, on free dates from --from (default 0: all practice)
  --from <date>  first daily date (default: today, local time)
  --url <url>    the running server (default CRIB_URL or http://localhost:3000)
  --golden       import the golden test puzzle as today's daily
`;

async function main() {
  if (args.help || (!args.golden && positionals.length !== 1)) return void console.log(HELP);
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error("Set ADMIN_TOKEN (in .env.local for local development)");
  const url = args.url ?? process.env.CRIB_URL ?? "http://localhost:3000";
  const from = args.from ?? localDateString();
  if (!isDateString(from)) throw new Error("--from must be a date like 2026-11-01");
  const count = Number(args.daily);
  if (!Number.isInteger(count) || count < 0) throw new Error("--daily must be a whole number");

  const request: ImportRequest = args.golden ? goldenRequest(from) : await runRequest(positionals[0]!, { count, from });
  const response = await fetch(new URL("/api/admin/puzzles", url), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Import failed: ${response.status} ${(await response.text()).slice(0, 500)}`);
  const summary = (await response.json()) as ImportSummary;

  console.log(`Added ${summary.added} puzzles: ${summary.dailyDates.length} daily, ${summary.practice} practice.`);
  if (summary.dailyDates.length > 0) {
    console.log(`Daily dates: ${summary.dailyDates[0]} to ${summary.dailyDates.at(-1)}`);
  }
  if (summary.skipped.length > 0) console.log(`Skipped ${summary.skipped.length} already imported.`);
}

async function runRequest(dir: string, daily: { count: number; from: string }): Promise<ImportRequest> {
  const read = async <T>(file: string) => JSON.parse(await readFile(path.join(dir, file), "utf8")) as T;
  return {
    puzzles: await read<PuzzleFileEntry[]>("puzzles.json"),
    solutions: await read<SolutionFileEntry[]>("solutions.json"),
    daily,
  };
}

function goldenRequest(date: string): ImportRequest {
  return {
    puzzles: [{ id: "golden", ...goldenPuzzle, cribs: [...goldenPuzzle.cribs], length: goldenPuzzle.ciphertext.length }],
    solutions: [
      {
        id: "golden",
        text: GOLDEN_TEXT,
        plaintext: goldenSolution.plaintext,
        positions: { ...goldenSolution.positions },
        key: formatKey(GOLDEN_KEY),
        seed: "golden",
      },
    ],
    daily: { count: 1, from: date },
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
