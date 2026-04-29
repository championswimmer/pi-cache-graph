/**
 * E2E fixture test — runs collectCacheSessionMetrics against a real stripped
 * session snapshot and asserts against golden values pre-computed by an
 * independent Python script.
 *
 * Fixture: tests/fixtures/session-linear.jsonl
 *   - Session: 2026-04-28T23-33-34-291Z (pi-cache-graph project)
 *   - 81 total entries, 22 assistant messages with usage
 *   - Linear chain (no branching) → all messages are on active branch
 *   - Provider mix: gpt-5.4 (OpenAI-style, cacheWrite=0) for msgs 1–4
 *                   claude-opus-4.7 (Anthropic-style, cacheWrite>0) for msgs 5–22
 */

import { describe, expect, it } from "vitest";
import { computeCacheHitPercent } from "../src/cache-math.js";
import { collectCacheSessionMetrics } from "../src/session-data.js";
import { loadSessionFixture, makeSessionManagerFromFixture } from "./helpers/load-session-fixture.js";

// ── Load fixture once for all tests ─────────────────────────────────────────

const ENTRIES = loadSessionFixture("session-linear.jsonl");
const SM = makeSessionManagerFromFixture(ENTRIES);
const METRICS = collectCacheSessionMetrics(
  SM as unknown as Parameters<typeof collectCacheSessionMetrics>[0],
);

// ── Golden values (computed independently by Python from the raw JSONL) ──────

const GOLDEN_TOTALS = {
  assistantMessages: 22,
  input: 8493,
  output: 12538,
  cacheRead: 612477,
  cacheWrite: 54995,
  totalTokens: 688503,
};

// ── Structure ────────────────────────────────────────────────────────────────

describe("fixture: structure", () => {
  it("reads 22 assistant messages from the JSONL", () => {
    expect(METRICS.allMessages).toHaveLength(22);
  });

  it("all 22 messages are on the active branch (linear session)", () => {
    expect(METRICS.activeBranchMessages).toHaveLength(22);
  });

  it("every message has isOnActiveBranch=true", () => {
    expect(METRICS.allMessages.every((m) => m.isOnActiveBranch)).toBe(true);
  });

  it("sequence numbers run 1–22 in tree order", () => {
    expect(METRICS.allMessages.map((m) => m.sequence)).toEqual(
      Array.from({ length: 22 }, (_, i) => i + 1),
    );
  });

  it("activeBranchSequence matches sequence for every message", () => {
    for (const m of METRICS.allMessages) {
      expect(m.activeBranchSequence).toBe(m.sequence);
    }
  });

  it("every message has a non-empty entryId", () => {
    for (const m of METRICS.allMessages) {
      expect(typeof m.entryId).toBe("string");
      expect(m.entryId.length).toBeGreaterThan(0);
    }
  });
});

// ── Tree totals (golden) ─────────────────────────────────────────────────────

describe("fixture: tree totals match Python golden values", () => {
  it("assistantMessages = 22", () => {
    expect(METRICS.treeTotals.assistantMessages).toBe(GOLDEN_TOTALS.assistantMessages);
  });

  it(`input = ${GOLDEN_TOTALS.input}`, () => {
    expect(METRICS.treeTotals.input).toBe(GOLDEN_TOTALS.input);
  });

  it(`output = ${GOLDEN_TOTALS.output}`, () => {
    expect(METRICS.treeTotals.output).toBe(GOLDEN_TOTALS.output);
  });

  it(`cacheRead = ${GOLDEN_TOTALS.cacheRead}`, () => {
    expect(METRICS.treeTotals.cacheRead).toBe(GOLDEN_TOTALS.cacheRead);
  });

  it(`cacheWrite = ${GOLDEN_TOTALS.cacheWrite}`, () => {
    expect(METRICS.treeTotals.cacheWrite).toBe(GOLDEN_TOTALS.cacheWrite);
  });

  it(`totalTokens = ${GOLDEN_TOTALS.totalTokens}`, () => {
    expect(METRICS.treeTotals.totalTokens).toBe(GOLDEN_TOTALS.totalTokens);
  });

  it("activeBranchTotals equals treeTotals (linear session)", () => {
    expect(METRICS.activeBranchTotals).toEqual(METRICS.treeTotals);
  });
});

// ── Per-message spot checks (golden) ─────────────────────────────────────────

describe("fixture: per-message cacheHitPercent spot checks", () => {
  function msg(seq: number) {
    const m = METRICS.allMessages.find((m) => m.sequence === seq);
    if (!m) throw new Error(`No message with sequence ${seq}`);
    return m;
  }

  // OpenAI-style: cacheWrite=0, input=2470, cacheRead=5632 → 5632/8102 = 69.51%
  it("seq=1 (gpt-5.4, OpenAI-style): cacheHitPercent ≈ 69.51%", () => {
    const m = msg(1);
    expect(m.cacheHitPercent).toBeCloseTo(computeCacheHitPercent(2470, 5632, 0), 4);
    expect(m.cacheHitPercent).toBeCloseTo(69.5137, 3);
  });

  // OpenAI-style: input=1223, cacheRead=8064, cacheWrite=0 → 86.83%
  it("seq=2 (gpt-5.4, OpenAI-style): cacheHitPercent ≈ 86.83%", () => {
    const m = msg(2);
    expect(m.cacheHitPercent).toBeCloseTo(computeCacheHitPercent(1223, 8064, 0), 4);
    expect(m.cacheHitPercent).toBeCloseTo(86.8311, 3);
  });

  // OpenAI-style: last gpt-5.4 message
  it("seq=4 (gpt-5.4, last OpenAI-style): cacheHitPercent ≈ 75.79%", () => {
    const m = msg(4);
    expect(m.cacheHitPercent).toBeCloseTo(computeCacheHitPercent(3066, 9600, 0), 4);
    expect(m.cacheHitPercent).toBeCloseTo(75.7935, 3);
  });

  // Anthropic cold cache: first claude turn, cacheRead=0, cacheWrite=26630 → 0%
  it("seq=5 (claude, cold cache, Anthropic-style): cacheHitPercent = 0%", () => {
    const m = msg(5);
    expect(m.cacheWrite).toBeGreaterThan(0); // confirm it's Anthropic-style
    expect(m.cacheRead).toBe(0);
    expect(m.cacheHitPercent).toBe(0);
  });

  // Anthropic warm cache: cacheWrite in denominator makes a real difference
  // input=1, cacheRead=26630, cacheWrite=2722 → 26630/29353 = 90.72%
  it("seq=6 (claude, first warm turn, Anthropic-style): cacheHitPercent ≈ 90.72%", () => {
    const m = msg(6);
    expect(m.cacheHitPercent).toBeCloseTo(computeCacheHitPercent(1, 26630, 2722), 4);
    expect(m.cacheHitPercent).toBeCloseTo(90.7233, 3);
  });

  // Near-100% cache hit at the tail of the session
  // input=1, cacheRead=39130, cacheWrite=117 → 99.70%
  it("seq=22 (claude, near-100% cache): cacheHitPercent ≈ 99.70%", () => {
    const m = msg(22);
    expect(m.cacheHitPercent).toBeCloseTo(computeCacheHitPercent(1, 39130, 117), 4);
    expect(m.cacheHitPercent).toBeCloseTo(99.6993, 3);
  });
});

// ── Formula invariants over all 22 messages ──────────────────────────────────

describe("fixture: formula invariants (all 22 messages)", () => {
  it("every message has cacheHitPercent in [0, 100]", () => {
    for (const m of METRICS.allMessages) {
      expect(m.cacheHitPercent).toBeGreaterThanOrEqual(0);
      expect(m.cacheHitPercent).toBeLessThanOrEqual(100);
    }
  });

  it("cacheHitPercent equals direct computeCacheHitPercent call for every message", () => {
    for (const m of METRICS.allMessages) {
      const expected = computeCacheHitPercent(m.input, m.cacheRead, m.cacheWrite);
      expect(m.cacheHitPercent).toBeCloseTo(expected, 10);
    }
  });

  it("no message has NaN or Infinity in any numeric field", () => {
    for (const m of METRICS.allMessages) {
      for (const field of ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cacheHitPercent"] as const) {
        expect(Number.isFinite(m[field])).toBe(true);
      }
    }
  });
});

// ── Provider coverage ────────────────────────────────────────────────────────

describe("fixture: provider coverage", () => {
  it("fixture contains OpenAI-style messages (cacheWrite=0, cacheRead>0)", () => {
    expect(METRICS.allMessages.some((m) => m.cacheWrite === 0 && m.cacheRead > 0)).toBe(true);
  });

  it("fixture contains Anthropic-style messages (cacheWrite>0)", () => {
    expect(METRICS.allMessages.some((m) => m.cacheWrite > 0)).toBe(true);
  });

  it("Anthropic-style: cacheWrite is included in denominator (not just input+cacheRead)", () => {
    const anthropicMsgs = METRICS.allMessages.filter((m) => m.cacheWrite > 0 && m.cacheRead > 0);
    expect(anthropicMsgs.length).toBeGreaterThan(0);
    for (const m of anthropicMsgs) {
      const wrongResult = (m.cacheRead / (m.input + m.cacheRead)) * 100;
      const correctResult = computeCacheHitPercent(m.input, m.cacheRead, m.cacheWrite);
      // The two formulas must differ, proving cacheWrite is in the denominator
      expect(Math.abs(wrongResult - correctResult)).toBeGreaterThan(0.01);
      expect(m.cacheHitPercent).toBeCloseTo(correctResult, 10);
      expect(m.cacheHitPercent).not.toBeCloseTo(wrongResult, 1);
    }
  });
});
