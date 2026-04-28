import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { SessionEntry, SessionManager } from "@mariozechner/pi-coding-agent";
import type { AssistantUsageMetric, CacheSessionMetrics, CacheUsageTotals } from "./types.js";

function emptyTotals(): CacheUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    assistantMessages: 0,
  };
}

function addToTotals(totals: CacheUsageTotals, message: AssistantUsageMetric): void {
  totals.input += message.input;
  totals.output += message.output;
  totals.cacheRead += message.cacheRead;
  totals.cacheWrite += message.cacheWrite;
  totals.totalTokens += message.totalTokens;
  totals.assistantMessages += 1;
}

function isAssistantMessageEntry(entry: SessionEntry): entry is Extract<SessionEntry, { type: "message" }> & {
  message: AssistantMessage;
} {
  return entry.type === "message" && entry.message.role === "assistant";
}

function computeCacheHitPercent(input: number, cacheRead: number): number {
  const denominator = input + cacheRead;
  if (denominator <= 0) return 0;
  return (cacheRead / denominator) * 100;
}

type SessionReader = Pick<SessionManager, "getEntries" | "getBranch">;

export function collectCacheSessionMetrics(sessionManager: SessionReader): CacheSessionMetrics {
  const allEntries = sessionManager.getEntries();
  const activeBranchIds = new Set(sessionManager.getBranch().map((entry) => entry.id));

  const treeTotals = emptyTotals();
  const activeBranchTotals = emptyTotals();
  const allMessages: AssistantUsageMetric[] = [];
  const activeBranchMessages: AssistantUsageMetric[] = [];

  let sequence = 0;
  let activeBranchSequence = 0;

  for (const entry of allEntries) {
    if (!isAssistantMessageEntry(entry)) continue;

    sequence += 1;

    const metric: AssistantUsageMetric = {
      sequence,
      activeBranchSequence: undefined,
      entryId: entry.id,
      timestamp: entry.timestamp,
      provider: entry.message.provider,
      model: entry.message.model,
      input: entry.message.usage.input,
      output: entry.message.usage.output,
      cacheRead: entry.message.usage.cacheRead,
      cacheWrite: entry.message.usage.cacheWrite,
      totalTokens: entry.message.usage.totalTokens,
      cacheHitPercent: computeCacheHitPercent(entry.message.usage.input, entry.message.usage.cacheRead),
      isOnActiveBranch: activeBranchIds.has(entry.id),
    };

    addToTotals(treeTotals, metric);
    allMessages.push(metric);

    if (metric.isOnActiveBranch) {
      activeBranchSequence += 1;
      metric.activeBranchSequence = activeBranchSequence;
      addToTotals(activeBranchTotals, metric);
      activeBranchMessages.push(metric);
    }
  }

  return {
    allMessages,
    activeBranchMessages,
    treeTotals,
    activeBranchTotals,
  };
}
