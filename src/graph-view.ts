import type { Theme } from "@mariozechner/pi-coding-agent";
import type { AssistantUsageMetric, CacheSessionMetrics } from "./types.js";
import { formatInt, formatPercent, formatTotalsLine } from "./render-utils.js";

function bucketMessages(messages: AssistantUsageMetric[], bucketCount: number): AssistantUsageMetric[][] {
  if (messages.length <= bucketCount) {
    return messages.map((message) => [message]);
  }

  const buckets: AssistantUsageMetric[][] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const start = Math.floor((i * messages.length) / bucketCount);
    const end = Math.floor(((i + 1) * messages.length) / bucketCount);
    buckets.push(messages.slice(start, Math.max(start + 1, end)));
  }
  return buckets;
}

function averageHitPercent(messages: AssistantUsageMetric[]): number {
  if (messages.length === 0) return 0;
  const total = messages.reduce((sum, message) => sum + message.cacheHitPercent, 0);
  return total / messages.length;
}

function minHitPercent(messages: AssistantUsageMetric[]): number {
  if (messages.length === 0) return 0;
  return Math.min(...messages.map((message) => message.cacheHitPercent));
}

function maxHitPercent(messages: AssistantUsageMetric[]): number {
  if (messages.length === 0) return 0;
  return Math.max(...messages.map((message) => message.cacheHitPercent));
}

export function renderGraphBody(theme: Theme, metrics: CacheSessionMetrics, width: number): string[] {
  const messages = metrics.allMessages;
  const lines: string[] = [];

  lines.push(theme.fg("accent", theme.bold("Cache hit trend (whole session timeline)")));
  lines.push(theme.fg("dim", "Per-turn cache hit % = cacheRead / (input + cacheRead)"));
  lines.push("");
  lines.push(formatTotalsLine("Active branch", metrics.activeBranchTotals));
  lines.push(formatTotalsLine("Whole tree", metrics.treeTotals));
  lines.push("");

  if (messages.length === 0) {
    lines.push(theme.fg("warning", "No assistant messages with usage data are available yet in this session."));
    return lines;
  }

  const latest = messages[messages.length - 1]!;
  lines.push(
    [
      `Latest: ${formatPercent(latest.cacheHitPercent)}`,
      `Min: ${formatPercent(minHitPercent(messages))}`,
      `Max: ${formatPercent(maxHitPercent(messages))}`,
      `Turns: ${formatInt(messages.length)}`,
    ].join(" • "),
  );
  lines.push("");

  const chartHeight = 10;
  const chartWidth = Math.max(10, width - 8);
  const buckets = bucketMessages(messages, chartWidth);
  const values = buckets.map((bucket) => averageHitPercent(bucket));

  for (let row = chartHeight; row >= 1; row -= 1) {
    const threshold = (row / chartHeight) * 100;
    const label = `${String(Math.round(threshold)).padStart(3, " ")}│`;
    const body = values
      .map((value) => (value >= threshold ? theme.fg("accent", "█") : theme.fg("dim", "·")))
      .join("");
    lines.push(theme.fg("muted", label) + body);
  }

  lines.push(theme.fg("muted", `  0│${theme.fg("dim", "─".repeat(values.length))}`));
  lines.push(
    theme.fg("dim", `   ${1}`) +
      (values.length > 2 ? theme.fg("dim", `${" ".repeat(Math.max(1, values.length - String(messages.length).length - 1))}${messages.length}`) : ""),
  );
  lines.push(theme.fg("dim", "   assistant-message sequence in session append order"));
  lines.push("");

  const recentCount = Math.min(8, messages.length);
  const recent = messages.slice(-recentCount);
  lines.push(theme.fg("accent", theme.bold(`Recent ${recentCount} turns`)));
  lines.push(theme.fg("dim", "* = on current active branch"));
  for (const message of recent) {
    const label = `#${String(message.sequence).padStart(2, " ")}${message.isOnActiveBranch ? "*" : " "}`;
    const model = `${message.provider}/${message.model}`;
    lines.push(
      `${theme.fg("muted", label)} ${formatPercent(message.cacheHitPercent).padStart(6, " ")}  ` +
        `in ${formatInt(message.input).padStart(6, " ")}  ` +
        `cache ${formatInt(message.cacheRead).padStart(6, " ")}  ` +
        theme.fg("dim", model),
    );
  }

  return lines;
}
