# Plan: Extract `computeCacheHitPercent` into `src/cache-math.ts`

## Goal

The cache-hit-percent formula is currently **duplicated** across two files:

| File | Location | Formula |
|---|---|---|
| `src/session-data.ts` | `computeCacheHitPercent()` (private) | `cacheRead / (input + cacheRead + cacheWrite)` |
| `src/format-utils.ts` | `summarizeHitPercent()` (exported) | same, applied to a `CacheUsageTotals` object |

Create a single `src/cache-math.ts` module as the canonical home for all
**pure arithmetic on cache usage numbers**. Then update every consumer.

> ⚠️ This plan must run **after** `01-split-render-utils.md` is complete,
> because it patches `src/format-utils.ts` (which is created by that plan).

---

## Steps

### Step 1 — Create `src/cache-math.ts`

New file. It owns:

- `computeCacheHitPercent(input, cacheRead, cacheWrite)` — moved from
  `session-data.ts` (was private)
- `emptyTotals()` — moved from `session-data.ts` (was private)
- `addToTotals(totals, message)` — moved from `session-data.ts` (was private)

```ts
import type { AssistantUsageMetric, CacheUsageTotals } from "./types.js";

/**
 * Canonical cache-hit % formula.
 *
 * Denominator = full prompt size sent on the turn.
 * Anthropic-style: input excludes newly-cached tokens, which arrive in
 * cacheWrite — so both must be included.
 * OpenAI-style: cacheWrite is 0, so this is backwards-compatible.
 */
export function computeCacheHitPercent(input: number, cacheRead: number, cacheWrite: number): number {
  const denominator = input + cacheRead + cacheWrite;
  if (denominator <= 0) return 0;
  return (cacheRead / denominator) * 100;
}

export function emptyTotals(): CacheUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    assistantMessages: 0,
  };
}

export function addToTotals(totals: CacheUsageTotals, message: AssistantUsageMetric): void {
  totals.input += message.input;
  totals.output += message.output;
  totals.cacheRead += message.cacheRead;
  totals.cacheWrite += message.cacheWrite;
  totals.totalTokens += message.totalTokens;
  totals.assistantMessages += 1;
}
```

---

### Step 2 — Slim down `src/session-data.ts`

Remove the three functions that moved to `cache-math.ts`:
- `computeCacheHitPercent`
- `emptyTotals`
- `addToTotals`

Add the import:
```ts
import { addToTotals, computeCacheHitPercent, emptyTotals } from "./cache-math.js";
```

The rest of the file (`isAssistantMessageEntry`, `collectCacheSessionMetrics`) stays
unchanged. The `SessionReader` type alias stays in this file.

---

### Step 3 — Update `src/format-utils.ts`

`summarizeHitPercent` currently re-implements the formula inline. Replace it with a
call to `computeCacheHitPercent`:

Before:
```ts
export function summarizeHitPercent(totals: CacheUsageTotals): number {
  const denominator = totals.input + totals.cacheRead + totals.cacheWrite;
  if (denominator <= 0) return 0;
  return (totals.cacheRead / denominator) * 100;
}
```

After:
```ts
import { computeCacheHitPercent } from "./cache-math.js";

// ...existing imports...

export function summarizeHitPercent(totals: CacheUsageTotals): number {
  return computeCacheHitPercent(totals.input, totals.cacheRead, totals.cacheWrite);
}
```

Add the `cache-math` import at the top of `format-utils.ts`.

---

### Step 4 — Verify

```bash
npm run check
```

All type errors must be resolved before done.

---

## Expected outcome

| File | Change |
|---|---|
| `src/cache-math.ts` | NEW — canonical arithmetic: `computeCacheHitPercent`, `emptyTotals`, `addToTotals` |
| `src/session-data.ts` | Removes 3 private functions; adds import from `./cache-math.js` |
| `src/format-utils.ts` | `summarizeHitPercent` delegates to `computeCacheHitPercent`; adds import |

**Zero duplication** of the cache-hit-percent formula after this plan executes.
