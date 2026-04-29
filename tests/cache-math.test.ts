import { describe, expect, it } from "vitest";
import { addToTotals, computeCacheHitPercent, emptyTotals } from "../src/cache-math.js";
import type { AssistantUsageMetric } from "../src/types.js";

// ---------------------------------------------------------------------------
// computeCacheHitPercent
// ---------------------------------------------------------------------------

describe("computeCacheHitPercent", () => {
  it("returns 0 when denominator is zero", () => {
    expect(computeCacheHitPercent(0, 0, 0)).toBe(0);
  });

  it("returns 0 when only output exists (no prompt at all)", () => {
    expect(computeCacheHitPercent(0, 0, 0)).toBe(0);
  });

  it("returns 100 when everything is a cache hit (all cacheRead, no input or cacheWrite)", () => {
    expect(computeCacheHitPercent(0, 500, 0)).toBe(100);
  });

  it("handles Anthropic-style: input is fresh portion only, cacheWrite is newly cached", () => {
    // denominator = 100 + 200 + 50 = 350; hit = 200/350 * 100
    const result = computeCacheHitPercent(100, 200, 50);
    expect(result).toBeCloseTo((200 / 350) * 100, 5);
  });

  it("handles OpenAI-style: cacheWrite is 0, input includes everything", () => {
    // denominator = 400 + 100 + 0 = 500; hit = 100/500 * 100 = 20
    const result = computeCacheHitPercent(400, 100, 0);
    expect(result).toBeCloseTo(20, 5);
  });

  it("returns 50% for equal input and cacheRead with no cacheWrite", () => {
    expect(computeCacheHitPercent(50, 50, 0)).toBeCloseTo(50, 5);
  });

  it("does not return NaN or Infinity for large values", () => {
    const result = computeCacheHitPercent(1_000_000, 5_000_000, 500_000);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// emptyTotals
// ---------------------------------------------------------------------------

describe("emptyTotals", () => {
  it("returns an object with all numeric fields set to 0", () => {
    const totals = emptyTotals();
    expect(totals.input).toBe(0);
    expect(totals.output).toBe(0);
    expect(totals.cacheRead).toBe(0);
    expect(totals.cacheWrite).toBe(0);
    expect(totals.totalTokens).toBe(0);
    expect(totals.assistantMessages).toBe(0);
  });

  it("returns a new object each time (no shared reference)", () => {
    const a = emptyTotals();
    const b = emptyTotals();
    a.input = 999;
    expect(b.input).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addToTotals
// ---------------------------------------------------------------------------

function makeMetric(overrides: Partial<AssistantUsageMetric> = {}): AssistantUsageMetric {
  return {
    sequence: 1,
    entryId: "e1",
    timestamp: "2024-01-01T00:00:00.000Z",
    provider: "anthropic",
    model: "claude-3",
    input: 100,
    output: 50,
    cacheRead: 200,
    cacheWrite: 10,
    totalTokens: 360,
    cacheHitPercent: 57.14,
    isOnActiveBranch: true,
    ...overrides,
  };
}

describe("addToTotals", () => {
  it("accumulates a single message into empty totals", () => {
    const totals = emptyTotals();
    const msg = makeMetric();
    addToTotals(totals, msg);

    expect(totals.input).toBe(100);
    expect(totals.output).toBe(50);
    expect(totals.cacheRead).toBe(200);
    expect(totals.cacheWrite).toBe(10);
    expect(totals.totalTokens).toBe(360);
    expect(totals.assistantMessages).toBe(1);
  });

  it("accumulates two messages by summing all fields", () => {
    const totals = emptyTotals();
    addToTotals(totals, makeMetric({ input: 100, output: 50, cacheRead: 200, cacheWrite: 10, totalTokens: 360 }));
    addToTotals(totals, makeMetric({ input: 200, output: 80, cacheRead: 100, cacheWrite: 20, totalTokens: 400 }));

    expect(totals.input).toBe(300);
    expect(totals.output).toBe(130);
    expect(totals.cacheRead).toBe(300);
    expect(totals.cacheWrite).toBe(30);
    expect(totals.totalTokens).toBe(760);
    expect(totals.assistantMessages).toBe(2);
  });

  it("does not mutate the message argument", () => {
    const totals = emptyTotals();
    const msg = makeMetric({ input: 100 });
    addToTotals(totals, msg);
    expect(msg.input).toBe(100); // unchanged
  });
});
