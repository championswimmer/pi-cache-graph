# AGENTS.md

This file captures repo-specific working knowledge for coding agents working in `pi-cache-graph`.

## Project purpose

This repo contains a **project-local pi extension** that adds cache inspection commands to pi:

- `/cache graph`
- `/cache stats`
- `/cache export`

The extension reads usage data from the current pi session and:
- renders a TUI graph of cache hit percentage over time
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
- Opens a scrollable overlay dialog
- Graphs cache hit % over assistant messages in **session append order**
- Also shows active-branch totals and whole-tree totals

### `/cache stats`
- Interactive TUI only
- Opens a scrollable overlay dialog
- Shows per-assistant-message rows across the **whole session tree**
- Marks whether each message is on the **current active branch**
- Includes cumulative totals for:
  - active branch
  - whole tree
  - delta (tree - branch)

### `/cache export`
- Writes CSV to the project root (`ctx.cwd`)
- Filename resolution:
  1. current session name, if present
  2. session file basename, if present
  3. fallback: `session.csv`
- CSV is intended to mirror the data model behind `/cache stats` closely enough for Excel-based graphing

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
cacheRead / (input + cacheRead)
```

Behavior:
- if denominator is `0`, cache hit % is `0`

Reason:
- pi normalizes provider usage so `input + cacheRead` is the practical basis for prompt-side cache hit rate in this extension

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
  - opens TUI overlays for graph/stats
  - writes CSV for export

### Session metric extraction
- `src/session-data.ts`
  - central place for building `CacheSessionMetrics`
  - filters to assistant messages only
  - computes per-message metrics and cumulative totals

### Graph rendering
- `src/graph-view.ts`
  - renders cache hit trend text graph
  - uses assistant-message sequence in append order

### Stats rendering
- `src/stats-view.ts`
  - renders the stats dialog body
  - includes summary section and per-message rows

### Shared TUI/render helpers
- `src/render-utils.ts`
  - formatting helpers
  - `ScrollDialog` overlay component
  - totals summarization helpers

### CSV export
- `src/export.ts`
  - filename resolution
  - CSV row shaping
  - CSV escaping
  - file write to project root

### Types
- `src/types.ts`
  - shared interfaces for metrics and totals

## TUI implementation notes

The TUI uses a custom scrollable dialog component:
- `ScrollDialog` in `src/render-utils.ts`

Current patterns:
- graph/stats are rendered as arrays of text lines
- dialogs are shown through `ctx.ui.custom(..., { overlay: true })`
- graph/stats are read-only views

If modifying TUI behavior:
- preserve keyboard navigation if possible
- keep non-interactive behavior graceful
- avoid introducing heavyweight custom components unless necessary

## CSV export notes

The CSV currently contains:
- summary rows
- per-message rows
- columns intended for Excel use

Important:
- message rows and stats dialog should stay conceptually aligned
- if you change the stats data model, update the export format too
- if you change export columns, update `README.md`

## Coding conventions for this repo

- Keep logic split by responsibility; avoid stuffing everything into `src/index.ts`
- Prefer adding shared calculations in `src/session-data.ts` or `src/render-utils.ts`
- Keep types in `src/types.ts` when reused in multiple modules
- Preserve strict TypeScript compatibility
- Run `npm run check` after changes

## When changing metrics

If you change any of the following, update both TUI and CSV paths:
- cache hit % formula
- totals logic
- per-message fields
- branch/tree semantics

Minimum files likely affected:
- `src/session-data.ts`
- `src/graph-view.ts`
- `src/stats-view.ts`
- `src/export.ts`
- `README.md`

## Known assumptions / limitations

- Metrics are based only on assistant messages with usage data
- Graph uses session append order, not branch-only order
- Export writes a single CSV into project root
- There is no automated test suite yet; validation is by typecheck and manual use in pi

## Recommended workflow for agents

1. Read `README.md`
2. Read `src/index.ts` and the specific module you will modify
3. If changing metrics, inspect `src/session-data.ts` first
4. If changing UI, inspect `src/render-utils.ts` plus the relevant view module
5. Run:
   ```bash
   npm run check
   ```
6. Update docs if behavior changed

## Historical note

`context.md` contains older planning/proposal notes and may drift from the implementation.
Treat the actual source files and `README.md` as authoritative over `context.md`.
