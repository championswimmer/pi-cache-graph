# AGENTS.md

This file captures repo-specific working knowledge for coding agents working in `pi-cache-graph`.

## Project purpose

This repo contains a **project-local pi extension** (also published to npm as `pi-cache-graph`) that adds cache inspection commands to pi:

- `/cache graph`
- `/cache stats`
- `/cache export`

The extension reads usage data from the current pi session and:
- renders a multi-view TUI graph of cache hit percentage over time
- renders a TUI stats dialog with per-message and cumulative token/cache data
- exports the same stats-oriented data to CSV for Excel/charting

## How the extension is loaded

Pi loads the extension via `package.json`:

- `pi.extensions = ["./index.ts"]`

Entrypoint chain:
- `index.ts` → re-exports `src/index.ts`
- `src/index.ts` → registers the `/cache` command and dispatches subcommands

## Dev commands

Install deps:

```bash
npm install
```

Typecheck:

```bash
npm run check
```

Run locally in pi:

```bash
pi -e .
```

## Current command behavior

### `/cache graph`
- Interactive TUI only
- Opens a scrollable overlay dialog with **three switchable views**:

| Key | View | Description |
|-----|------|-------------|
| `1` | Per-turn (%) | Cache hit % per individual turn (default) |
| `2` | Cumulative (%) | Running aggregate cache hit % across all turns |
| `3` | Cumulative (total) | Running cumulative token volumes (input / cacheWrite / cacheRead) |

- **Keyboard shortcuts inside the dialog:**
  - `1` / `2` / `3` — jump directly to that view
  - `v` — cycle view forward
  - `V` (Shift+v) — cycle view backward
  - `↑/↓`, `PgUp/PgDn`, `Home/End` — scroll
  - `q` / `Esc` — close

- All views show:
  - Active-branch totals and whole-tree totals at the top
  - A bar/stacked chart of ~10 rows height, bucketed to fit the terminal width
  - "Recent N turns" detail table below the chart

- The cumulative-total view uses distinct Unicode glyphs per series:
  - `▇` input (uncached), `░` cacheWrite, `▒` cacheRead (hit)
  - Dynamic scale: 1 row = `unitTokens` tokens (auto-scaled, minimum 5 000)
  - Legend displayed below the chart

### `/cache stats`
- Interactive TUI only
- Opens a scrollable overlay dialog
- Shows per-assistant-message rows across the **whole session tree**
- Marks whether each message is on the **current active branch** (column `B`)
- Adaptive columns: `entry_id` shown at ≥ 92 cols, `time` shown at ≥ 104 cols
- Includes cumulative totals for:
  - active branch
  - whole tree
  - delta (tree - branch), including hit-rate spread

### `/cache export`
- Writes CSV to the project root (`ctx.cwd`)
- Filename resolution:
  1. current session name, if present (sanitized)
  2. session file basename, if present (sanitized)
  3. fallback: `session.csv`
- CSV mirrors the data model behind `/cache stats` with extra columns for Excel use

## Core data model

All metrics are derived from **assistant messages with usage data**.

Relevant usage fields on assistant messages:
- `usage.input`
- `usage.output`
- `usage.cacheRead`
- `usage.cacheWrite`
- `usage.totalTokens`

The extension does **not** currently compute stats from user/tool/custom messages.

## Important metric definition

Cache hit % is defined as:

```text
cacheRead / (input + cacheRead + cacheWrite)
```

Behavior:
- if denominator is `0`, cache hit % is `0`

Reason:
- the denominator must equal the full prompt size that was sent on the turn
- Anthropic-style providers report `input` as only the fresh non-cached portion and report newly-cached prompt tokens separately as `cacheWrite`; both must be included in the denominator alongside `cacheRead`
- OpenAI-style providers report `cacheWrite = 0` (the freshly cached tokens are already counted inside `input`), so this formula is backwards-compatible there

The canonical implementation lives in `src/cache-math.ts` (`computeCacheHitPercent`).

## Session/tree semantics

Understand the distinction between these two scopes:

### Whole tree
Based on:
- `ctx.sessionManager.getEntries()`

Used for:
- `/cache stats` per-message rows
- whole-tree cumulative totals
- `/cache graph` session timeline
- CSV message rows

### Active branch
Based on:
- `ctx.sessionManager.getBranch()`

Used for:
- active-branch membership flag on rows
- active-branch cumulative totals
- active-branch sequence numbering

## Source file map

### Command wiring
- `src/index.ts`
  - parses `/cache <subcommand>`
  - validates `graph | stats | export`
  - opens TUI overlays for graph/stats (via `ScrollDialog`)
  - handles graph view-cycling (`v`, `V`, `1`, `2`, `3`)
  - writes CSV for export

### Session metric extraction
- `src/session-data.ts`
  - central place for building `CacheSessionMetrics`
  - filters to assistant messages only
  - computes per-message metrics and cumulative totals
  - type alias `SessionReader` for the subset of `SessionManager` it needs

### Cache math
- `src/cache-math.ts`
  - `computeCacheHitPercent(input, cacheRead, cacheWrite)` — canonical formula
  - `emptyTotals()` — returns a zeroed `CacheUsageTotals`
  - `addToTotals(totals, message)` — accumulates a message into a totals object

### Cumulative series computation
- `src/cumulative.ts`
  - `computeCumulativeSeries(messages)` — pure function, no UI dependency
  - returns `CumulativeSeries`: `{ cumInput, cumCacheRead, cumCacheWrite, cumHitPercent }`
  - used by both graph views 2 and 3
  - safe to reuse in future CSV export of cumulative columns

### Graph rendering
- `src/graph-view.ts`
  - exports `GraphView` type and `GRAPH_VIEWS` array
  - `graphViewLabel(view)` — human-readable label for each view
  - `bucketMessages` / `bucketMax` — data bucketing for chart width adaptation
  - `renderBarChart` — single-series 0–100% bar chart (label col 5 chars wide)
  - `renderStackedSeriesChart` — 3-series token volume chart (returns `unitTokens` for legend)
  - `renderGraphBody(theme, metrics, width, view)` — public entry point, dispatches to per-view renderers

### Stats rendering
- `src/stats-view.ts`
  - `renderStatsBody(theme, metrics, width)` — public entry point
  - `buildRow` / `buildHeader` — adaptive column layout based on available width
  - `buildCumulativeSummary` — active-branch / whole-tree / delta summary block

### Scrollable TUI dialog component
- `src/scroll-dialog.ts`
  - `ScrollDialog` class implementing `Component` from `@mariozechner/pi-tui`
  - render-caches by width; `invalidate()` clears cache to force re-render
  - `onKey` callback allows callers to handle keys before default scroll/close handling
  - `getTitle` callback allows dynamic titles (used by graph for view name)
  - scroll offset is clamped on each render call

### Shared formatting helpers
- `src/format-utils.ts`
  - `formatInt(value)` — locale-formatted integer
  - `formatPercent(value)` — fixed-1 decimal percentage string
  - `shortModelName(provider, model)` — `provider/model`
  - `summarizeHitPercent(totals)` — calls `computeCacheHitPercent` on a `CacheUsageTotals`
  - `formatTotalsLine(label, totals)` — one-line summary string used by graph header and stats

### Backward-compat re-export barrel
- `src/render-utils.ts`
  - re-exports everything from `format-utils.ts` and `scroll-dialog.ts`
  - kept for backward compatibility; prefer importing directly from the source modules

### CSV export
- `src/export.ts`
  - `sanitizeFileName(name)` — strips unsafe chars for use in filenames
  - `resolveSessionBaseName(sessionManager)` — session name → file basename resolution
  - `buildCsv(metrics)` — assembles summary rows + message rows into CSV string
  - `exportStatsCsv(cwd, sessionManager, metrics)` — resolves filename, writes file, returns path
  - CSV columns defined in the `headers` const array (24 columns)

### Types
- `src/types.ts`
  - `CacheUsageTotals` — aggregated totals bag
  - `AssistantUsageMetric` — per-message metrics including `isOnActiveBranch` and `activeBranchSequence`
  - `CacheSessionMetrics` — top-level container: `allMessages`, `activeBranchMessages`, `treeTotals`, `activeBranchTotals`

## TUI implementation notes

The TUI uses `ScrollDialog` from `src/scroll-dialog.ts`:
- Implements `Component` from `@mariozechner/pi-tui`
- Renders into `ctx.ui.custom(..., { overlay: true })`
- Render-caches lines by width; invalidated on key press
- Default body height: clamped between 10 and 28 rows based on terminal height
- `onKey` hook returns `true` to consume a key and trigger re-render, `false` to fall through

Graph views are purely rendered as arrays of text lines:
- `renderGraphBody` produces the full line array
- `ScrollDialog` slices and paginates it

If modifying TUI behavior:
- preserve keyboard navigation if possible
- keep non-interactive behavior graceful
- `invalidate()` must be called after any state mutation in `onKey`
- avoid introducing heavyweight custom components unless necessary

## CSV export notes

The CSV currently contains:
- 3 summary rows (active_branch, whole_tree, delta_tree_minus_branch)
- one row per assistant message across the whole session tree
- 24 columns (see `headers` in `src/export.ts`)

Important:
- message rows and stats dialog should stay conceptually aligned
- if you change the stats data model, update the export format too
- if you change export columns, update `README.md`

## Coding conventions for this repo

- Keep logic split by responsibility; avoid stuffing everything into `src/index.ts`
- Pure math → `src/cache-math.ts`
- Pure data series computation → `src/cumulative.ts`
- Formatting helpers → `src/format-utils.ts`
- Session traversal → `src/session-data.ts`
- Shared types → `src/types.ts`
- Preserve strict TypeScript compatibility
- Run `npm run check` after changes

## When changing metrics

If you change any of the following, update both TUI and CSV paths:
- cache hit % formula
- totals logic
- per-message fields
- branch/tree semantics

Minimum files likely affected:
- `src/cache-math.ts`
- `src/session-data.ts`
- `src/cumulative.ts` (if cumulative series change)
- `src/graph-view.ts`
- `src/stats-view.ts`
- `src/export.ts`
- `README.md`

## Known assumptions / limitations

- Metrics are based only on assistant messages with usage data
- Graph uses session append order (whole tree), not branch-only order
- Export writes a single CSV into project root
- There is no automated test suite yet; validation is by typecheck and manual use in pi
- `src/render-utils.ts` is a legacy re-export barrel; prefer importing from source modules

## Recommended workflow for agents

1. Read `README.md`
2. Read `src/index.ts` and the specific module you will modify
3. If changing metrics, inspect `src/cache-math.ts` and `src/session-data.ts` first
4. If changing cumulative series, inspect `src/cumulative.ts`
5. If changing UI, inspect `src/scroll-dialog.ts` plus the relevant view module
6. Run:
   ```bash
   npm run check
   ```
7. Update docs if behavior changed

## Historical note

`context.md` contains older planning/proposal notes and may drift from the implementation.
Treat the actual source files and `README.md` as authoritative over `context.md`.
