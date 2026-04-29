# Plan: Split `render-utils.ts` into `format-utils.ts` and `scroll-dialog.ts`

## Goal

`render-utils.ts` currently conflates two unrelated concerns:
1. **Pure string formatting** — `formatInt`, `formatPercent`, `shortModelName`,
   `summarizeHitPercent`, `formatTotalsLine`
2. **TUI component** — the stateful `ScrollDialog` class (+ its private helpers
   `repeat`, `fitLine`, `DEFAULT_DIALOG_BODY_ROWS`)

Split them into purpose-named files. Keep `render-utils.ts` as a thin re-export
barrel so existing callers continue to compile until they are updated.

---

## Steps

### Step 1 — Create `src/format-utils.ts`

New file. Move (do not copy) the following from `render-utils.ts`:

- constant: *(none)*
- functions exported: `formatInt`, `formatPercent`, `shortModelName`,
  `summarizeHitPercent`, `formatTotalsLine`

The file needs one import:
```ts
import type { CacheUsageTotals } from "./types.js";
```

No TUI or pi imports needed.

---

### Step 2 — Create `src/scroll-dialog.ts`

New file. Move the following from `render-utils.ts`:

- constant: `DEFAULT_DIALOG_BODY_ROWS`
- private helpers: `repeat`, `fitLine`
- exported interface: `ScrollDialogOptions`
- exported class: `ScrollDialog`

Required imports (same as current top of `render-utils.ts`, minus `CacheUsageTotals`):
```ts
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Component } from "@mariozechner/pi-tui";
```

---

### Step 3 — Rewrite `src/render-utils.ts` as a re-export barrel

Replace the entire file content with:
```ts
// Re-export barrel — kept for backward compatibility.
// Import directly from format-utils or scroll-dialog instead.
export * from "./format-utils.js";
export * from "./scroll-dialog.js";
```

---

### Step 4 — Update `src/graph-view.ts`

Change:
```ts
import { formatInt, formatPercent, formatTotalsLine } from "./render-utils.js";
```
To:
```ts
import { formatInt, formatPercent, formatTotalsLine } from "./format-utils.js";
```

---

### Step 5 — Update `src/stats-view.ts`

Change:
```ts
import { formatInt, formatPercent, formatTotalsLine, shortModelName, summarizeHitPercent } from "./render-utils.js";
```
To:
```ts
import { formatInt, formatPercent, formatTotalsLine, shortModelName, summarizeHitPercent } from "./format-utils.js";
```

---

### Step 6 — Update `src/export.ts`

Change:
```ts
import { summarizeHitPercent } from "./render-utils.js";
```
To:
```ts
import { summarizeHitPercent } from "./format-utils.js";
```

---

### Step 7 — Update `src/index.ts`

Change:
```ts
import { ScrollDialog } from "./render-utils.js";
```
To:
```ts
import { ScrollDialog } from "./scroll-dialog.js";
```

---

### Step 8 — Verify

```bash
npm run check
```

All type errors must be resolved before done.

---

## Expected outcome

| File | Change |
|---|---|
| `src/format-utils.ts` | NEW — pure formatting helpers |
| `src/scroll-dialog.ts` | NEW — ScrollDialog TUI component |
| `src/render-utils.ts` | Reduced to 3-line re-export barrel |
| `src/graph-view.ts` | Import updated |
| `src/stats-view.ts` | Import updated |
| `src/export.ts` | Import updated |
| `src/index.ts` | Import updated |
