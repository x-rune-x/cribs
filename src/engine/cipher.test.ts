import { describe, expect, it } from "vitest";
import {
  LETTERS,
  applyKey,
  createRng,
  formatKey,
  generateKey,
  normalise,
  pairsOf,
  parseKey,
  swapMapOf,
} from "./cipher";
import { GOLDEN_CIPHERTEXT, GOLDEN_KEY, GOLDEN_PLAINTEXT } from "./fixtures/golden";

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createRng("seed");
    const b = createRng("seed");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("gives different sequences for different seeds", () => {
    const a = createRng("one");
    const b = createRng("two");
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it("keeps int and range inside their bounds", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      const r = rng.range(3, 6);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(6);
    }
  });

  it("shuffles without losing or adding items", () => {
    const rng = createRng("shuffle");
    const shuffled = rng.shuffle(LETTERS);
    expect([...shuffled].sort()).toEqual([...LETTERS]);
  });
});

describe("generateKey", () => {
  it("pairs all 26 letters into 13 swaps, and no letter encrypts to itself", () => {
    for (let i = 0; i < 200; i++) {
      const key = generateKey(createRng(`key-${i}`));
      for (const letter of LETTERS) {
        expect(key[letter]).not.toBe(letter);
        expect(key[key[letter]]).toBe(letter);
      }
      expect(pairsOf(key)).toHaveLength(13);
    }
  });

  it("is reproducible from a seed", () => {
    expect(generateKey(createRng("same"))).toEqual(generateKey(createRng("same")));
  });
});

describe("applyKey", () => {
  it("encrypts the golden plaintext to the golden ciphertext", () => {
    expect(applyKey(GOLDEN_KEY, GOLDEN_PLAINTEXT)).toBe(GOLDEN_CIPHERTEXT);
  });

  it("decrypts with the same operation", () => {
    expect(applyKey(GOLDEN_KEY, GOLDEN_CIPHERTEXT)).toBe(GOLDEN_PLAINTEXT);
    const key = generateKey(createRng("roundtrip"));
    const text = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG";
    expect(applyKey(key, applyKey(key, text))).toBe(text);
  });

  it("throws on a letter with no partner", () => {
    expect(() => applyKey(swapMapOf([["A", "B"]]), "ABC")).toThrow();
  });
});

describe("normalise", () => {
  it("keeps only A–Z, upper-cased", () => {
    expect(normalise("Meet at the old mill, at dawn!")).toBe(GOLDEN_PLAINTEXT);
  });
});

describe("parseKey and formatKey", () => {
  it("round-trips a key", () => {
    expect(parseKey(formatKey(GOLDEN_KEY))).toEqual(GOLDEN_KEY);
    expect(formatKey(GOLDEN_KEY)).toBe(
      "A⇄G B⇄C D⇄R E⇄K F⇄J H⇄Y I⇄W L⇄V M⇄U N⇄X O⇄T P⇄Q S⇄Z",
    );
  });

  it("accepts plain letter pairs", () => {
    expect(parseKey("AG BC DR EK FJ HY IW LV MU NX OT PQ SZ")).toEqual(GOLDEN_KEY);
  });

  it("rejects keys that are incomplete, repeat a letter or pair a letter with itself", () => {
    expect(() => parseKey("AG BC")).toThrow();
    expect(() => parseKey("AG AC DR EK FJ HY IW LV MU NX OT PQ SZ")).toThrow();
    expect(() => parseKey("AA BC DR EK FJ HY IW LV MU NX OT PQ SZ")).toThrow();
  });
});

describe("swapMapOf and pairsOf", () => {
  it("builds a symmetric map and lists its pairs in order", () => {
    const map = swapMapOf([
      ["U", "M"],
      ["I", "W"],
    ]);
    expect(map).toEqual({ M: "U", U: "M", I: "W", W: "I" });
    expect(pairsOf(map)).toEqual([
      ["I", "W"],
      ["M", "U"],
    ]);
  });

  it("rejects conflicting swaps", () => {
    expect(() =>
      swapMapOf([
        ["A", "B"],
        ["A", "C"],
      ]),
    ).toThrow();
  });
});
