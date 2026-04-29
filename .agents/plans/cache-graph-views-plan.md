# Plan: Multi-view `/cache graph`

Add view switching to the existing `/cache graph` command so the same overlay can render the cache trend in three different ways. No new command, no v2 endpoint — only the existing command and its renderer change.

## Goals

- Keep `/cache graph` as the single entrypoint.
- Add a keyboard shortcut to cycle/select between 3 views.
- Views:
  1. **Per-turn (%)** — current behavior. Cache hit % per assistant message.
  2. **Cumulative (%)** — running cache hit % across the session so far.
  3. **Cumulative (total)** — running absolute token volumes, with `1 chart unit = 5,000 tokens`.

## View definitions

All three views iterate assistant messages in **session append order** (same as today, matching `metrics.allMessages`).

### 1. Per-turn (%)
- Y axis: 0–100%
- Per-turn value: `cacheRead / (input + cacheRead + cacheWrite) * 100`
- Same as today (after the cacheWrite-denominator fix).

### 2. Cumulative (%)
- Y axis: 0–100%
- For each turn `i`, compute running totals up to and including `i`:
  - `cumInput += input`
  - `cumCacheRead += cacheRead`
  - `cumCacheWrite += cacheWrite`
- Per-turn value: `cumCacheRead / (cumInput + cumCacheRead + cumCacheWrite) * 100`
- Interpretation: of all prompt-side tokens seen so far, how much was served from cache.
- Uses the same denominator as the per-turn formula so the two % views stay consistent.

### 3. Cumulative (total)
- Y axis: token counts, scaled so that `1 vertical unit = 5,000 tokens`.
- Plot 3 cumulative series per turn:
  - cumulative `input` (uncached prompt tokens)
  - cumulative `cacheRead` (prompt tokens served from cache)
  - cumulative `cacheWrite` (tokens written to cache)
- Scale:
  - `chartHeight` rows (currently 10) represent `chartHeight * 5_000` tokens at the top.
  - If max series value exceeds that, dynamically grow the unit size to the next multiple of 5k that fits, but default unit stays 5k.
  - Show the active "tokens per row" in the legend so users know the scale.
- Rendering: 3 overlaid series using distinct glyphs/colors. Suggested:
  - `input`        → `▇` accent
  - `cacheRead`    → `▒` success/info
  - `cacheWrite`   → `░` warning
  - When multiple series occupy the same cell, the highest-priority one wins (input < cacheWrite < cacheRead), and the legend documents the precedence.

## Keyboard shortcut

In the graph dialog only:

- `v` — cycle view forward: per-turn → cumulative% → cumulative-total → per-turn …
- `V` (Shift+v) — cycle view backward
- `1` / `2` / `3` — jump directly to that view
- All existing scroll keys (`↑/↓`, PgUp/PgDn, Home/End, `q`/Esc) continue to work.
- Help text in the dialog footer should be extended:
  - `1/2/3 view • v cycle • ↑/↓ scroll • PgUp/PgDn • q/Esc close`

The stats dialog is unaffected.

## Implementation outline

### New: `src/graph-view.ts`
- Define a `GraphView` type:
  ```ts
  export type GraphView = "per-turn" | "cumulative-percent" | "cumulative-total";
  ```
- Replace `renderGraphBody(theme, metrics, width)` with `renderGraphBody(theme, metrics, width, view)`.
- Extract three pure renderers:
  - `renderPerTurnPercent(...)` (existing logic, refactored)
  - `renderCumulativePercent(...)`
  - `renderCumulativeTotal(...)`
- Shared helpers:
  - `bucketMessages` stays.
  - Add `bucketAggregate<T>(values, chartWidth, reducer)` so cumulative-total can pick max within a bucket instead of averaging.
  - Add `renderBarChart({ values, height, max, glyph, theme })` for single-series % charts.
  - Add `renderStackedSeriesChart({ series: [{values, glyph, color}], height, max })` for cumulative-total.
- Keep the "Recent N turns" footer block. Its columns can vary per view:
  - per-turn (%): same as today
  - cumulative (%): show `cumHit%`, cumulative `input`, cumulative `cacheRead`
  - cumulative (total): show cumulative `input`, `cacheRead`, `cacheWrite`

### New: cumulative series helper in `src/session-data.ts` (or a new `src/cumulative.ts`)
- `computeCumulativeSeries(messages: AssistantUsageMetric[]): CumulativeSeries`
  - Returns parallel arrays: `cumInput[]`, `cumCacheRead[]`, `cumCacheWrite[]`, `cumHitPercent[]`.
- Pure function, no theme/UI dependency. Reused by future CSV-export enhancements if desired.

### Update: `src/render-utils.ts`
- `ScrollDialog` currently swallows all keys except scroll/close. Extend it to support optional extra key handlers without breaking existing usage:
  - Add `onKey?: (data: string) => boolean` to `ScrollDialogOptions`. If it returns `true`, dialog treats key as handled and re-renders; falls through to default scroll handling otherwise.
  - Keep default `helpText` but allow caller to override (already supported).
- Cache invalidation must trigger when the parent changes the active view (see below).

### Update: `src/index.ts`
- The `cache` command's `graph` branch:
  - Maintain a local `currentView: GraphView` (default `"per-turn"`).
  - Construct `ScrollDialog` with:
    - `title` that reflects the current view, e.g. `Context Cache Graph — per-turn (%)`.
    - `helpText` extended with view shortcuts.
    - `renderBody(innerWidth)` calls `renderGraphBody(theme, metrics, innerWidth, currentView)`.
    - `onKey(data)`:
      - `1` → set `per-turn`
      - `2` → set `cumulative-percent`
      - `3` → set `cumulative-total`
      - `v` → cycle forward
      - `V` → cycle backward
      - On change: update title, invalidate dialog, return `true`.
- The `stats` branch is unchanged.

### Title handling
- `ScrollDialog` currently takes a fixed `title` string. Add support for either:
  - a `getTitle: () => string` option, OR
  - a `setTitle(title: string)` method on the dialog instance.
- Use whichever fits the existing `Component` lifecycle with the least churn — preferred: `getTitle?: () => string` resolved at render time, fallback to `title`.

## Edge cases

- 0 assistant messages: each view shows the existing "No assistant messages…" warning. View switching still works but renders the same empty state.
- All-zero `input + cacheRead`: cumulative (%) returns 0% for every turn. Document this in the body subtitle.
- Very long sessions: bucketing (existing logic) keeps chart width bounded. For cumulative-total, bucket reducer should be `max` (cumulative is monotonic non-decreasing, so max == last sample in bucket — keeps the line accurate).
- Dynamic scale in cumulative-total:
  - `unitTokens = 5000` by default.
  - If `maxSeriesValue > chartHeight * unitTokens`, set `unitTokens = ceil(maxSeriesValue / chartHeight / 5000) * 5000`.
  - Always render `unitTokens` in the legend, e.g. `1 row = 5,000 tokens`.

## Acceptance criteria

- `/cache graph` opens with per-turn (%) view (current default).
- Pressing `2` switches to cumulative (%); `3` to cumulative (total); `1` back to per-turn (%).
- `v` / `V` cycle through the three views.
- Title and footer help text update with the active view.
- Cumulative-total chart legend states "1 row = 5,000 tokens" (or scaled value when auto-scaled).
- `npm run check` passes.
- `/cache stats` and `/cache export` are unchanged.

## Out of scope

- No changes to `/cache export` CSV format in this plan. (If we want cumulative columns in CSV later, that is a follow-up.)
- No new command, no v2 alias.
- No persistence of the last-used view across invocations.

## Files likely to change

- `src/index.ts` — wire view state and key handling.
- `src/graph-view.ts` — three view renderers, view type.
- `src/render-utils.ts` — `ScrollDialog` extensions (`onKey`, dynamic title).
- `src/session-data.ts` (or new `src/cumulative.ts`) — cumulative series helper.
- `README.md` — document the three views and shortcuts.

## Suggested implementation order

1. Add `computeCumulativeSeries` + unit-free helpers in session/cumulative module.
2. Refactor `renderGraphBody` to dispatch on `GraphView`, port existing renderer as `per-turn`.
3. Implement `cumulative-percent` renderer (mostly reuses the per-turn bar chart helper).
4. Implement `cumulative-total` renderer with multi-series chart + auto scale.
5. Extend `ScrollDialog` with `onKey` and dynamic title.
6. Wire view state + shortcuts in `src/index.ts`.
7. Update `README.md`.
8. `npm run check`.
