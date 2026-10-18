// Cribbot's reasoning: candidate positions at three levels of logic, forced
// moves, solution counting and shortest forced-move paths.
//
//   L1  each unplaced crib's positions on their own, against the rules and the known swaps
//   L2  also drops a position if some other unplaced crib has no compatible position left
//       alongside it, repeated until nothing changes (arc consistency)
//   L3  also drops a position if assuming it and running L2 leaves some crib with nowhere
//       to go: trial and error, done as a proof by contradiction
//
// Every level is sound: it never removes a true position, so every forced move it
// finds is correct.
//
// Internally letters are 0–25 and swap maps are Int8Arrays with -1 for "unknown".

import { ALPHABET, type Letter, type Pair, type SwapMap, LETTERS, pair } from "./cipher";
import { type Placement, type PlacementReason, checkPlacement } from "./rules";
import type { Difficulty, Move } from "./state";

export type Level = 1 | 2 | 3;

/** The public parts of a game the solver reasons from. GameState satisfies it. */
export interface Board {
  readonly puzzle: { readonly ciphertext: string; readonly cribs: readonly string[] };
  readonly known: SwapMap;
  readonly locked: readonly Placement[];
}

export type ForcedMove =
  /** The crib has exactly one candidate left. */
  | { readonly kind: "lock"; readonly crib: string; readonly pos: number; readonly level: Level }
  | {
      readonly kind: "swap";
      readonly pair: Pair;
      readonly level: Level;
      readonly because:
        | { readonly kind: "implied"; readonly crib: string } // every candidate of the crib implies it
        | { readonly kind: "last-pair" }; // the only two unpaired letters left
    };

/** Why a placement is impossible: the rules (L1), or a crib it would leave with nowhere to go (L2, L3). */
export type Elimination =
  | { readonly level: 1; readonly reasons: PlacementReason[] }
  | { readonly level: 2 | 3; readonly blocked: string };

/** The level of logic a puzzle is graded, hinted and analysed at. */
export function reasoningLevel(difficulty: Difficulty): Level {
  return difficulty === "hard" ? 3 : 2;
}

export function emptyBoard(puzzle: Board["puzzle"]): Board {
  return { puzzle, known: {}, locked: [] };
}

export function toMove(move: ForcedMove): Move {
  return move.kind === "lock"
    ? { kind: "lock", crib: move.crib, pos: move.pos }
    : { kind: "swap", a: move.pair[0], b: move.pair[1] };
}

/** Candidate positions for each unlocked crib. */
export function candidates(board: Board, level: Level): Map<string, number[]> {
  const index = indexFor(board.puzzle);
  const node = toNode(index, board);
  const base = l1Domains(index, node);
  const result = level === 1 ? { ok: true as const, doms: base } : propagateTo(index, base, level);
  const out = new Map<string, number[]>();
  base.forEach((dom, c) => {
    if (dom) out.set(index.cribs[c]!, result.ok ? [...result.doms[c]!] : []);
  });
  return out;
}

/**
 * Every forced move, tagged with the lowest level that proves it, lowest level first.
 * Swaps implied by a crib with a single candidate are left out, since locking the
 * crib covers them; explainForced still recognises them.
 */
export function forcedMoves(board: Board, level: Level): ForcedMove[] {
  const index = indexFor(board.puzzle);
  return forcedInternal(index, toNode(index, board), level).map((m) => toForcedMove(index, m));
}

/** The forced move a player's move matches, at the lowest level that proves it, or null if it isn't forced. */
export function explainForced(board: Board, move: Move, level: Level): ForcedMove | null {
  if (move.kind === "hint") return null;
  const index = indexFor(board.puzzle);
  const node = toNode(index, board);
  const base = l1Domains(index, node);
  for (let lvl = 1 as Level; lvl <= level; lvl = (lvl + 1) as Level) {
    const result = lvl === 1 ? { ok: true as const, doms: base } : propagateTo(index, base, lvl);
    if (!result.ok) return null;
    const { doms } = result;
    if (move.kind === "lock") {
      const c = index.cribIndex.get(move.crib);
      const dom = c === undefined ? null : doms[c];
      if (dom && dom.length === 1 && dom[0] === move.pos) return { kind: "lock", crib: move.crib, pos: move.pos, level: lvl };
      continue;
    }
    const a = code(move.a);
    const b = code(move.b);
    if (node.known[a] === b) return null;
    for (let c = 0; c < doms.length; c++) {
      const dom = doms[c];
      if (dom && dom.length > 0 && dom.every((p) => index.mapAt(c, p)[a] === b)) {
        return { kind: "swap", pair: pair(move.a, move.b), level: lvl, because: { kind: "implied", crib: index.cribs[c]! } };
      }
    }
    const free = unpaired(node);
    if (free.length === 2 && free.includes(a) && free.includes(b)) {
      return { kind: "swap", pair: pair(move.a, move.b), level: lvl, because: { kind: "last-pair" } };
    }
  }
  return null;
}

/** Applies every forced move until none are left. True if that wins the game. */
export function closure(board: Board, level: Level): boolean {
  const index = indexFor(board.puzzle);
  let node = toNode(index, board);
  while (!isWon(index, node)) {
    const moves = forcedInternal(index, node, level);
    if (moves.length === 0) break;
    for (const move of moves) {
      if (!isApplied(node, move)) node = applyInternal(index, node, move);
    }
  }
  return isWon(index, node);
}

/**
 * The fewest forced moves that win from this board, found by breadth-first search
 * (not greedily). Null if forced moves at this level can't finish the puzzle.
 */
export function shortestPath(board: Board, level: Level): ForcedMove[] | null {
  const index = indexFor(board.puzzle);
  const path = searchPath(index, toNode(index, board), level);
  return path && path.map((m) => toForcedMove(index, m));
}

/** The first move on a shortest forced path, or any forced move if no path finishes the puzzle. */
export function bestMove(board: Board, level: Level): ForcedMove | null {
  const path = shortestPath(board, level);
  if (path) return path[0] ?? null;
  return forcedMoves(board, level)[0] ?? null;
}

/** Why a placement is already impossible given the board, or null if logic at this level can't rule it out. */
export function whyImpossible(board: Board, placement: Placement, level: Level): Elimination | null {
  const { ciphertext } = board.puzzle;
  const check = checkPlacement(ciphertext, placement, board.known, board.locked);
  if (!check.ok) return { level: 1, reasons: check.reasons };
  if (level === 1) return null;

  const index = indexFor(board.puzzle);
  const c = index.cribIndex.get(placement.crib);
  if (c === undefined) return null;
  const node = toNode(index, board);
  const base = l1Domains(index, node);
  if (!base[c]) return null;
  const l2 = propagate(index, base);
  if (!l2.ok) return null;
  const p = placement.pos;
  if (!l2.doms[c]!.includes(p)) {
    const blocked = mostObviousBlocker(index, base, c, p) ?? mostObviousBlocker(index, l2.doms, c, p) ?? c;
    return { level: 2, blocked: index.cribs[blocked]! };
  }
  if (level === 2) return null;
  const l3 = singletonPropagate(index, l2.doms);
  if (!l3.ok || l3.doms[c]!.includes(p)) return null;
  // Assume the placement and follow L2 until some crib runs out of positions.
  let trial = propagate(index, withOnly(l2.doms, c, p));
  if (trial.ok) trial = propagate(index, withOnly(l3.doms, c, p));
  return { level: 3, blocked: index.cribs[trial.ok ? c : trial.empty]! };
}

/** Counts crib assignments that satisfy every rule, stopping at `limit`. */
export function countSolutions(puzzle: Board["puzzle"], limit = 2): number {
  return search(indexFor(puzzle), limit).length;
}

/** Up to `limit` solutions, as crib → 0-based position. */
export function findSolutions(puzzle: Board["puzzle"], limit = 2): Record<string, number>[] {
  const index = indexFor(puzzle);
  return search(index, limit).map((pids) =>
    Object.fromEntries(pids.map((pid, c) => [index.cribs[c]!, index.pidPos[pid]!])),
  );
}

// ---------------------------------------------------------------------------
// Internals

const UNKNOWN = -1;
const code = (letter: string) => letter.charCodeAt(0) - 65;
const letterOf = (n: number) => ALPHABET[n] as Letter;

/** Per-puzzle data that doesn't depend on the board: every placement's implied swaps, and compatibility between placements. */
class PuzzleIndex {
  readonly ct: Int8Array;
  readonly cribs: readonly string[];
  readonly cribIndex: Map<string, number>;
  readonly lengths: number[];
  readonly base: number[] = [];
  /** The swaps each placement implies, or null if it breaks a rule on its own. */
  readonly maps: (Int8Array | null)[] = [];
  readonly pidCrib: number[] = [];
  readonly pidPos: number[] = [];
  readonly letterCount = new Int16Array(26);
  readonly total: number;
  private readonly compat: Uint8Array; // 0 = not computed, 1 = compatible, 2 = not

  constructor(ciphertext: string, cribs: readonly string[]) {
    this.ct = Int8Array.from(ciphertext, code);
    for (const c of this.ct) this.letterCount[c] += 1;
    this.cribs = cribs;
    this.cribIndex = new Map(cribs.map((crib, i) => [crib, i]));
    this.lengths = cribs.map((crib) => crib.length);
    let total = 0;
    cribs.forEach((crib, c) => {
      this.base.push(total);
      const word = Int8Array.from(crib, code);
      for (let p = 0; p + word.length <= this.ct.length; p++) {
        this.maps.push(intrinsicMap(this.ct, word, p));
        this.pidCrib.push(c);
        this.pidPos.push(p);
        total++;
      }
    });
    this.total = total;
    this.compat = new Uint8Array(total * total);
  }

  positions(c: number): number {
    return Math.max(0, this.ct.length - this.lengths[c]! + 1);
  }

  pid(c: number, p: number): number {
    return this.base[c]! + p;
  }

  mapAt(c: number, p: number): Int8Array {
    return this.maps[this.pid(c, p)]!;
  }

  /** Two placements can both hold: no overlap and no clashing swaps. */
  compatible(a: number, b: number): boolean {
    const i = a * this.total + b;
    let v = this.compat[i]!;
    if (v === 0) {
      const ca = this.pidCrib[a]!;
      const cb = this.pidCrib[b]!;
      const pa = this.pidPos[a]!;
      const pb = this.pidPos[b]!;
      const apart = pa + this.lengths[ca]! <= pb || pb + this.lengths[cb]! <= pa;
      v = apart && consistent(this.maps[a]!, this.maps[b]!) ? 1 : 2;
      this.compat[i] = v;
      this.compat[b * this.total + a] = v;
    }
    return v === 1;
  }
}

const indexCache = new Map<string, PuzzleIndex>();

function indexFor(puzzle: Board["puzzle"]): PuzzleIndex {
  const key = `${puzzle.ciphertext}|${puzzle.cribs.join(",")}`;
  let index = indexCache.get(key);
  if (!index) {
    index = new PuzzleIndex(puzzle.ciphertext, puzzle.cribs);
    if (indexCache.size >= 64) indexCache.delete(indexCache.keys().next().value!);
    indexCache.set(key, index);
  }
  return index;
}

function intrinsicMap(ct: Int8Array, word: Int8Array, pos: number): Int8Array | null {
  const map = new Int8Array(26).fill(UNKNOWN);
  for (let i = 0; i < word.length; i++) {
    const x = word[i]!;
    const y = ct[pos + i]!;
    if (x === y) return null;
    if ((map[x] !== UNKNOWN && map[x] !== y) || (map[y] !== UNKNOWN && map[y] !== x)) return null;
    map[x] = y;
    map[y] = x;
  }
  return map;
}

function consistent(a: Int8Array, b: Int8Array): boolean {
  for (let i = 0; i < 26; i++) {
    if (a[i] !== UNKNOWN && b[i] !== UNKNOWN && a[i] !== b[i]) return false;
  }
  return true;
}

/** What's known: the swaps, and each crib's locked position (-1 if unlocked). */
interface Node {
  readonly known: Int8Array;
  readonly lockedPos: Int16Array;
}

function toNode(index: PuzzleIndex, board: Board): Node {
  const known = new Int8Array(26).fill(UNKNOWN);
  for (const letter of LETTERS) {
    const partner = board.known[letter];
    if (partner) known[code(letter)] = code(partner);
  }
  const lockedPos = new Int16Array(index.cribs.length).fill(UNKNOWN);
  for (const { crib, pos } of board.locked) {
    const c = index.cribIndex.get(crib);
    if (c === undefined) throw new Error(`${crib} isn't a crib in this puzzle`);
    if (!Number.isInteger(pos) || pos < 0 || pos >= index.positions(c)) throw new Error(`${crib} can't be locked at ${pos}`);
    const map = index.mapAt(c, pos);
    if (!map || !consistent(map, known)) throw new Error(`Locked ${crib} at ${pos} doesn't fit the known swaps`);
    merge(known, map);
    lockedPos[c] = pos;
  }
  return { known, lockedPos };
}

function merge(known: Int8Array, map: Int8Array) {
  for (let i = 0; i < 26; i++) if (map[i] !== UNKNOWN) known[i] = map[i]!;
}

function isWon(index: PuzzleIndex, node: Node): boolean {
  for (let x = 0; x < 26; x++) {
    if (index.letterCount[x]! > 0 && node.known[x] === UNKNOWN) return false;
  }
  return true;
}

function unpaired(node: Node): number[] {
  const free: number[] = [];
  for (let x = 0; x < 26; x++) if (node.known[x] === UNKNOWN) free.push(x);
  return free;
}

/** Candidate positions per crib; null for locked cribs. */
type Domains = (readonly number[] | null)[];
type Propagation = { ok: true; doms: Domains } | { ok: false; empty: number };

function l1Domains(index: PuzzleIndex, node: Node): Domains {
  return index.cribs.map((_, c) => {
    if (node.lockedPos[c] !== UNKNOWN) return null;
    const dom: number[] = [];
    for (let p = 0; p < index.positions(c); p++) {
      const map = index.mapAt(c, p);
      if (map && consistent(map, node.known) && !overlapsLocked(index, node, c, p)) dom.push(p);
    }
    return dom;
  });
}

function overlapsLocked(index: PuzzleIndex, node: Node, c: number, p: number): boolean {
  for (let d = 0; d < node.lockedPos.length; d++) {
    const q = node.lockedPos[d]!;
    if (q !== UNKNOWN && p < q + index.lengths[d]! && q < p + index.lengths[c]!) return true;
  }
  return false;
}

function propagateTo(index: PuzzleIndex, base: Domains, level: 2 | 3): Propagation {
  const l2 = propagate(index, base);
  return level === 2 || !l2.ok ? l2 : singletonPropagate(index, l2.doms);
}

function supported(index: PuzzleIndex, doms: Domains, c: number, p: number, d: number): boolean {
  const dom = doms[d];
  if (!dom) return true;
  const a = index.pid(c, p);
  return dom.some((q) => index.compatible(a, index.pid(d, q)));
}

/** L2: arc consistency between every pair of unlocked cribs. */
function propagate(index: PuzzleIndex, input: Domains): Propagation {
  const doms = [...input];
  for (let c = 0; c < doms.length; c++) if (doms[c]?.length === 0) return { ok: false, empty: c };
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < doms.length; c++) {
      const dom = doms[c];
      if (!dom) continue;
      const kept = dom.filter((p) => doms.every((_, d) => d === c || supported(index, doms, c, p, d)));
      if (kept.length !== dom.length) {
        if (kept.length === 0) return { ok: false, empty: c };
        doms[c] = kept;
        changed = true;
      }
    }
  }
  return { ok: true, doms };
}

/** L3: drops each position whose assumption leads L2 to a contradiction, until nothing changes. */
function singletonPropagate(index: PuzzleIndex, input: Domains): Propagation {
  let doms = input;
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < doms.length; c++) {
      const dom = doms[c];
      if (!dom || dom.length < 2) continue;
      const kept = dom.filter((p) => propagate(index, withOnly(doms, c, p)).ok);
      if (kept.length === dom.length) continue;
      if (kept.length === 0) return { ok: false, empty: c };
      const next = propagate(index, withOnly(doms, c, ...kept));
      if (!next.ok) return next;
      doms = next.doms;
      changed = true;
    }
  }
  return { ok: true, doms };
}

function withOnly(doms: Domains, c: number, ...positions: number[]): Domains {
  const copy = [...doms];
  copy[c] = positions;
  return copy;
}

/** The crib with the fewest candidates that has no position compatible with crib c at p. */
function mostObviousBlocker(index: PuzzleIndex, doms: Domains, c: number, p: number): number | null {
  let best: number | null = null;
  for (let d = 0; d < doms.length; d++) {
    if (d === c || !doms[d] || supported(index, doms, c, p, d)) continue;
    if (best === null || doms[d]!.length < doms[best]!.length) best = d;
  }
  return best;
}

type InternalMove =
  | { kind: "lock"; c: number; p: number; level: Level }
  | { kind: "swap"; a: number; b: number; via: number; level: Level }; // via -1: the last pair

function forcedInternal(index: PuzzleIndex, node: Node, level: Level): InternalMove[] {
  const moves: InternalMove[] = [];
  const seen = new Set<string>();
  const add = (key: string, move: InternalMove) => {
    if (seen.has(key)) return;
    seen.add(key);
    moves.push(move);
  };

  let doms: Domains = l1Domains(index, node);
  for (let lvl = 1 as Level; lvl <= level; lvl = (lvl + 1) as Level) {
    if (lvl > 1) {
      const result = lvl === 2 ? propagate(index, doms) : singletonPropagate(index, doms);
      if (!result.ok) break;
      doms = result.doms;
    }
    doms.forEach((dom, c) => {
      if (dom?.length === 1) add(`lock:${c}`, { kind: "lock", c, p: dom[0]!, level: lvl });
    });
    doms.forEach((dom, c) => {
      if (!dom || dom.length < 2) return;
      const first = index.mapAt(c, dom[0]!);
      for (let x = 0; x < 26; x++) {
        const y = first[x]!;
        if (y === UNKNOWN || x > y || node.known[x] !== UNKNOWN) continue;
        if (dom.every((p) => index.mapAt(c, p)[x] === y)) add(`swap:${x}:${y}`, { kind: "swap", a: x, b: y, via: c, level: lvl });
      }
    });
    if (lvl === 1) {
      const free = unpaired(node);
      const [a, b] = free;
      if (free.length === 2 && (index.letterCount[a!]! > 0 || index.letterCount[b!]! > 0)) {
        add(`swap:${a}:${b}`, { kind: "swap", a: a!, b: b!, via: -1, level: 1 });
      }
    }
  }
  return moves;
}

function isApplied(node: Node, move: InternalMove): boolean {
  return move.kind === "lock" ? node.lockedPos[move.c] !== UNKNOWN : node.known[move.a] !== UNKNOWN;
}

function applyInternal(index: PuzzleIndex, node: Node, move: InternalMove): Node {
  const known = node.known.slice();
  const lockedPos = node.lockedPos.slice();
  if (move.kind === "lock") {
    const map = index.mapAt(move.c, move.p);
    if (!consistent(map, known)) throw new Error("Forced lock clashes with the known swaps");
    merge(known, map);
    lockedPos[move.c] = move.p;
  } else {
    if (known[move.a] !== UNKNOWN && known[move.a] !== move.b) throw new Error("Forced swap clashes with the known swaps");
    known[move.a] = move.b;
    known[move.b] = move.a;
  }
  return { known, lockedPos };
}

/** Message letters a move would newly decrypt. */
function revealCount(index: PuzzleIndex, before: Node, after: Node): number {
  let n = 0;
  for (let x = 0; x < 26; x++) {
    if (before.known[x] === UNKNOWN && after.known[x] !== UNKNOWN) n += index.letterCount[x]!;
  }
  return n;
}

function nodeKey(node: Node): string {
  return String.fromCharCode(...Array.from(node.known, (v) => v + 66)) + Array.from(node.lockedPos).join(",");
}

const MAX_SEARCH_NODES = 200_000;

function searchPath(index: PuzzleIndex, start: Node, level: Level): InternalMove[] | null {
  if (isWon(index, start)) return [];
  let frontier: { node: Node; path: InternalMove[] }[] = [{ node: start, path: [] }];
  const seen = new Set([nodeKey(start)]);
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { node, path } of frontier) {
      // Explore moves proven at lower levels first, then those that reveal the most,
      // so the first shortest path found is also the easiest to follow.
      const children = forcedInternal(index, node, level)
        .map((move) => ({ move, child: applyInternal(index, node, move) }))
        .map((entry) => ({ ...entry, reveals: revealCount(index, node, entry.child) }))
        .sort((x, y) => x.move.level - y.move.level || y.reveals - x.reveals);
      for (const { move, child } of children) {
        const key = nodeKey(child);
        if (seen.has(key)) continue;
        seen.add(key);
        const childPath = [...path, move];
        if (isWon(index, child)) return childPath;
        next.push({ node: child, path: childPath });
      }
      if (seen.size > MAX_SEARCH_NODES) throw new Error("Forced-move search grew too large");
    }
    frontier = next;
  }
  return null;
}

function search(index: PuzzleIndex, limit: number): number[][] {
  const k = index.cribs.length;
  const assigned: number[] = new Array(k).fill(UNKNOWN);
  const found: number[][] = [];
  const recurse = (depth: number) => {
    if (found.length >= limit) return;
    if (depth === k) {
      found.push([...assigned]);
      return;
    }
    // Try the crib with the fewest positions compatible with those already placed.
    let bestCrib = UNKNOWN;
    let bestList: number[] = [];
    for (let c = 0; c < k; c++) {
      if (assigned[c] !== UNKNOWN) continue;
      const list: number[] = [];
      for (let p = 0; p < index.positions(c); p++) {
        const pid = index.pid(c, p);
        if (index.maps[pid] && assigned.every((other) => other === UNKNOWN || index.compatible(pid, other))) list.push(pid);
      }
      if (list.length === 0) return;
      if (bestCrib === UNKNOWN || list.length < bestList.length) {
        bestCrib = c;
        bestList = list;
      }
    }
    for (const pid of bestList) {
      assigned[bestCrib] = pid;
      recurse(depth + 1);
      assigned[bestCrib] = UNKNOWN;
      if (found.length >= limit) return;
    }
  };
  recurse(0);
  return found;
}

function toForcedMove(index: PuzzleIndex, move: InternalMove): ForcedMove {
  if (move.kind === "lock") return { kind: "lock", crib: index.cribs[move.c]!, pos: move.p, level: move.level };
  return {
    kind: "swap",
    pair: pair(letterOf(move.a), letterOf(move.b)),
    level: move.level,
    because: move.via === -1 ? { kind: "last-pair" } : { kind: "implied", crib: index.cribs[move.via]! },
  };
}
