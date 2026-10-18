// Generates puzzles from content/messages.txt.
//
//   npm run generate -- --count 30           write 30 puzzles to data/puzzles/<run>/
//   npm run generate -- --difficulty hard    only Hard puzzles
//   npm run generate -- --survey             sample every message, print stats, write nothing
//   npm run generate -- --check              check the messages file
//
// Output stays in data/, which git ignores: solutions must never be committed.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type AttemptReport,
  type Difficulty,
  ENGINE_VERSION,
  GENERATOR_VERSION,
  type GeneratedPuzzle,
  type Message,
  createRng,
  cribCandidates,
  formatKey,
  generatePuzzle,
  messageProblems,
  parseMessages,
} from "../src/engine";

const HELP = `Usage: npm run generate -- [options]

  --count <n>          puzzles to generate (default 30)
  --difficulty <d>     easy, medium, hard or mix (default mix: 40% easy, 40% medium, 20% hard)
  --seed <text>        seed for a reproducible run (default: random)
  --attempts <n>       keys and crib subsets to try per message (default 300, survey 40)
  --min-cribs <n>      fewest cribs per puzzle (default 3)
  --max-cribs <n>      most cribs per puzzle (default 6)
  --messages <file>    messages file (default content/messages.txt)
  --out <dir>          output directory (default data/puzzles)
  --survey             sample every message and print stats only
  --check              check the messages file and exit
  --verbose            print each puzzle's message (spoilers)
`;

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const MIX: Record<Difficulty, number> = { easy: 0.4, medium: 0.4, hard: 0.2 };

const { values: args } = parseArgs({
  options: {
    count: { type: "string", default: "30" },
    difficulty: { type: "string", default: "mix" },
    seed: { type: "string" },
    attempts: { type: "string" },
    "min-cribs": { type: "string", default: "3" },
    "max-cribs": { type: "string", default: "6" },
    messages: { type: "string", default: "content/messages.txt" },
    out: { type: "string", default: "data/puzzles" },
    survey: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    verbose: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

function positiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive whole number`);
  return n;
}

async function main() {
  if (args.help) return void console.log(HELP);

  const file = path.resolve(args.messages);
  const messages = parseMessages(await readFile(file, "utf8"));
  if (args.check) return void process.exit(checkMessages(messages) ? 0 : 1);

  const usable = messages.filter((m) => messageProblems(m).length === 0);
  if (usable.length < messages.length) {
    console.warn(`Skipping ${messages.length - usable.length} unusable messages (run with --check to see why).\n`);
  }
  const seed = args.seed ?? Math.random().toString(36).slice(2, 8);
  const cribCount = { min: positiveInt("min-cribs", args["min-cribs"], 3), max: positiveInt("max-cribs", args["max-cribs"], 6) };
  const stats = new Stats();
  const started = performance.now();

  if (args.survey) {
    const attempts = positiveInt("attempts", args.attempts, 40);
    console.log(`Surveying ${usable.length} messages, ${attempts} attempts each (seed ${seed})…\n`);
    for (const [i, message] of usable.entries()) {
      generatePuzzle(message, { seed: `${seed}:${i}`, attempts, cribCount, stopEarly: false, onAttempt: (r) => stats.add(r) });
    }
    stats.print();
    console.log(`\nDone in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
    return;
  }

  const count = positiveInt("count", args.count, 30);
  const attempts = positiveInt("attempts", args.attempts, 300);
  const mode = args.difficulty;
  if (mode !== "mix" && !DIFFICULTIES.includes(mode as Difficulty)) throw new Error(`Unknown difficulty ${mode}`);
  if (count > usable.length) {
    console.warn(`Only ${usable.length} usable messages, and each is used once per run, so at most ${usable.length} puzzles.\n`);
  }

  console.log(`Generating ${count} puzzles (${mode}, seed ${seed})…\n`);
  const kept: { id: string; generated: GeneratedPuzzle }[] = [];
  const got: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  const order = createRng(seed).shuffle(usable);

  for (const [i, message] of order.entries()) {
    if (kept.length >= count) break;
    const targets = mode === "mix" ? mixTargets(got, count) : [mode as Difficulty];
    const generated = generatePuzzle(message, { seed: `${seed}:${i}`, targets, attempts, cribCount, onAttempt: (r) => stats.add(r) });
    if (!generated) {
      console.log(`  skipped: no ${targets.join("/")} puzzle in ${attempts} attempts`);
      continue;
    }
    const id = `${seed}-${String(kept.length + 1).padStart(3, "0")}`;
    kept.push({ id, generated });
    got[generated.puzzle.difficulty]++;
    const { difficulty, par, cribs } = generated.puzzle;
    const detail = args.verbose ? `  ${generated.text}` : "";
    console.log(`  ${String(kept.length).padStart(3)}/${count}  ${difficulty.padEnd(6)}  par ${par}  ${cribs.length} cribs${detail}`);
  }

  console.log();
  stats.print();
  printKept(kept.map((k) => k.generated));

  if (kept.length > 0) {
    const dir = path.resolve(args.out, `run-${seed}`);
    await writeRun(dir, seed, kept);
    const shown = path.relative(process.cwd(), dir).split(path.sep).join("/");
    console.log(`\nWrote ${kept.length} puzzles to ${shown}/ (puzzles.json, solutions.json).`);
  }
  console.log(`Done in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
}

/** Every difficulty, most behind its share of the mix first. */
function mixTargets(got: Record<Difficulty, number>, count: number): Difficulty[] {
  const deficit = (d: Difficulty) => MIX[d] * count - got[d];
  return [...DIFFICULTIES].sort((a, b) => deficit(b) - deficit(a));
}

function checkMessages(messages: Message[]): boolean {
  let ok = true;
  const seen = new Set<string>();
  for (const message of messages) {
    const problems = messageProblems(message);
    if (seen.has(message.plaintext)) problems.push("duplicate");
    seen.add(message.plaintext);
    if (problems.length > 0) ok = false;
    const status = problems.length > 0 ? `✗ ${problems.join("; ")}` : "✓";
    const cribs = cribCandidates(message);
    console.log(`${status}  ${String(message.plaintext.length).padStart(2)} letters  ${message.text}  [${cribs.join(", ")}]`);
  }
  console.log(`\n${messages.length} messages, ${ok ? "all usable" : "some need fixing"}.`);
  return ok;
}

async function writeRun(dir: string, seed: string, kept: { id: string; generated: GeneratedPuzzle }[]) {
  await mkdir(dir, { recursive: true });
  const manifest = { seed, engineVersion: ENGINE_VERSION, generatorVersion: GENERATOR_VERSION, createdAt: Date.now(), count: kept.length };
  const puzzles = kept.map(({ id, generated: { puzzle } }) => ({
    id,
    ciphertext: puzzle.ciphertext,
    cribs: puzzle.cribs,
    difficulty: puzzle.difficulty,
    par: puzzle.par,
    length: puzzle.ciphertext.length,
  }));
  const solutions = kept.map(({ id, generated }) => ({
    id,
    text: generated.text,
    plaintext: generated.solution.plaintext,
    positions: generated.solution.positions,
    key: formatKey(generated.solution.key),
    seed: generated.seed,
  }));
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(dir, "manifest.json"), json(manifest));
  await writeFile(path.join(dir, "puzzles.json"), json(puzzles));
  await writeFile(path.join(dir, "solutions.json"), json(solutions));
}

interface Bucket {
  attempts: number;
  unique: number;
  usable: number;
  difficulty: Record<Difficulty | "unsolvable", number>;
  parTotal: number;
  parCount: number;
}

const emptyBucket = (): Bucket => ({
  attempts: 0,
  unique: 0,
  usable: 0,
  difficulty: { easy: 0, medium: 0, hard: 0, unsolvable: 0 },
  parTotal: 0,
  parCount: 0,
});

class Stats {
  readonly all = emptyBucket();
  readonly byCribs = new Map<number, Bucket>();
  readonly byLength = new Map<string, Bucket>();

  add(report: AttemptReport) {
    const lengthBand = report.length <= 24 ? "18–24" : report.length <= 31 ? "25–31" : "32–40";
    for (const bucket of [this.all, bucketFor(this.byCribs, report.cribCount), bucketFor(this.byLength, lengthBand)]) {
      bucket.attempts++;
      if (report.unique) bucket.unique++;
      if (report.difficulty) {
        bucket.usable++;
        bucket.difficulty[report.difficulty]++;
      }
      if (report.par !== null) {
        bucket.parTotal += report.par;
        bucket.parCount++;
      }
    }
  }

  print() {
    const { all } = this;
    console.log(`Attempts                 ${all.attempts}`);
    console.log(`Unique solution          ${pct(all.unique, all.attempts)}`);
    console.log(`Unique and covering      ${pct(all.usable, all.attempts)}`);
    console.log(`\nAmong unique, covering attempts:`);
    const header = ["", "attempts", "unique", "usable", "easy", "medium", "hard", "unsolved", "avg par"];
    const rows: string[][] = [];
    const row = (label: string, b: Bucket) =>
      rows.push([
        label,
        String(b.attempts),
        pct(b.unique, b.attempts),
        String(b.usable),
        pct(b.difficulty.easy, b.usable),
        pct(b.difficulty.medium, b.usable),
        pct(b.difficulty.hard, b.usable),
        pct(b.difficulty.unsolvable, b.usable),
        b.parCount ? (b.parTotal / b.parCount).toFixed(1) : "–",
      ]);
    for (const [k, b] of [...this.byCribs].sort((x, y) => x[0] - y[0])) row(`${k} cribs`, b);
    rows.push([]);
    for (const [band, b] of [...this.byLength].sort()) row(`${band} letters`, b);
    rows.push([]);
    row("all", all);
    printTable(header, rows);
  }
}

function bucketFor<K>(map: Map<K, Bucket>, key: K): Bucket {
  let bucket = map.get(key);
  if (!bucket) map.set(key, (bucket = emptyBucket()));
  return bucket;
}

function printKept(kept: GeneratedPuzzle[]) {
  if (kept.length === 0) return;
  const mix = DIFFICULTIES.map((d) => `${d} ${kept.filter((g) => g.puzzle.difficulty === d).length}`).join(" · ");
  console.log(`\nKept ${kept.length} puzzles: ${mix}`);
  const pars = new Map<number, number>();
  for (const g of kept) pars.set(g.puzzle.par, (pars.get(g.puzzle.par) ?? 0) + 1);
  console.log("Par distribution:");
  for (const [par, n] of [...pars].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(par).padStart(2)}  ${"█".repeat(n)} ${n}`);
  }
  const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  console.log(
    `Mean par ${mean(kept.map((g) => g.puzzle.par))} · mean cribs ${mean(kept.map((g) => g.puzzle.cribs.length))} · mean length ${mean(kept.map((g) => g.puzzle.ciphertext.length))}`,
  );
}

function pct(n: number, d: number): string {
  return d === 0 ? "–" : `${((100 * n) / d).toFixed(0)}%`;
}

function printTable(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells.length === 0 ? "" : "  " + cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ");
  console.log(line(header));
  for (const r of rows) console.log(line(r));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
