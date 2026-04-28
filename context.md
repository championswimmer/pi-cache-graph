# Code Context - pi-cache-graph

## Files Retrieved
1. `package.json` - Project metadata and dependencies (pi-ai, pi-coding-agent, pi-tui).
2. `src/index.ts` (lines 1-76) - Main entry point, registers `/cache` command and subcommands (graph, stats, export).
3. `src/types.ts` (lines 1-32) - Core data interfaces for usage metrics and totals.
4. `src/session-data.ts` (lines 1-84) - Logic for calculating cache metrics from the session manager.
5. `src/render-utils.ts` (lines 1-155) - TUI helper functions and `ScrollDialog` component.

## Key Code

### Metric Types (`src/types.ts`)
```typescript
export interface AssistantUsageMetric {
  sequence: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPercent: number;
  isOnActiveBranch: boolean;
}
```

### Data Collection (`src/session-data.ts`)
Calculates cache hit percentages and aggregates totals across the message tree and the active branch.
```typescript
export function collectCacheSessionMetrics(sessionManager: SessionReader): CacheSessionMetrics {
  // Filters SessionEntry for assistant messages and builds AssistantUsageMetric objects
}
```

## Architecture
- **Extension Layer**: `src/index.ts` hooks into the Pi Extension API.
- **Data Layer**: `src/session-data.ts` transforms raw session entries into structured metrics.
- **View Layer**: `src/graph-view.ts`, `src/stats-view.ts`, and `src/export.ts` handle different output formats.
- **TUI Layer**: `src/render-utils.ts` provides a `ScrollDialog` component to handle scrolling, keyboard input, and consistent styling across interactive views.

## Start Here
Look at `src/index.ts` to see how subcommands are routed, then `src/session-data.ts` to understand how the cache statistics are derived from the conversation history.
