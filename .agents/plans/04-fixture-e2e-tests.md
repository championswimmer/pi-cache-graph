# Plan: E2E Fixture Tests Using Real Session Snapshot

## Goal

Add an end-to-end test that runs `collectCacheSessionMetrics` against a **real
stripped session JSONL** from `~/.pi/agent/sessions/`. The test asserts that the
computed metrics match pre-computed Python golden values — catching any formula
bug, precision drift, or pipeline regression that hand-crafted fake entries
cannot.

### Why this is valuable over the existing unit tests

| Unit tests (`session-data.test.ts`) | Fixture E2E tests |
|---|---|
| Synthetic token values chosen for math convenience | Real token values from actual LLM calls |
| Exercises edge cases deliberately | Exercises real-world diversity |
| Already covers branch-vs-tree split | Covers both OpenAI-style and Anthropic-style formulas in one session |
| Fast to maintain | Self-documenting: the fixture *is* the test data |

### Chosen fixture file

```
~/.pi/agent/sessions/
  --Users-championswimmer-Development-Personal-LLM-pi-cache-graph--/
    2026-04-28T23-33-34-291Z_019dd670-ddd2-705b-9d7d-da625f9ef6fb.jsonl
```

Reasons:
- Smallest of the 4 sessions (150KB raw → **~44KB stripped**) — safe to check in
- 22 assistant messages with usage data
- Contains **both** provider styles in a single session:
  - messages 1–4: `gpt-5.4` via `github-copilot` (OpenAI-style: `cacheWrite=0`)
  - messages 5–22: `claude-opus-4.7` via `github-copilot` (Anthropic-style: `cacheWrite>0`)
- Linear chain (no branching) → `getEntries()` = `getBranch()`, so all messages
  are on the active branch — simple, predictable assertions

### What is stripped

Only these fields are kept per entry:
```
type, id, parentId, timestamp
message.role, message.provider, message.model, message.usage, message.api
```

Removed: `message.content` (tool calls, thinking blocks, response text),
`message.stopReason`, `message.responseId`, `message.timestamp`. This eliminates
all potentially sensitive content while preserving everything
`collectCacheSessionMetrics` actually reads.

---

## Pre-computed golden values

These were computed by independent Python against the raw JSONL and must be
reproduced exactly by the TypeScript implementation.

### Tree totals (= active branch totals, because session is linear)

| Field | Value |
|---|---|
| `assistantMessages` | `22` |
| `input` | `8493` |
| `output` | `12538` |
| `cacheRead` | `612477` |
| `cacheWrite` | `54995` |
| `totalTokens` | `688503` |

### Selected per-message spot checks

| seq | entryId (prefix) | input | cacheRead | cacheWrite | expected `cacheHitPercent` |
|---|---|---|---|---|---|
| 1 | `0858abeb` | 2470 | 5632 | 0 | `5632/(2470+5632+0)*100 = 69.5137…%` |
| 4 | `2d187e27` | 3066 | 9600 | 0 | `9600/(3066+9600+0)*100 = 75.7935…%` |
| 5 | `8d5c20c3` | 6 | 0 | 26630 | `0/(6+0+26630)*100 = 0.0000%` ← first Anthropic turn (cold cache) |
| 6 | `a9d09f81` | 1 | 26630 | 2722 | `26630/(1+26630+2722)*100 = 90.7185…%` ← Anthropic warm cache |
| 22 | `09c30552` | 1 | 39130 | 117 | `39130/(1+39130+117)*100 = 99.6993…%` |

---

## Steps

### Step 1 — Create `tests/fixtures/` directory

```bash
mkdir -p tests/fixtures
```

---

### Step 2 — Generate the stripped fixture file

Run this **once** as a setup step (not part of the test run itself). Add it as
an npm script `fixtures:generate` so it can be re-run if needed.

Script location: `scripts/generate-fixtures.mjs`

Logic:
1. Read the source JSONL from the hardcoded session path
2. For each line: parse JSON, drop `message.content`, `message.stopReason`,
   `message.responseId`, `message.timestamp` — keep only the fields listed above
3. Write stripped lines to `tests/fixtures/session-linear.jsonl`

The script must be committed alongside the fixture; the fixture is also committed
so tests run in CI without needing `~/.pi/agent/sessions` present.

```js
// scripts/generate-fixtures.mjs
import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { join } from "path";

const SOURCE = join(
  homedir(),
  ".pi/agent/sessions",
  "--Users-championswimmer-Development-Personal-LLM-pi-cache-graph--",
  "2026-04-28T23-33-34-291Z_019dd670-ddd2-705b-9d7d-da625f9ef6fb.jsonl",
);
const DEST = "tests/fixtures/session-linear.jsonl";

const KEEP_MSG_FIELDS = new Set(["role", "provider", "model", "usage", "api"]);

const out = createWriteStream(DEST);
const rl = createInterface({ input: createReadStream(SOURCE) });

for await (const line of rl) {
  const entry = JSON.parse(line);
  if (entry.message) {
    entry.message = Object.fromEntries(
      Object.entries(entry.message).filter(([k]) => KEEP_MSG_FIELDS.has(k)),
    );
  }
  out.write(JSON.stringify(entry) + "\n");
}
out.end();
console.log(`Written to ${DEST}`);
```

Add to `package.json`:
```json
"fixtures:generate": "node scripts/generate-fixtures.mjs"
```

---

### Step 3 — Create a JSONL parsing helper for tests

Add `tests/helpers/load-session-fixture.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// Only the fields collectCacheSessionMetrics actually reads.
type FixtureEntry = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: {
    role: string;
    provider?: string;
    model?: string;
    usage?: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      totalTokens: number;
    };
  };
};

export function loadSessionFixture(filename: string): FixtureEntry[] {
  const path = join(import.meta.dirname, "../fixtures", filename);
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FixtureEntry);
}

export function makeSessionManagerFromFixture(entries: FixtureEntry[]) {
  return {
    getEntries: () => entries as unknown as Parameters<
      typeof import("../../src/session-data.js")["collectCacheSessionMetrics"]
    >[0] extends { getEntries(): (infer E)[] } ? E[] : never,
    getBranch: () => entries as unknown as Parameters<
      typeof import("../../src/session-data.js")["collectCacheSessionMetrics"]
    >[0] extends { getBranch(): (infer E)[] } ? E[] : never,
  };
}
```

Note: since the session is a linear chain, `getBranch()` correctly returns all
entries (same as `getEntries()`). If a branching fixture is added later, the
helper will need a separate branch-path parameter.

---

### Step 4 — Write `tests/session-fixture.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { collectCacheSessionMetrics } from "../src/session-data.js";
import { computeCacheHitPercent } from "../src/cache-math.js";
import { loadSessionFixture, makeSessionManagerFromFixture } from "./helpers/load-session-fixture.js";

const ENTRIES = loadSessionFixture("session-linear.jsonl");
const SM = makeSessionManagerFromFixture(ENTRIES);
const METRICS = collectCacheSessionMetrics(SM);

// ── Golden values (computed independently by Python) ────────────────────────

const EXPECTED_TREE_TOTALS = {
  assistantMessages: 22,
  input: 8493,
  output: 12538,
  cacheRead: 612477,
  cacheWrite: 54995,
  totalTokens: 688503,
};

// ── Tree / branch structure ──────────────────────────────────────────────────

describe("session-fixture: structure", () => {
  it("allMessages has 22 entries", () => {
    expect(METRICS.allMessages).toHaveLength(22);
  });

  it("activeBranchMessages has 22 entries (linear session, all on branch)", () => {
    expect(METRICS.activeBranchMessages).toHaveLength(22);
  });

  it("all messages are flagged isOnActiveBranch=true", () => {
    expect(METRICS.allMessages.every((m) => m.isOnActiveBranch)).toBe(true);
  });

  it("sequence numbers run 1..22 in tree order", () => {
    const seqs = METRICS.allMessages.map((m) => m.sequence);
    expect(seqs).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  });

  it("activeBranchSequence matches sequence for every message", () => {
    for (const m of METRICS.allMessages) {
      expect(m.activeBranchSequence).toBe(m.sequence);
    }
  });
});

// ── Tree totals ──────────────────────────────────────────────────────────────

describe("session-fixture: tree totals", () => {
  it("assistantMessages count is 22", () => {
    expect(METRICS.treeTotals.assistantMessages).toBe(22);
  });

  it("input total matches golden value", () => {
    expect(METRICS.treeTotals.input).toBe(EXPECTED_TREE_TOTALS.input);
  });

  it("output total matches golden value", () => {
    expect(METRICS.treeTotals.output).toBe(EXPECTED_TREE_TOTALS.output);
  });

  it("cacheRead total matches golden value", () => {
    expect(METRICS.treeTotals.cacheRead).toBe(EXPECTED_TREE_TOTALS.cacheRead);
  });

  it("cacheWrite total matches golden value", () => {
    expect(METRICS.treeTotals.cacheWrite).toBe(EXPECTED_TREE_TOTALS.cacheWrite);
  });

  it("totalTokens total matches golden value", () => {
    expect(METRICS.treeTotals.totalTokens).toBe(EXPECTED_TREE_TOTALS.totalTokens);
  });

  it("activeBranchTotals equals treeTotals (linear session)", () => {
    expect(METRICS.activeBranchTotals).toEqual(METRICS.treeTotals);
  });
});

// ── Per-message formula spot checks ─────────────────────────────────────────

describe("session-fixture: per-message cacheHitPercent spot checks", () => {
  function msg(seq: number) {
    return METRICS.allMessages.find((m) => m.sequence === seq)!;
  }

  it("seq=1 (gpt-5.4, OpenAI-style cacheWrite=0): hit% = 69.51%", () => {
    const m = msg(1);
    const expected = computeCacheHitPercent(2470, 5632, 0);
    expect(m.cacheHitPercent).toBeCloseTo(expected, 4);
    expect(m.cacheHitPercent).toBeCloseTo(69.5137, 3);
  });

  it("seq=4 (gpt-5.4, last OpenAI-style): hit% = 75.79%", () => {
    const m = msg(4);
    const expected = computeCacheHitPercent(3066, 9600, 0);
    expect(m.cacheHitPercent).toBeCloseTo(expected, 4);
    expect(m.cacheHitPercent).toBeCloseTo(75.7935, 3);
  });

  it("seq=5 (claude, first turn, cold cache — cacheRead=0, cacheWrite>0): hit% = 0%", () => {
    const m = msg(5);
    expect(m.cacheHitPercent).toBe(0);
  });

  it("seq=6 (claude, first warm turn, Anthropic-style): hit% = 90.72%", () => {
    const m = msg(6);
    // denominator = 1 + 26630 + 2722 = 29353
    const expected = computeCacheHitPercent(1, 26630, 2722);
    expect(m.cacheHitPercent).toBeCloseTo(expected, 4);
    expect(m.cacheHitPercent).toBeCloseTo(90.7185, 3);
  });

  it("seq=22 (claude, last turn, near-100% cache): hit% = 99.70%", () => {
    const m = msg(22);
    const expected = computeCacheHitPercent(1, 39130, 117);
    expect(m.cacheHitPercent).toBeCloseTo(expected, 4);
    expect(m.cacheHitPercent).toBeCloseTo(99.6993, 3);
  });

  it("every message has a cacheHitPercent between 0 and 100", () => {
    for (const m of METRICS.allMessages) {
      expect(m.cacheHitPercent).toBeGreaterThanOrEqual(0);
      expect(m.cacheHitPercent).toBeLessThanOrEqual(100);
    }
  });

  it("cacheHitPercent equals direct computeCacheHitPercent call for every message", () => {
    for (const m of METRICS.allMessages) {
      const expected = computeCacheHitPercent(m.input, m.cacheRead, m.cacheWrite);
      expect(m.cacheHitPercent).toBeCloseTo(expected, 10);
    }
  });
});

// ── Provider coverage ────────────────────────────────────────────────────────

describe("session-fixture: provider coverage", () => {
  it("includes both OpenAI-style and Anthropic-style messages", () => {
    const hasOpenAI = METRICS.allMessages.some((m) => m.cacheWrite === 0 && m.cacheRead > 0);
    const hasAnthropic = METRICS.allMessages.some((m) => m.cacheWrite > 0);
    expect(hasOpenAI).toBe(true);
    expect(hasAnthropic).toBe(true);
  });

  it("OpenAI-style messages (cacheWrite=0) use input as full denominator", () => {
    const openAIMsgs = METRICS.allMessages.filter((m) => m.cacheWrite === 0 && m.input > 0);
    for (const m of openAIMsgs) {
      const expected = (m.cacheRead / (m.input + m.cacheRead)) * 100;
      expect(m.cacheHitPercent).toBeCloseTo(expected, 10);
    }
  });

  it("Anthropic-style messages (cacheWrite>0) include cacheWrite in denominator", () => {
    const anthropicMsgs = METRICS.allMessages.filter((m) => m.cacheWrite > 0);
    for (const m of anthropicMsgs) {
      const wrongFormula = m.input > 0
        ? (m.cacheRead / (m.input + m.cacheRead)) * 100
        : 0;
      const correctFormula = computeCacheHitPercent(m.input, m.cacheRead, m.cacheWrite);
      // The correct and wrong formulas should differ (otherwise cacheWrite had no effect)
      if (m.cacheRead > 0) {
        expect(m.cacheHitPercent).not.toBeCloseTo(wrongFormula, 1);
      }
      expect(m.cacheHitPercent).toBeCloseTo(correctFormula, 10);
    }
  });
});
```

---

### Step 5 — Run the fixture generator, then verify

```bash
npm run fixtures:generate   # creates tests/fixtures/session-linear.jsonl
npm run check               # zero TypeScript errors
npm test                    # all tests pass (previous 84 + new fixture tests)
```

Commit both the stripped fixture and the test file.

---

## Expected outcome

```
scripts/
  generate-fixtures.mjs          NEW — strips and writes the fixture

tests/
  fixtures/
    session-linear.jsonl          NEW — 44KB stripped snapshot (committed)
  helpers/
    load-session-fixture.ts       NEW — JSONL parser + fake SessionManager factory
  session-fixture.test.ts         NEW — ~25 assertions against golden values
```

**`npm test` result:** previous 84 tests + ~25 new fixture tests, all green.

---

## Future extension notes

- If a session with **branching** is ever available, add a second fixture
  (`session-branched.jsonl`) and extend the helper to accept a separate branch
  entry-id list.
- The `fixtures:generate` script can be extended to strip additional sessions
  when more provider styles (e.g. Gemini, pure OpenAI) need coverage.
- The golden values table in this plan should stay in sync with any formula
  change — if `computeCacheHitPercent` changes, re-run the Python script and
  update both this plan and the hardcoded constants in the test file.
