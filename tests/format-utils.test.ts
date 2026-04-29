import { describe, expect, it } from "vitest";
import { computeCacheHitPercent } from "../src/cache-math.js";
import {
  formatInt,
  formatPercent,
  formatTotalsLine,
  shortModelName,
  summarizeHitPercent,
} from "../src/format-utils.js";
import type { CacheUsageTotals } from "../src/types.js";

function makeTotals(overrides: Partial<CacheUsageTotals> = {}): CacheUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    assistantMessages: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatInt
// ---------------------------------------------------------------------------

describe("formatInt", () => {
  it("formats a small integer with no separator", () => {
    expect(formatInt(42)).toBe("42");
  });

  it("formats thousands with a comma separator", () => {
    expect(formatInt(1000)).toBe("1,000");
    expect(formatInt(1_234_567)).toBe("1,234,567");
  });

  it("rounds fractional values to nearest integer", () => {
    expect(formatInt(3.4)).toBe("3");
    expect(formatInt(3.6)).toBe("4");
  });

  it("handles zero", () => {
    expect(formatInt(0)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------

describe("formatPercent", () => {
  it("always shows exactly one decimal place", () => {
    expect(formatPercent(50)).toBe("50.0%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(100)).toBe("100.0%");
  });

  it("rounds to one decimal place", () => {
    expect(formatPercent(33.333)).toBe("33.3%");
    expect(formatPercent(66.666)).toBe("66.7%");
  });
});

// ---------------------------------------------------------------------------
// shortModelName
// ---------------------------------------------------------------------------

describe("shortModelName", () => {
  it("concatenates provider and model with a slash", () => {
    expect(shortModelName("anthropic", "claude-3")).toBe("anthropic/claude-3");
  });

  it("works with empty strings", () => {
    expect(shortModelName("", "gpt-4")).toBe("/gpt-4");
  });
});

// ---------------------------------------------------------------------------
// summarizeHitPercent
// ---------------------------------------------------------------------------

describe("summarizeHitPercent", () => {
  it("returns 0 for all-zero totals", () => {
    expect(summarizeHitPercent(makeTotals())).toBe(0);
  });

  it("matches the result of calling computeCacheHitPercent directly", () => {
    const totals = makeTotals({ input: 100, cacheRead: 200, cacheWrite: 50 });
    const direct = computeCacheHitPercent(totals.input, totals.cacheRead, totals.cacheWrite);
    expect(summarizeHitPercent(totals)).toBeCloseTo(direct, 10);
  });

  it("returns 100 when all tokens are cache reads", () => {
    const totals = makeTotals({ cacheRead: 500 });
    expect(summarizeHitPercent(totals)).toBe(100);
  });

  it("returns a value between 0 and 100 for partial cache hit", () => {
    const totals = makeTotals({ input: 50, cacheRead: 50 });
    const result = summarizeHitPercent(totals);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// formatTotalsLine
// ---------------------------------------------------------------------------

describe("formatTotalsLine", () => {
  it("contains the label", () => {
    const line = formatTotalsLine("Branch", makeTotals({ assistantMessages: 3 }));
    expect(line).toContain("Branch");
  });

  it("contains 'turns'", () => {
    const line = formatTotalsLine("Tree", makeTotals({ assistantMessages: 7 }));
    expect(line).toContain("turns");
  });

  it("contains 'hit rate'", () => {
    const line = formatTotalsLine("X", makeTotals());
    expect(line).toContain("hit rate");
  });

  it("contains formatted assistant-message count", () => {
    const line = formatTotalsLine("Label", makeTotals({ assistantMessages: 1234 }));
    expect(line).toContain("1,234");
  });

  it("contains the cache hit % as a formatted percent", () => {
    // 100 cacheRead out of 200 total prompt = 50%
    const totals = makeTotals({ input: 100, cacheRead: 100, cacheWrite: 0 });
    const line = formatTotalsLine("Scope", totals);
    expect(line).toContain("50.0%");
  });
});
