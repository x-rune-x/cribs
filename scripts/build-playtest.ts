// Builds the static playtest site into .output/public: the app with its browser
// backend, plus every puzzle, answers included, in playtest-data.json.
//
//   npm run playtest:build                              using playtest.config.json
//   npm run playtest:build -- --start today --golden    what the end-to-end tests use
//   npm run playtest:build -- --data-only               rewrite the puzzle file only
//
// The answers only ever exist in the built site, never in the repo.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { messageProblems, parseMessages } from "../src/engine";
import { isDateString, localDateString } from "../shared/dates";
import { PLAYTEST_DATA_FILE } from "../shared/types/playtest";
import { type PlaytestOptions, buildPlaytestSet } from "./lib/playtest-set";

interface PlaytestConfig extends Omit<PlaytestOptions, "golden"> {
  /** The path the site is served from, e.g. "/cribs/" on GitHub Pages. */
  base: string;
}

const OUT = ".output/public";

const { values: args } = parseArgs({
  options: {
    start: { type: "string" },
    base: { type: "string" },
    golden: { type: "boolean", default: false },
    "data-only": { type: "boolean", default: false },
  },
});

function main() {
  const config = JSON.parse(readFileSync("playtest.config.json", "utf8")) as PlaytestConfig;
  const start = args.start === "today" ? localDateString() : (args.start ?? config.start);
  if (!isDateString(start)) throw new Error(`The start date must look like 2026-11-12, not ${start}`);
  const base = `/${(args.base ?? config.base).replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");

  if (!args["data-only"]) {
    console.log(`Building the static site for ${base}…\n`);
    const result = spawnSync("npx nuxt generate", {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NUXT_PUBLIC_BACKEND: "static", NUXT_APP_BASE_URL: base },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  const read = (file: string) => parseMessages(readFileSync(file, "utf8")).filter((m) => messageProblems(m).length === 0);
  const data = buildPlaytestSet(read("content/messages.txt"), read("content/lab-messages.txt"), {
    ...config,
    start,
    golden: args.golden,
  });
  writeFileSync(path.join(OUT, PLAYTEST_DATA_FILE), JSON.stringify(data));
  // GitHub Pages: serve folders starting with an underscore (Nuxt's _nuxt) as they are.
  writeFileSync(path.join(OUT, ".nojekyll"), "");

  const dailies = data.puzzles.filter((p) => p.kind === "daily");
  const count = (kind: string) => data.puzzles.filter((p) => p.kind === kind).length;
  console.log(
    `\nPuzzle set "${data.seed}": ${dailies.length} daily (${dailies[0]?.date} to ${dailies.at(-1)?.date}), ` +
      `${count("practice")} practice, ${count("lab")} Lab.`,
  );
  console.log(`Static site ready in ${OUT}/ for ${base}`);
}

main();
