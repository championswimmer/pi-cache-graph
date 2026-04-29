# Cache Graph Extension Plan

Date: 2026-04-29
Project: `pi-cache-graph`

## Goal
Build a project-local pi extension npm package that adds:

- `/cache graph`
- `/cache stats`

Where:
- `graph` shows a TUI graph of context cache hit percentage over time for assistant messages in the current session
- `stats` shows per-message and cumulative token/cache totals across the current session tree in a TUI dialog table

## Constraints and API Notes
- Pi extensions are TypeScript modules loaded via the `pi.extensions` field in `package.json`
- Commands are registered with `pi.registerCommand(name, { handler })`; subcommands will be parsed from the command args string
- Session data is available through `ctx.sessionManager`
- Assistant token usage is stored on assistant messages as:
  - `usage.input`
  - `usage.output`
  - `usage.cacheRead`
  - `usage.cacheWrite`
  - `usage.totalTokens`
- The full tree is available via `ctx.sessionManager.getTree()` and the active branch via `ctx.sessionManager.getBranch()`
- For TUI, `ctx.ui.custom(..., { overlay: true })` is the cleanest way to open graph/stats dialogs

## Interpretation of “cache hit %”
Use a stable, provider-agnostic metric per assistant message:

- `cacheHitPercent = cacheRead / (input + cacheRead) * 100`

Rationale:
- Pi normalizes OpenAI cached tokens by subtracting them from `usage.input` and placing them into `usage.cacheRead`
- This makes `input + cacheRead` a reasonable approximation of total prompt tokens presented to the provider for that turn
- If denominator is `0`, treat cache hit % as `0`

## Implementation Strategy

### Phase 1 — Package scaffolding
1. Initialize npm package in current folder
2. Add TypeScript config
3. Create extension entrypoint and `src/` module structure

### Phase 2 — Core data model
1. Build session traversal helpers for:
   - all assistant messages in the full session tree
   - assistant messages on the active branch
2. Compute per-message metrics:
   - provider/model
   - timestamp / sequence number
   - branch depth/path context if needed
   - sent/input, received/output, cache read, cache write, total tokens
   - per-message cache hit %
3. Compute cumulative totals for:
   - active branch
   - entire tree

### Phase 3 — TUI rendering
1. Create a reusable overlay dialog frame component
2. Implement graph renderer:
   - compact ASCII/Unicode chart
   - x-axis = assistant-message sequence
   - y-axis = cache hit % buckets
   - include summary/footer legends
3. Implement stats table renderer:
   - per-message rows
   - cumulative summary section
   - readable numeric formatting
   - scroll if needed

### Phase 4 — Command wiring
1. Register `/cache`
2. Parse args:
   - `/cache graph`
   - `/cache stats`
   - fallback: usage/help overlay or notification
3. Open corresponding TUI overlay dialog

### Phase 5 — Quality / validation
1. Run `tsc --noEmit`
2. Sanity-check imports and runtime assumptions
3. Add README usage notes for local loading (`pi -e .` or install as local package)

## Parallelizable Work Breakdown
These are the parallel tracks I’m using:

### Track A — API/data research
- Confirm session entry shapes and usage fields
- Confirm tree vs branch traversal strategy
- Confirm cache hit % formula assumptions

### Track B — TUI approach research
- Reuse pi custom overlay patterns
- Design lightweight dialog shell and renderer structure
- Choose components/utilities from `@mariozechner/pi-tui`

### Track C — Scaffold/package structure
- Set up `package.json`
- Create `index.ts`, `src/` modules, and `tsconfig.json`
- Prepare scripts for local testing/type-checking

## Planned File Layout
- `package.json`
- `tsconfig.json`
- `index.ts`
- `src/types.ts`
- `src/session-data.ts`
- `src/render-utils.ts`
- `src/graph-view.ts`
- `src/stats-view.ts`
- `src/index.ts`
- `README.md`

## Expected UX
- `/cache graph`
  - opens overlay dialog
  - shows cache hit % trend across assistant messages
  - includes totals/legend for current branch and whole tree
- `/cache stats`
  - opens overlay dialog
  - shows per-message token breakdown table
  - includes branch totals and whole-tree totals

## First Implementation Slice
1. Get package structure compiling
2. Build data extraction from `SessionManager`
3. Implement simple graph/table overlays
4. Refine formatting and summaries
