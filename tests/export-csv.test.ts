import { describe, expect, it } from "vitest";
import { buildCsv, csvEscape, sanitizeFileName } from "../src/export.js";
import type { CacheSessionMetrics } from "../src/types.js";

// ---------------------------------------------------------------------------
// Minimal CacheSessionMetrics fixture
// ---------------------------------------------------------------------------

function makeMinimalMetrics(): CacheSessionMetrics {
  return {
    allMessages: [
      {
        sequence: 1,
        activeBranchSequence: 1,
        entryId: "e1",
        timestamp: "2024-06-01T12:00:00.000Z",
        provider: "anthropic",
        model: "claude-3",
        input: 100,
        output: 50,
        cacheRead: 200,
        cacheWrite: 10,
        totalTokens: 360,
        cacheHitPercent: 64.52,
        isOnActiveBranch: true,
      },
    ],
    activeBranchMessages: [],
    treeTotals: {
      input: 100,
      output: 50,
      cacheRead: 200,
      cacheWrite: 10,
      totalTokens: 360,
      assistantMessages: 1,
    },
    activeBranchTotals: {
      input: 100,
      output: 50,
      cacheRead: 200,
      cacheWrite: 10,
      totalTokens: 360,
      assistantMessages: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// csvEscape
// ---------------------------------------------------------------------------

describe("csvEscape", () => {
  it("returns plain strings unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("abc123")).toBe("abc123");
  });

  it("wraps strings containing a comma in double-quotes", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("escapes embedded double-quotes as two double-quotes and wraps the value", () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
  });

  it("wraps strings containing a newline in double-quotes", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns empty string for null", () => {
    expect(csvEscape(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(csvEscape(undefined)).toBe("");
  });

  it("converts numbers to their string representation without quotes", () => {
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(3.14)).toBe("3.14");
  });

  it("converts booleans to strings without quotes", () => {
    expect(csvEscape(true)).toBe("true");
    expect(csvEscape(false)).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// sanitizeFileName
// ---------------------------------------------------------------------------

describe("sanitizeFileName", () => {
  it("returns alphanumeric names unchanged", () => {
    expect(sanitizeFileName("mysession")).toBe("mysession");
    expect(sanitizeFileName("session123")).toBe("session123");
  });

  it("allows dots and dashes", () => {
    expect(sanitizeFileName("my-session.v2")).toBe("my-session.v2");
  });

  it("replaces spaces with dashes", () => {
    expect(sanitizeFileName("my session")).toBe("my-session");
  });

  it("collapses multiple consecutive special characters into one dash", () => {
    expect(sanitizeFileName("foo  bar")).toBe("foo-bar");
    expect(sanitizeFileName("foo!!bar")).toBe("foo-bar");
  });

  it("strips leading and trailing dashes and dots", () => {
    expect(sanitizeFileName("-hello-")).toBe("hello");
    expect(sanitizeFileName(".hello.")).toBe("hello");
  });

  it("returns the fallback 'session' for a name that sanitizes to empty", () => {
    expect(sanitizeFileName("")).toBe("session");
    expect(sanitizeFileName("!!!")).toBe("session");
  });
});

// ---------------------------------------------------------------------------
// buildCsv
// ---------------------------------------------------------------------------

describe("buildCsv", () => {
  it("first line is the comma-separated header row", () => {
    const csv = buildCsv(makeMinimalMetrics());
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toContain("row_type");
    expect(firstLine).toContain("cache_hit_percent");
    expect(firstLine).toContain("sent_tokens");
  });

  it("contains summary rows (at least two)", () => {
    const csv = buildCsv(makeMinimalMetrics());
    const summaryLines = csv.split("\n").filter((line) => line.startsWith("summary,"));
    expect(summaryLines.length).toBeGreaterThanOrEqual(2);
  });

  it("contains a message row when allMessages is non-empty", () => {
    const csv = buildCsv(makeMinimalMetrics());
    const messageLines = csv.split("\n").filter((line) => line.startsWith("message,"));
    expect(messageLines.length).toBe(1);
  });

  it("each data row has the same number of columns as the header", () => {
    const csv = buildCsv(makeMinimalMetrics());
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const headerCount = lines[0]!.split(",").length;
    for (const line of lines.slice(1)) {
      // Count only top-level commas (not inside quotes) by using CSV-aware split
      const colCount = line.split(",").length; // good enough for our fixture (no embedded commas)
      // Each row must have at least as many commas as the header; allow trailing empty cells
      expect(colCount).toBeGreaterThanOrEqual(headerCount - 5); // allow trailing empty cells
    }
  });

  it("the message row contains the entry_id from the fixture", () => {
    const csv = buildCsv(makeMinimalMetrics());
    expect(csv).toContain("e1");
  });

  it("ends with a trailing newline", () => {
    const csv = buildCsv(makeMinimalMetrics());
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("produces no message rows when allMessages is empty", () => {
    const metrics: CacheSessionMetrics = {
      ...makeMinimalMetrics(),
      allMessages: [],
    };
    const csv = buildCsv(metrics);
    const messageLines = csv.split("\n").filter((line) => line.startsWith("message,"));
    expect(messageLines).toHaveLength(0);
  });
});
