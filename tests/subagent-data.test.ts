import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { collectAgentCacheMetrics, listCacheAgents } from "../src/subagent-data.js";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "cache-agent-"));
  directories.push(dir);
  const branch: SessionEntry[] = [];
  const root = { getSessionId: () => "root-id", getSessionDir: () => dir, getEntries: () => branch, getBranch: () => branch };
  const file = path.join(dir, "child.jsonl");
  const custom = (customType: string, data: unknown) => branch.push({ type: "custom", id: `r${branch.length}`, parentId: null, timestamp: "", customType, data } as SessionEntry);
  return { root, file, custom };
}
function line(value: unknown): string { return JSON.stringify(value) + "\n"; }
function msg(id: string, parentId: string, role: "assistant" | "user") {
  return { type: "message", id, parentId, timestamp: "2025-01-01T00:00:00Z", message: role === "user" ? { role, content: "hi" } : { role, provider: "test", model: "test", usage: { input: 10, output: 2, cacheRead: 30, cacheWrite: 1, totalTokens: 43 } } };
}
function child(file: string) {
  writeFileSync(file, [
    { type: "session", id: "child" },
    { type: "custom", customType: "pi-subagent:thread:v1", id: "owner", parentId: null, data: { rootId: "root-id", threadPath: "/root/a", inheritedCount: 2 } },
    msg("inherited-user", "owner", "user"), msg("inherited-assistant", "inherited-user", "assistant"),
    msg("own", "inherited-assistant", "assistant"),
    msg("future", "own", "assistant"),
    msg("alternate", "own", "assistant"),
  ].map(line).join(""));
}

describe("subagent registry", () => {
  it("reconstructs additions, patches, clears and latest full registry on the current root branch", () => {
    const { root, custom } = setup();
    custom("pi-subagent:registry:v1", { version: 1, rootSessionId: "root-id", threads: [{ view: { path: "/old" } }] });
    custom("pi-subagent:registry:v1", { version: 1, rootSessionId: "root-id", threads: [{ view: { path: "/root/a", state: "starting" } }] });
    custom("pi-subagent:registry-delta:v1", { version: 1, rootSessionId: "root-id", changes: [
      { path: "/root/a", view: { state: "running", sessionFile: "/tmp/a", sessionLeafId: "x" } },
      { thread: { view: { path: "/root/a/nested", state: "paused" } } },
    ] });
    custom("pi-subagent:registry-delta:v1", { version: 1, rootSessionId: "root-id", changes: [{ path: "/root/a", view: { sessionLeafId: "y" }, cleared: ["state"] }] });
    expect(listCacheAgents(root)).toEqual([{ path: "/root" }, { path: "/root/a", sessionFile: "/tmp/a", sessionLeafId: "y" }, { path: "/root/a/nested", state: "paused" }]);
  });
  it("fails closed for malformed and foreign registries", () => {
    const { root, custom } = setup();
    custom("pi-subagent:registry:v1", { version: 1, rootSessionId: "other", threads: [] });
    expect(listCacheAgents(root)).toEqual([{ path: "/root" }]);
    custom("pi-subagent:registry:v1", { version: 1, rootSessionId: "root-id", threads: [null] });
    expect(listCacheAgents(root)).toEqual([{ path: "/root" }]);
  });
});

describe("subagent metrics", () => {
  it("excludes copied history and later/alternate branches, then rereads a new checkpoint on refresh", () => {
    const { root, file } = setup(); child(file);
    const agent = { path: "/root/a", sessionFile: file, sessionLeafId: "own" };
    const first = collectAgentCacheMetrics(root, agent);
    expect(first.error).toBeUndefined();
    expect(first.metrics.allMessages.map((m) => m.entryId)).toEqual(["own"]);
    expect(first.metrics.treeTotals.cacheRead).toBe(30);
    appendFileSync(file, line(msg("new", "future", "assistant")));
    const refreshed = collectAgentCacheMetrics(root, { ...agent, sessionLeafId: "new" });
    expect(refreshed.metrics.allMessages.map((m) => m.entryId)).toEqual(["own", "future", "new"]);
  });
  it("reports missing files, unknown checkpoint, wrong ownership, and invalid directories", () => {
    const { root, file } = setup();
    expect(collectAgentCacheMetrics(root, { path: "/root/a" }).error).toBeDefined();
    child(file);
    expect(collectAgentCacheMetrics(root, { path: "/root/a", sessionFile: file, sessionLeafId: "missing" }).error).toMatch(/checkpoint/);
    expect(collectAgentCacheMetrics(root, { path: "/root/b", sessionFile: file }).error).toMatch(/ownership/);
    const outside = setup(); child(outside.file);
    expect(collectAgentCacheMetrics(root, { path: "/root/a", sessionFile: outside.file }).error).toMatch(/directory/);
  });
  it("handles incomplete writes and missing inherited metadata without counting copied usage", () => {
    const { root, file } = setup(); child(file);
    appendFileSync(file, '{"type":"message"');
    expect(collectAgentCacheMetrics(root, { path: "/root/a", sessionFile: file, sessionLeafId: "own" }).metrics.allMessages.map((m) => m.entryId)).toEqual(["own"]);
    writeFileSync(file, line({ type: "custom", customType: "pi-subagent:thread:v1", id: "owner", parentId: null, data: { rootId: "root-id", threadPath: "/root/a" } }) + line(msg("own", "owner", "assistant")));
    expect(collectAgentCacheMetrics(root, { path: "/root/a", sessionFile: file, sessionLeafId: "own" }).error).toMatch(/inherited/);
  });
  it("returns root metrics without requiring a subagent manager", () => {
    const { root } = setup();
    expect(collectAgentCacheMetrics(root as Pick<SessionManager, "getEntries" | "getBranch" | "getSessionId" | "getSessionDir">, { path: "/root" }).metrics.allMessages).toEqual([]);
  });
});
