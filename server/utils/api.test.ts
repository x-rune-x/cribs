import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./api";

describe("checkRateLimit", () => {
  it("allows up to the limit in each window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 1000, 0).ok).toBe(true);
    expect(checkRateLimit(key, 3, 1000, 500)).toEqual({ ok: false, retryAfterMs: 500 });
    expect(checkRateLimit(key, 3, 1000, 1000).ok).toBe(true);
  });
});
