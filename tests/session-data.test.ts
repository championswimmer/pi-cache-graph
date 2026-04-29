import { describe, expect, it } from "vitest";
import { computeCacheHitPercent, emptyTotals } from "../src/cache-math.js";
import { collectCacheSessionMetrics } from "../src/session-data.js";
import type { AssistantUsageMetric } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers to build fake SessionEntry objects
// The real types come from @mariozechner/pi-coding-agent, but since TypeScript
// uses structural typing we can construct inline stubs and cast them.
// ---------------------------------------------------------------------------

type FakeUsage = { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number };

function makeAssistantEntry(
  id: string,
  usage: FakeUsage,
  opts: { provider?: string; model?: string; timestamp?: string } = {},
) {
  return {
    type: "message",
    id,
    timestamp: opts.timestamp ?? "2024-01-01T00:00:00.000Z",
    message: {
      role: "assistant",
      provider: opts.provider ?? "anthropic",
      model: opts.model ?? "claude-3",
      usage,
    },
  } as unknown as Parameters<typeof collectCacheSessionMetrics>[0] extends { getEntries(): (infer E)[] }
    ? E
    : never;
}

function makeUserEntry(id: string) {
  return {
    type: "message",
    id,
    timestamp: "2024-01-01T00:00:00.000Z",
    message: { role: "user", content: "hello" },
  } as unknown as ReturnType<typeof makeAssistantEntry>;
}

function makeToolEntry(id: string) {
  return {
    type: "tool_result",
    id,
    timestamp: "2024-01-01T00:00:00.000Z",
  } as unknown as ReturnType<typeof makeAssistantEntry>;
}

type Entry = ReturnType<typeof makeAssistantEntry>;

function makeSessionManager(entries: Entry[], branchIds: string[]) {
  return {
    getEntries: () => entries,
    getBranch: () => branchIds.map((id) => ({ id })) as Entry[],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collectCacheSessionMetrics — empty session", () => {
  it("returns empty message arrays and zero totals", () => {
    const sm = makeSessionManager([], []);
    const metrics = collectCacheSessionMetrics(sm);

    expect(metrics.allMessages).toHaveLength(0);
    expect(metrics.activeBranchMessages).toHaveLength(0);
    expect(metrics.treeTotals).toEqual(emptyTotals());
    expect(metrics.activeBranchTotals).toEqual(emptyTotals());
  });
});

describe("collectCacheSessionMetrics — single assistant message on active branch", () => {
  const usage: FakeUsage = { input: 100, output: 50, cacheRead: 200, cacheWrite: 10, totalTokens: 360 };
  const entry = makeAssistantEntry("e1", usage);
  const sm = makeSessionManager([entry], ["e1"]);
  const metrics = collectCacheSessionMetrics(sm);

  it("allMessages has one entry", () => {
    expect(metrics.allMessages).toHaveLength(1);
  });

  it("activeBranchMessages has one entry", () => {
    expect(metrics.activeBranchMessages).toHaveLength(1);
  });

  it("metric fields match the source usage", () => {
    const m = metrics.allMessages[0] as AssistantUsageMetric;
    expect(m.input).toBe(usage.input);
    expect(m.output).toBe(usage.output);
    expect(m.cacheRead).toBe(usage.cacheRead);
    expect(m.cacheWrite).toBe(usage.cacheWrite);
    expect(m.totalTokens).toBe(usage.totalTokens);
  });

  it("cacheHitPercent is computed with the canonical formula", () => {
    const m = metrics.allMessages[0] as AssistantUsageMetric;
    const expected = computeCacheHitPercent(usage.input, usage.cacheRead, usage.cacheWrite);
    expect(m.cacheHitPercent).toBeCloseTo(expected, 10);
  });

  it("sequence is 1", () => {
    expect(metrics.allMessages[0]?.sequence).toBe(1);
  });

  it("activeBranchSequence is 1", () => {
    expect(metrics.allMessages[0]?.activeBranchSequence).toBe(1);
  });

  it("isOnActiveBranch is true", () => {
    expect(metrics.allMessages[0]?.isOnActiveBranch).toBe(true);
  });

  it("treeTotals accumulates the message", () => {
    expect(metrics.treeTotals.input).toBe(usage.input);
    expect(metrics.treeTotals.assistantMessages).toBe(1);
  });

  it("activeBranchTotals equals treeTotals when all messages are on branch", () => {
    expect(metrics.activeBranchTotals.input).toBe(metrics.treeTotals.input);
  });
});

describe("collectCacheSessionMetrics — two messages, one on branch one off", () => {
  const usageA: FakeUsage = { input: 100, output: 50, cacheRead: 200, cacheWrite: 10, totalTokens: 360 };
  const usageB: FakeUsage = { input: 200, output: 80, cacheRead: 50, cacheWrite: 5, totalTokens: 335 };
  const entryA = makeAssistantEntry("e1", usageA);
  const entryB = makeAssistantEntry("e2", usageB);
  const sm = makeSessionManager([entryA, entryB], ["e1"]); // only e1 on branch
  const metrics = collectCacheSessionMetrics(sm);

  it("allMessages has two entries", () => {
    expect(metrics.allMessages).toHaveLength(2);
  });

  it("activeBranchMessages has one entry", () => {
    expect(metrics.activeBranchMessages).toHaveLength(1);
  });

  it("sequence numbers are 1 and 2 in tree order", () => {
    expect(metrics.allMessages[0]?.sequence).toBe(1);
    expect(metrics.allMessages[1]?.sequence).toBe(2);
  });

  it("off-branch message has activeBranchSequence undefined", () => {
    const offBranch = metrics.allMessages.find((m) => m.entryId === "e2");
    expect(offBranch?.activeBranchSequence).toBeUndefined();
  });

  it("off-branch message has isOnActiveBranch false", () => {
    const offBranch = metrics.allMessages.find((m) => m.entryId === "e2");
    expect(offBranch?.isOnActiveBranch).toBe(false);
  });

  it("treeTotals accumulates both messages", () => {
    expect(metrics.treeTotals.input).toBe(usageA.input + usageB.input);
    expect(metrics.treeTotals.assistantMessages).toBe(2);
  });

  it("activeBranchTotals accumulates only the branch message", () => {
    expect(metrics.activeBranchTotals.input).toBe(usageA.input);
    expect(metrics.activeBranchTotals.assistantMessages).toBe(1);
  });
});

describe("collectCacheSessionMetrics — non-assistant entries are filtered out", () => {
  const usage: FakeUsage = { input: 50, output: 25, cacheRead: 10, cacheWrite: 5, totalTokens: 90 };
  const assistant = makeAssistantEntry("e1", usage);
  const user = makeUserEntry("u1");
  const tool = makeToolEntry("t1");
  const sm = makeSessionManager([user, assistant, tool], ["e1"]);
  const metrics = collectCacheSessionMetrics(sm);

  it("only counts the assistant message", () => {
    expect(metrics.allMessages).toHaveLength(1);
    expect(metrics.allMessages[0]?.entryId).toBe("e1");
  });

  it("treeTotals.assistantMessages is 1, not 3", () => {
    expect(metrics.treeTotals.assistantMessages).toBe(1);
  });
});
