# Feature Investigation: pi-cache-graph Future Directions

**Date:** 2026-04-30  
**Status:** Draft — research notes for future feature work  
**Scope:** This document captures investigated feature ideas for the `pi-cache-graph` extension. Each section describes a candidate feature, the research findings, and an assessment of feasibility.

---

## 1. Real-Time Cost Estimation per Turn

### Idea
Show estimated USD cost alongside cache metrics — both per-turn and cumulative. This would make it immediately obvious how much a session has cost vs. how much was saved by caching.

### Research Findings
Anthropic and OpenAI publish pricing tables that map (provider, model, token-type) → price-per-million-tokens. For example:
- Anthropic Claude 3.5 Sonnet: input $3/MTok, cache write $3.75/MTok, cache read $0.30/MTok, output $15/MTok
- Cache reads are 10× cheaper than fresh input, giving up to 90% cost reduction on the cached portion

Several OSS tools already do this (`tokentop`, `ccusage`, `openusage`) — they maintain a static pricing table keyed by model name and multiply it against the usage counters.

### Implementation sketch
- Add a `pricing-table.ts` that maps `provider/model` → per-token prices (cached separately per token type)
- Extend `AssistantUsageMetric` with optional `estimatedCostUsd` field
- Extend `CacheUsageTotals` with `estimatedCostUsd` and `estimatedSavedUsd` (delta vs. no-cache scenario)
- Render cost columns in `/cache stats` and `/cache export`
- Add a 4th graph view for cumulative cost (USD over turns)

### Feasibility
**Medium** — pricing tables go stale as models update pricing. Options:
1. Static bundled table (easy, needs manual updates)
2. Fetch from a community-maintained JSON (e.g. `llm-pricing` npm package or tokencost)
3. Allow user override via pi config/settings

### Risk
Model names in usage data may not always exactly match the pricing table keys (e.g. `claude-3-5-sonnet-20241022` vs `claude-3-5-sonnet`). Fuzzy matching or a normalization layer would be needed.

---

## 2. Cache Efficiency Alerts / Warnings

### Idea
Surface a visible warning when cache hit rate drops significantly mid-session, indicating the cache was probably invalidated (e.g. by a system prompt change, tool list change, or context prune that didn't preserve cache checkpoints).

### Research Findings
Claude's prompt caching invalidates whenever any cached prefix is modified — changing a timestamp, tool definition, or system prompt resets the cache. `pi-context-prune` (the companion extension this tool was built to monitor) compacts the context, which can temporarily reset cache hit rate before it rebuilds. Detecting these "cache reset events" is a valuable diagnostic.

A cache reset manifests as: a turn with high `cacheWrite` and low `cacheRead` (or zero) immediately following turns with high `cacheRead`.

### Implementation sketch
- Define a "cache reset detection" heuristic in `src/cache-math.ts`:
  - A turn is a "reset candidate" if: `cacheRead < threshold` AND `cacheWrite > threshold` AND the previous turn's `cacheRead` was above that threshold
- Mark reset-candidate turns with a flag in `AssistantUsageMetric`
- In the graph view, render a distinctive marker on the x-axis at reset positions (e.g. `▼` or `!`)
- In stats view, highlight reset-candidate rows (e.g. with a warning color or `!` marker in the `B` column area)
- Optionally: emit a `ctx.ui.notify(...)` toast when a reset is detected in the current turn (would require a lifecycle hook)

### Feasibility
**High** — purely derived from existing data, no new API surface needed. The detection heuristic may need tuning.

---

## 3. Per-Model Breakdown View

### Idea
When a session uses multiple models (e.g. switching between claude-3-5-sonnet and claude-3-haiku during a session), show stats broken down by model rather than just aggregated.

### Research Findings
The `AssistantUsageMetric` type already captures `provider` and `model` per message. The `stats-view.ts` renders model name per row. What's missing is a grouped/pivot view.

### Implementation sketch
- Add `src/model-breakdown.ts` with a `groupByModel(messages)` function that returns `Map<string, AssistantUsageMetric[]>`
- Add a 4th graph view (`model-breakdown`) or a separate `/cache models` subcommand
- Render a mini bar chart per model showing relative prompt volume and hit rate
- Include per-model subtotals in CSV export (new `row_type: "model_summary"` rows)

### Feasibility
**High** — data is already available, just needs a new grouping/rendering path.

---

## 4. Session Comparison / History View

### Idea
Allow comparing cache stats across multiple saved sessions — e.g. "how does cache efficiency in session A compare to session B?"

### Research Findings
`pi-context-prune` and pi itself save sessions as JSONL files. The `SessionManager` API (via `getSessionFile`, `getSessionName`) gives access to the current session. But loading and parsing other session files would require direct JSONL reading outside the `SessionManager` interface.

Tools like `ccusage` (a CLI for Claude Code) do this by scanning a directory of JSONL session logs and computing aggregated stats across all of them.

### Implementation sketch
- `/cache export` already writes a CSV per session — a comparison could work at the CSV level (Excel/Python)
- For in-TUI comparison: add `/cache history` that scans a configurable sessions directory, parses the JSONL, extracts assistant messages, and renders a summary table (one row per session)
- Columns: session name, date, turns, avg hit %, total tokens, estimated cost
- Requires: a lightweight JSONL parser and knowledge of pi's session file schema

### Feasibility
**Medium** — depends on pi's JSONL schema being stable and accessible. The `SessionManager` may not expose a "list all sessions" API; direct filesystem access may be needed.

---

## 5. Inline Sparklines in `/cache stats` Table

### Idea
Add a mini sparkline column to the stats table showing the per-turn cache hit % trend for recent turns of a given model or the overall session — similar to `htop`'s CPU history bars.

### Research Findings
Unicode block characters (`▁▂▃▄▅▆▇█`) make compact 8-level sparklines entirely in plain text. Node.js libraries like `@tuicomponents/sparkline` wrap this, but the implementation is trivial:

```ts
function sparkline(values: number[], min = 0, max = 100): string {
  const blocks = "▁▂▃▄▅▆▇█";
  return values.map(v => {
    const idx = Math.round(((v - min) / (max - min)) * 7);
    return blocks[Math.max(0, Math.min(7, idx))];
  }).join("");
}
```

A sparkline of the last 20 turns takes only 20 columns.

### Implementation sketch
- Add `sparkline(values, min, max)` to `src/format-utils.ts`
- In the cumulative summary section of `stats-view.ts`, render a sparkline of the last N `cacheHitPercent` values on the active branch
- Optionally add a sparkline column to each row (showing e.g. last-5-turns context for that point in the timeline)

### Feasibility
**Very High** — trivial to implement with a small helper, no dependencies needed.

---

## 6. Live / Auto-Refresh Mode

### Idea
The graph/stats views currently show a snapshot at the moment `/cache graph` is opened. A "live" mode would auto-refresh every N seconds (or on each new assistant message) so you can keep the overlay open and watch cache efficiency evolve in real time.

### Research Findings
Pi's extension API exposes lifecycle hooks including post-LLM-call events. If an extension can subscribe to a "new assistant message" event, it could trigger `invalidate()` on the open `ScrollDialog`. Without a hook, polling via `setInterval` would work as a fallback.

Looking at pi's extension docs (`packages/coding-agent/docs/extensions.md`), extensions can register `onAssistantMessage` or similar hooks — confirming that reactive refresh is architecturally possible.

### Implementation sketch
- In the graph/stats `ctx.ui.custom` block, set up a subscription or interval that calls `invalidate()` on the `ScrollDialog` instance
- Pass the subscription teardown to the dialog's `onClose` callback to avoid memory leaks
- Add a `[LIVE]` indicator in the dialog title when live mode is active
- Allow toggling with `r` (refresh) or `l` (live mode on/off)

### Feasibility
**Medium** — depends on whether pi's TUI allows `invalidate()` to trigger a redraw from outside the `handleInput` path. Needs a spike to verify the rendering model.

---

## 7. `/cache budget` — Token Budget Enforcement

### Idea
Allow the user to set a per-session token budget (or cost budget). The extension would warn (or notify) when cumulative usage crosses a threshold.

### Research Findings
Tools like `ManasVardhan/llm-cost-guardian` and Dakora.io do this at the API proxy level. For a pi extension, a simpler approach would be a configuration file (e.g. `.pi/cache-budget.json`) storing thresholds, and a lifecycle hook that checks the running total after each turn.

### Implementation sketch
- Add a `/cache budget set <tokens|cost>` subcommand to write a threshold config
- Add a `/cache budget status` subcommand to show current usage vs budget
- In the lifecycle hook (post-assistant-message), compare running totals to the threshold and fire `ctx.ui.notify(...)` if exceeded
- Threshold config stored in `.pi/cache-budget.json` in the project root

### Feasibility
**Medium** — requires lifecycle hook integration and a small config file schema. Cost budget requires the pricing table from Feature #1.

---

## 8. Export Enhancements: JSON + Markdown

### Idea
Add `/cache export json` and `/cache export md` alternatives to the current CSV export, for use in scripts or piping into documentation.

### Research Findings
The current `buildCsv` in `src/export.ts` already computes a clean `CsvRow[]` array. Adding JSON and Markdown renderers would be straightforward:
- JSON: `JSON.stringify(rows, null, 2)`
- Markdown: a simple table renderer using `|` separators

### Implementation sketch
- Extend `/cache export` to accept a format argument: `/cache export [csv|json|md]`
- Add `buildJson(metrics)` and `buildMarkdown(metrics)` alongside `buildCsv` in `export.ts`
- Filename extensions change accordingly (`.csv`, `.json`, `.md`)
- Update `getArgumentCompletions` in `src/index.ts` to offer format completions

### Feasibility
**Very High** — pure implementation work on top of the existing data model, no new API surface needed.

---

## 9. Context Composition Breakdown

### Idea
Show what fraction of the prompt comes from different "layers" — system prompt, tools, conversation history, and fresh user message — and how caching maps onto those layers.

### Research Findings
Anthropic's `cache_control` system works at the content-block level. When a pi session context is structured, the system prompt and tool definitions are typically at the top (and likely cached), while the fresh user message is at the bottom (not cached). `cacheWrite` represents newly-promoted blocks; `cacheRead` represents already-cached blocks. The `input` field is what was sent fresh.

Tools like `larsderidder/context-lens` and `JSLEEKR/ctxlens` do this decomposition by parsing the raw request payload. In pi's case, the raw request is not directly exposed to extensions — only the usage counters are available after the fact.

However, a heuristic breakdown is still possible:
- `cacheRead` ≈ stable context (system prompt + tools + prior conversation)
- `cacheWrite` ≈ newly expanded context (the portion that just crossed a new cache checkpoint)  
- `input` ≈ fresh additions (latest user message + any uncached new content)

### Implementation sketch
- Add a "context composition" section to `/cache stats` showing the above heuristic breakdown as a stacked percentage bar per turn
- Would be a new section in `stats-view.ts` below the cumulative totals

### Feasibility
**Medium** — the heuristic is approximate (the actual layer boundaries depend on how the provider structured the request) but still directionally useful.

---

## Summary Table

| # | Feature | Feasibility | Effort | Value |
|---|---------|-------------|--------|-------|
| 1 | Cost estimation per turn | Medium | Medium | High |
| 2 | Cache reset detection / alerts | High | Low | High |
| 3 | Per-model breakdown view | High | Low | Medium |
| 4 | Session comparison / history | Medium | High | Medium |
| 5 | Inline sparklines in stats table | Very High | Very Low | Medium |
| 6 | Live / auto-refresh mode | Medium | Medium | High |
| 7 | `/cache budget` enforcement | Medium | Medium | Medium |
| 8 | JSON + Markdown export formats | Very High | Very Low | Medium |
| 9 | Context composition breakdown | Medium | Medium | Medium |

### Recommended priority order
1. **#5 Sparklines** — trivial, purely additive, immediately visual improvement
2. **#2 Cache reset detection** — high value for `pi-context-prune` users, low effort
3. **#8 JSON/MD export** — opens scripting/automation use cases, very low effort
4. **#3 Per-model breakdown** — useful in multi-model sessions, self-contained new view
5. **#1 Cost estimation** — high value but needs a maintained pricing table
6. **#6 Live refresh** — high value but needs a spike on pi's TUI invalidation model
7. **#7 Budget enforcement** — nice UX but depends on #1 for cost budgets
8. **#9 Context composition** — approximate heuristic, lower signal fidelity
9. **#4 Session history** — most complex; depends on pi JSONL schema stability
