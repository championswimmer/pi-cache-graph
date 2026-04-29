import { describe, expect, it } from "vitest";
import { averageHitPercent, bucketMessages, maxHitPercent, minHitPercent } from "../src/graph-view.js";
import type { AssistantUsageMetric } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMetric(cacheHitPercent: number, seq = 1): AssistantUsageMetric {
  return {
    sequence: seq,
    entryId: `e${seq}`,
    timestamp: "2024-01-01T00:00:00.000Z",
    provider: "anthropic",
    model: "claude-3",
    input: 100,
    output: 50,
    cacheRead: 200,
    cacheWrite: 10,
    totalTokens: 360,
    cacheHitPercent,
    isOnActiveBranch: true,
  };
}

// ---------------------------------------------------------------------------
// bucketMessages
// ---------------------------------------------------------------------------

describe("bucketMessages", () => {
  it("returns empty array for empty input", () => {
    expect(bucketMessages([], 5)).toHaveLength(0);
  });

  it("puts each message in its own bucket when count ≤ bucketCount", () => {
    const msgs = [makeMetric(10, 1), makeMetric(20, 2), makeMetric(30, 3)];
    const buckets = bucketMessages(msgs, 5);
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toHaveLength(1);
    expect(buckets[0]?.[0]?.sequence).toBe(1);
  });

  it("returns exactly bucketCount buckets when messages > bucketCount", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => makeMetric(i * 5, i + 1));
    const buckets = bucketMessages(msgs, 7);
    expect(buckets).toHaveLength(7);
  });

  it("covers all messages with no duplicates or omissions", () => {
    const msgs = Array.from({ length: 15 }, (_, i) => makeMetric(i * 5, i + 1));
    const buckets = bucketMessages(msgs, 4);
    const allInBuckets = buckets.flat();
    expect(allInBuckets).toHaveLength(msgs.length);
    const seqs = allInBuckets.map((m) => m.sequence).sort((a, b) => a - b);
    expect(seqs).toEqual(msgs.map((m) => m.sequence));
  });

  it("returns one bucket with one message when there is one message and many bucket slots", () => {
    const msgs = [makeMetric(55, 1)];
    const buckets = bucketMessages(msgs, 50);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// averageHitPercent
// ---------------------------------------------------------------------------

describe("averageHitPercent", () => {
  it("returns 0 for empty array", () => {
    expect(averageHitPercent([])).toBe(0);
  });

  it("returns the single message's cacheHitPercent", () => {
    expect(averageHitPercent([makeMetric(42)])).toBe(42);
  });

  it("returns the arithmetic mean for multiple messages", () => {
    const msgs = [makeMetric(20), makeMetric(40), makeMetric(60)];
    expect(averageHitPercent(msgs)).toBeCloseTo(40, 5);
  });

  it("handles all-zero hit percents", () => {
    const msgs = [makeMetric(0), makeMetric(0)];
    expect(averageHitPercent(msgs)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// minHitPercent
// ---------------------------------------------------------------------------

describe("minHitPercent", () => {
  it("returns 0 for empty array", () => {
    expect(minHitPercent([])).toBe(0);
  });

  it("returns the single message's cacheHitPercent", () => {
    expect(minHitPercent([makeMetric(77)])).toBe(77);
  });

  it("returns the smallest value across multiple messages", () => {
    const msgs = [makeMetric(30), makeMetric(10), makeMetric(50)];
    expect(minHitPercent(msgs)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// maxHitPercent
// ---------------------------------------------------------------------------

describe("maxHitPercent", () => {
  it("returns 0 for empty array", () => {
    expect(maxHitPercent([])).toBe(0);
  });

  it("returns the single message's cacheHitPercent", () => {
    expect(maxHitPercent([makeMetric(33)])).toBe(33);
  });

  it("returns the largest value across multiple messages", () => {
    const msgs = [makeMetric(30), makeMetric(10), makeMetric(50)];
    expect(maxHitPercent(msgs)).toBe(50);
  });
});
