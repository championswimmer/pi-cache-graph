import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal shape — only the fields collectCacheSessionMetrics actually reads.
export type FixtureEntry = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: {
    role: string;
    provider?: string;
    model?: string;
    api?: string;
    usage?: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      totalTokens: number;
    };
  };
  [key: string]: unknown;
};

export function loadSessionFixture(filename: string): FixtureEntry[] {
  const path = join(__dirname, "../fixtures", filename);
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FixtureEntry);
}

/**
 * Wraps a flat list of FixtureEntry objects in a structural fake that satisfies
 * the SessionReader interface expected by collectCacheSessionMetrics.
 *
 * For a linear (non-branching) session, getBranch() returns all entries —
 * the same set as getEntries(). Pass a separate branchEntries array to
 * simulate a branching session.
 */
export function makeSessionManagerFromFixture(
  entries: FixtureEntry[],
  branchEntries?: FixtureEntry[],
) {
  const branch = branchEntries ?? entries;
  return {
    // Cast via unknown — structural typing means these satisfy SessionEntry[]
    // for the fields collectCacheSessionMetrics actually accesses.
    getEntries: () => entries as unknown[],
    getBranch: () => branch as unknown[],
  };
}
