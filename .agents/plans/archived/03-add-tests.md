# Plan: Add Unit Tests with Vitest

## Goal

Add a minimal, well-structured test suite covering all **pure logic** in the
codebase. TUI rendering (ScrollDialog, renderGraphBody, renderStatsBody) is
intentionally excluded — it depends on pi theme objects and terminal state that
cannot sensibly be unit-tested in isolation.

### Modules to test

| Module | Testable? | Notes |
|---|---|---|
| `src/cache-math.ts` | ✅ fully | Pure arithmetic, zero external deps |
| `src/format-utils.ts` | ✅ fully | Pure string formatting |
| `src/session-data.ts` | ✅ via manual stubs | SessionManager is structural — construct fake entries |
| `src/export.ts` (CSV) | ✅ with helper exports | Private helpers need `export` added |
| `src/graph-view.ts` (math) | ✅ with helper exports | Private helpers need `export` added |
| `src/scroll-dialog.ts` | ❌ skip | Requires pi Theme + terminal |
| `src/stats-view.ts` | ❌ skip | Requires pi Theme + terminal |
| `src/graph-view.ts` (render) | ❌ skip | Requires pi Theme + terminal |

---

## Steps

### Step 1 — Install Vitest

```bash
npm install --save-dev vitest
```

Only `vitest` is needed. `vite-tsconfig-paths` is not required because all
imports are relative (no path aliases). Vitest handles `.js` extension imports
pointing at `.ts` source files natively.

---

### Step 2 — Create `vitest.config.ts` in project root

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

---

### Step 3 — Update `tsconfig.json`

Add `"tests/**/*.ts"` to the `include` array so the test files are type-checked
by `npm run check`:

```json
"include": ["index.ts", "src/**/*.ts", "tests/**/*.ts"]
```

---

### Step 4 — Add test scripts to `package.json`

```json
"test":       "vitest run",
"test:watch": "vitest"
```

---

### Step 5 — Export private helpers that are worth testing

#### `src/export.ts`

Add `export` to three currently-private functions:

- `csvEscape` — has interesting edge cases (quotes, commas, newlines)
- `sanitizeFileName` — has non-trivial regex logic
- `buildCsv` — assembles the final CSV string

Do **not** export `summaryRows` / `messageRows` individually; they are covered
indirectly through `buildCsv`.

#### `src/graph-view.ts`

Add `export` to four currently-private math helpers:

- `bucketMessages`
- `averageHitPercent`
- `minHitPercent`
- `maxHitPercent`

These are pure functions with no pi deps and have real logic worth protecting.

---

### Step 6 — Create `tests/` directory and test files

#### `tests/cache-math.test.ts`

Test `computeCacheHitPercent`:
- zero denominator → returns `0` (no divide-by-zero)
- all cache read, nothing else → returns `100`
- Anthropic-style: `input=100, cacheRead=200, cacheWrite=50` → `200/350 * 100`
- OpenAI-style: `cacheWrite=0, input=400, cacheRead=100` → `100/500 * 100 = 20`
- partial hit: `input=50, cacheRead=50, cacheWrite=0` → `50%`
- negative/zero values don't produce NaN

Test `emptyTotals`:
- all numeric fields are `0`
- `assistantMessages` is `0`

Test `addToTotals`:
- single call accumulates into emptyTotals correctly
- two sequential calls double the values
- does not mutate the `message` argument

---

#### `tests/format-utils.test.ts`

Test `formatInt`:
- integer values round-trip cleanly
- fractional values are rounded to nearest integer
- thousands separator is present for large values (e.g. `1000` → `"1,000"`)

Test `formatPercent`:
- always one decimal place (e.g. `50` → `"50.0%"`)
- `0` → `"0.0%"`, `100` → `"100.0%"`

Test `shortModelName`:
- concatenates provider and model with `/`

Test `summarizeHitPercent`:
- delegates correctly to `computeCacheHitPercent`
  (prove by comparing `summarizeHitPercent(totals)` against direct call to
  `computeCacheHitPercent(totals.input, totals.cacheRead, totals.cacheWrite)`)
- zero totals → `0`

Test `formatTotalsLine`:
- output contains the label
- output contains `turns`
- output contains `hit rate`
- output contains formatted values (spot-check one field)

---

#### `tests/session-data.test.ts`

Stub SessionManager with a plain object that satisfies
`Pick<SessionManager, "getEntries" | "getBranch">`. Construct
`SessionEntry`-shaped objects inline using `as unknown as SessionEntry`
(structural typing — no mocking framework needed).

Test `collectCacheSessionMetrics`:

**Empty session:**
- `allMessages` is empty
- `activeBranchMessages` is empty
- `treeTotals` equals `emptyTotals()`
- `activeBranchTotals` equals `emptyTotals()`

**Single assistant message on active branch:**
- `allMessages` has length 1
- `activeBranchMessages` has length 1
- `metric.cacheHitPercent` matches `computeCacheHitPercent(...)` for the same values
- `metric.sequence` is `1`
- `metric.activeBranchSequence` is `1`
- `metric.isOnActiveBranch` is `true`
- `treeTotals.input` equals the message's input
- `activeBranchTotals.input` equals the message's input

**Two messages: one on active branch, one off branch:**
- `allMessages` has length 2
- `activeBranchMessages` has length 1
- tree totals accumulate both; branch totals accumulate only the branch message
- off-branch message has `activeBranchSequence` `undefined`
- off-branch message has `isOnActiveBranch` `false`
- sequence numbers are 1, 2 in tree order; activeBranchSequence is 1 only on
  the branch message

**Non-assistant entries are filtered out:**
- Insert user-role entry and tool-call entry; confirm they are not counted

---

#### `tests/export-csv.test.ts`

Test `csvEscape`:
- plain string → returned as-is
- string containing `,` → wrapped in double-quotes
- string containing `"` → double-quote is escaped as `""` and result is quoted
- string containing newline → wrapped in double-quotes
- `null` → empty string `""`
- `undefined` → empty string `""`
- number → string representation, no quotes
- `true` / `false` → `"true"` / `"false"`

Test `sanitizeFileName`:
- normal alphanumeric name → returned unchanged
- spaces → replaced with `-`
- multiple special chars collapsed into single `-`
- leading/trailing dashes stripped
- empty string after sanitization → `"session"` fallback

Test `buildCsv` (pass a minimal `CacheSessionMetrics`):
- first line is the headers joined by commas
- contains at least one `summary` row
- contains at least one `message` row when `allMessages` is non-empty
- each row has the correct number of comma-separated columns (matches headers
  length)
- values that were passed in appear somewhere in the output

---

#### `tests/graph-math.test.ts`

Test `bucketMessages`:
- empty array → empty buckets array
- messages ≤ bucketCount → each message in its own bucket
- messages > bucketCount → correct number of buckets returned, each non-empty,
  all messages covered (no message lost or duplicated)
- single message, many buckets → one bucket of length 1

Test `averageHitPercent`:
- empty array → `0`
- single message → that message's `cacheHitPercent`
- two messages → their mean

Test `minHitPercent`:
- empty array → `0`
- single message → that value
- multiple messages → minimum value

Test `maxHitPercent`:
- empty array → `0`
- single message → that value
- multiple messages → maximum value

---

### Step 7 — Verify

```bash
npm test        # all tests pass
npm run check   # still zero TypeScript errors
```

Both must succeed before the plan is considered complete.

---

## Expected outcome after plan execution

```
tests/
  cache-math.test.ts      — ~60 lines
  format-utils.test.ts    — ~50 lines
  session-data.test.ts    — ~90 lines
  export-csv.test.ts      — ~70 lines
  graph-math.test.ts      — ~50 lines

package.json              — "test" and "test:watch" scripts added
vitest.config.ts          — NEW, 8 lines
tsconfig.json             — "tests/**/*.ts" added to include
src/export.ts             — csvEscape, sanitizeFileName, buildCsv now exported
src/graph-view.ts         — 4 math helpers now exported
```

**Modules not tested (intentionally):**
- `src/scroll-dialog.ts` — stateful TUI component, requires pi Theme + terminal
- `src/stats-view.ts` — requires pi Theme
- `src/graph-view.ts` `renderGraphBody` — requires pi Theme
- `src/index.ts` — command wiring, requires full pi context
