// Swap-cipher primitives: letters, swap maps, keys and a seeded RNG.
//
// A key pairs all 26 letters into 13 swaps. Encrypting replaces each letter
// with its partner, so decrypting is the same operation, and no letter ever
// encrypts to itself.

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type Letter =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M"
  | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";

export const LETTERS = [...ALPHABET] as readonly Letter[];

/** One swap, stored with the earlier letter first. */
export type Pair = readonly [Letter, Letter];

/** A partial, symmetric map from each letter to its partner: if `map.A` is "G", `map.G` is "A". */
export type SwapMap = Readonly<Partial<Record<Letter, Letter>>>;

/** A complete key: every letter has a partner. */
export type Key = Readonly<Record<Letter, Letter>>;

export function isLetter(value: unknown): value is Letter {
  return typeof value === "string" && value.length === 1 && value >= "A" && value <= "Z";
}

/** Upper-cases a message and drops everything except A–Z. */
export function normalise(message: string): string {
  return message.toUpperCase().replace(/[^A-Z]/g, "");
}

export function pair(a: Letter, b: Letter): Pair {
  return a < b ? [a, b] : [b, a];
}

export function comparePairs(x: Pair, y: Pair): number {
  return x[0] === y[0] ? x[1].localeCompare(y[1]) : x[0].localeCompare(y[0]);
}

export function formatPair([a, b]: Pair): string {
  return `${a}⇄${b}`;
}

/** The swaps in a map, in alphabetical order. */
export function pairsOf(map: SwapMap): Pair[] {
  const pairs: Pair[] = [];
  for (const a of LETTERS) {
    const b = map[a];
    if (b && a < b) pairs.push([a, b]);
  }
  return pairs;
}

/** Builds a swap map, throwing if a letter would swap with itself or with two letters. */
export function swapMapOf(pairs: Iterable<readonly [Letter, Letter]>): SwapMap {
  const map: Partial<Record<Letter, Letter>> = {};
  for (const [a, b] of pairs) {
    if (a === b) throw new Error(`${a} can't swap with itself`);
    if ((map[a] && map[a] !== b) || (map[b] && map[b] !== a)) {
      throw new Error(`${a}⇄${b} conflicts with an earlier swap`);
    }
    map[a] = b;
    map[b] = a;
  }
  return map;
}

export function isCompleteKey(map: SwapMap): map is Key {
  return LETTERS.every((letter) => map[letter] !== undefined);
}

/** Encrypts or decrypts text. Every letter in it must have a partner in the key. */
export function applyKey(key: SwapMap, text: string): string {
  let out = "";
  for (const ch of text) {
    const partner = isLetter(ch) ? key[ch] : undefined;
    if (!partner) throw new Error(`No partner for ${JSON.stringify(ch)}`);
    out += partner;
  }
  return out;
}

/** Reads a key written as "A⇄G B⇄C …" or "AG BC …". */
export function parseKey(text: string): Key {
  const tokens = text
    .toUpperCase()
    .replace(/⇄|<->|[-=]/g, "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const pairs = tokens.map((token) => {
    const [a, b] = token;
    if (token.length !== 2 || !isLetter(a) || !isLetter(b)) throw new Error(`Bad swap ${JSON.stringify(token)}`);
    return [a, b] as const;
  });
  const map = swapMapOf(pairs);
  if (!isCompleteKey(map)) throw new Error("A key must pair all 26 letters");
  return map;
}

export function formatKey(key: SwapMap): string {
  return pairsOf(key).map(formatPair).join(" ");
}

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  /** An integer in [min, max], inclusive. */
  range(min: number, max: number): number;
  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

/** A deterministic RNG (sfc32, seeded by a cyrb128 hash of the seed string). */
export function createRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    range: (min, max) => min + int(max - min + 1),
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    pick(items) {
      if (items.length === 0) throw new Error("Can't pick from an empty list");
      return items[int(items.length)]!;
    },
  };
}

function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A random key: shuffling the alphabet and pairing neighbours picks every pairing equally often. */
export function generateKey(rng: Rng): Key {
  const order = rng.shuffle(LETTERS);
  const pairs: [Letter, Letter][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i]!, order[i + 1]!]);
  return swapMapOf(pairs) as Key;
}
