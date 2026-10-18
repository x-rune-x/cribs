import { describe, expect, it } from "vitest";
import { swapMapOf } from "./cipher";
import { GOLDEN_CIPHERTEXT as CT } from "./fixtures/golden";
import { checkPlacement, checkSwap, mergeSwaps, overlaps, scanPlacements } from "./rules";

// Golden ciphertext, 0-based:
//  0U 1K 2K 3O 4G 5O 6O 7Y 8K 9T 10V 11R 12U 13W 14V 15V 16G 17O 18R 19G 20I 21X

const MILL_SWAPS = swapMapOf([
  ["M", "U"],
  ["I", "W"],
  ["L", "V"],
]);

describe("checkPlacement", () => {
  it("accepts MILL at its true position and lists its swaps", () => {
    expect(checkPlacement(CT, { crib: "MILL", pos: 12 })).toEqual({
      ok: true,
      pairs: [
        ["I", "W"],
        ["L", "V"],
        ["M", "U"],
      ],
    });
  });

  it("rejects a letter that would encrypt to itself", () => {
    // The mockup's "Spot 12 puts W over W".
    expect(checkPlacement(CT, { crib: "DAWN", pos: 11 })).toEqual({
      ok: false,
      reasons: [{ kind: "self-encrypt", letter: "W", index: 13 }],
    });
  });

  it("rejects two crib letters landing on the same ciphertext letter", () => {
    // MILL at 4 puts M and L both on O.
    expect(checkPlacement(CT, { crib: "MILL", pos: 3 })).toEqual({
      ok: false,
      reasons: [
        { kind: "self-contradiction", letter: "O", partners: ["M", "L"], indices: [3, 5] },
      ],
    });
  });

  it("rejects a crib letter that would map to two different letters", () => {
    // MEET at 3 puts the two Es over O and G.
    const result = checkPlacement(CT, { crib: "MEET", pos: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContainEqual({
        kind: "self-contradiction",
        letter: "E",
        partners: ["O", "G"],
        indices: [3, 4],
      });
    }
  });

  it("rejects a placement that contradicts a known swap", () => {
    const known = swapMapOf([["T", "O"]]);
    const result = checkPlacement(CT, { crib: "THE", pos: 8 }, known);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toEqual({
        kind: "conflicts-known",
        letter: "T",
        would: "K",
        known: "O",
        index: 8,
      });
    }
  });

  it("rejects a placement that overlaps a locked crib", () => {
    expect(
      checkPlacement(CT, { crib: "MEET", pos: 13 }, MILL_SWAPS, [{ crib: "MILL", pos: 12 }]),
    ).toEqual({
      ok: false,
      reasons: [
        { kind: "conflicts-known", letter: "M", would: "W", known: "U", index: 13 },
        { kind: "conflicts-known", letter: "V", would: "E", known: "L", index: 14 },
        { kind: "overlaps-locked", other: { crib: "MILL", pos: 12 } },
      ],
    });
  });

  it("throws when the crib runs off the end of the message", () => {
    expect(() => checkPlacement(CT, { crib: "MILL", pos: 19 })).toThrow(RangeError);
    expect(() => checkPlacement(CT, { crib: "MILL", pos: -1 })).toThrow(RangeError);
  });
});

describe("scanPlacements", () => {
  it("finds the one spot for DAWN once MILL is locked, as in the mockup", () => {
    const scan = scanPlacements(CT, "DAWN", MILL_SWAPS, [{ crib: "MILL", pos: 12 }]);
    expect(scan).toHaveLength(19);
    const fits = scan.flatMap((reasons, pos) => (reasons.length === 0 ? [pos] : []));
    expect(fits).toEqual([18]);
    expect(scan[11]).toContainEqual({ kind: "self-encrypt", letter: "W", index: 13 });
  });
});

describe("overlaps", () => {
  it("treats touching placements as not overlapping", () => {
    expect(overlaps({ crib: "MEET", pos: 0 }, { crib: "THE", pos: 4 })).toBe(false);
    expect(overlaps({ crib: "MEET", pos: 0 }, { crib: "THE", pos: 3 })).toBe(true);
    expect(overlaps({ crib: "THE", pos: 3 }, { crib: "MEET", pos: 0 })).toBe(true);
  });
});

describe("checkSwap", () => {
  const known = swapMapOf([["T", "O"]]);

  it("reports a letter that already has a different partner", () => {
    expect(checkSwap(known, "T", "K")).toEqual([
      { kind: "conflicts-known", letter: "T", would: "K", known: "O" },
    ]);
    expect(checkSwap(known, "K", "O")).toEqual([
      { kind: "conflicts-known", letter: "O", would: "K", known: "T" },
    ]);
  });

  it("accepts a swap that fits what's known", () => {
    expect(checkSwap(known, "H", "Y")).toEqual([]);
  });
});

describe("mergeSwaps", () => {
  it("merges compatible swap sets", () => {
    const result = mergeSwaps(swapMapOf([["T", "O"]]), MILL_SWAPS);
    expect(result).toEqual({
      ok: true,
      map: swapMapOf([
        ["T", "O"],
        ["M", "U"],
        ["I", "W"],
        ["L", "V"],
      ]),
    });
  });

  it("reports the clashing letter", () => {
    expect(mergeSwaps(swapMapOf([["M", "G"]]), MILL_SWAPS)).toEqual({
      ok: false,
      letter: "M",
      partners: ["G", "U"],
    });
  });
});
