// scripts/generate-fixtures.mjs
// Strips message.content (and other large/irrelevant fields) from a real pi
// session JSONL and writes the result to tests/fixtures/session-linear.jsonl.
// Only fields that collectCacheSessionMetrics actually reads are kept.
//
// Run once with:  npm run fixtures:generate

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

const DEST = join(import.meta.dirname, "../tests/fixtures/session-linear.jsonl");

// Only these message-level fields are needed by collectCacheSessionMetrics.
const KEEP_MSG_FIELDS = new Set(["role", "provider", "model", "usage", "api"]);

const out = createWriteStream(DEST);
const rl = createInterface({ input: createReadStream(SOURCE) });

let count = 0;
for await (const line of rl) {
  if (!line.trim()) continue;
  const entry = JSON.parse(line);
  if (entry.message) {
    entry.message = Object.fromEntries(
      Object.entries(entry.message).filter(([k]) => KEEP_MSG_FIELDS.has(k)),
    );
  }
  out.write(JSON.stringify(entry) + "\n");
  count++;
}

out.end();
console.log(`✓ Wrote ${count} entries to ${DEST}`);
