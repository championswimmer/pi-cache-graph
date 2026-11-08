import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { collectCacheSessionMetrics } from "./session-data.js";
import type { CacheSessionMetrics } from "./types.js";

/** The registry is maintained by pi-subagent-manager, not by this extension. */
export interface CacheAgent {
  path: string;
  state?: string;
  sessionFile?: string;
  sessionLeafId?: string | null;
}

type RegistryRoot = Pick<SessionManager, "getBranch" | "getSessionId">;
type MetricsRoot = RegistryRoot & Pick<SessionManager, "getEntries" | "getSessionDir">;
type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : undefined;
}

function threadView(value: unknown): ObjectValue | undefined {
  const view = object(object(value)?.view);
  return typeof view?.path === "string" && view.path.startsWith("/") && view.path !== "/root" ? view : undefined;
}

/** Reconstruct the last full registry and its later deltas on the current root branch. */
export function listCacheAgents(root: RegistryRoot): CacheAgent[] {
  const main: CacheAgent = { path: "/root" };
  try {
    const entries = root.getBranch();
    const deltas: ObjectValue[] = [];
    let base: ObjectValue | undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry?.type !== "custom") continue;
      if (entry.customType === "pi-subagent:registry-delta:v1") {
        const data = object(entry.data);
        if (!data) return [main];
        deltas.push(data);
      } else if (entry.customType === "pi-subagent:registry:v1") {
        base = object(entry.data);
        break;
      }
    }
    const rootId = root.getSessionId();
    if (!base || base.version !== 1 || base.rootSessionId !== rootId || !Array.isArray(base.threads)) return [main];
    const views = new Map<string, ObjectValue>();
    for (const thread of base.threads) {
      const view = threadView(thread);
      if (!view || views.has(view.path as string)) return [main];
      views.set(view.path as string, { ...view });
    }
    for (const delta of deltas.reverse()) {
      if (delta.version !== 1 || delta.rootSessionId !== rootId || !Array.isArray(delta.changes)) return [main];
      for (const raw of delta.changes) {
        const change = object(raw);
        if (!change) return [main];
        if ("thread" in change) {
          const view = threadView(change.thread);
          if (!view) return [main];
          views.set(view.path as string, { ...view });
        } else {
          if (typeof change.path !== "string" || !views.has(change.path)) return [main];
          const patch = object(change.view);
          if (!patch || (change.cleared !== undefined && !Array.isArray(change.cleared))) return [main];
          const view = { ...views.get(change.path), ...patch };
          if (Array.isArray(change.cleared)) for (const key of change.cleared) {
            if (typeof key !== "string") return [main];
            delete view[key];
          }
          if (view.path !== change.path) return [main];
          views.set(change.path, view);
        }
      }
    }
    return [main, ...[...views.values()].map((view): CacheAgent => ({
      path: view.path as string,
      ...(typeof view.state === "string" ? { state: view.state } : {}),
      ...(typeof view.sessionFile === "string" ? { sessionFile: view.sessionFile } : {}),
      ...(typeof view.sessionLeafId === "string" || view.sessionLeafId === null ? { sessionLeafId: view.sessionLeafId } : {}),
    }))];
  } catch {
    return [main];
  }
}

function emptyMetrics(): CacheSessionMetrics {
  return collectCacheSessionMetrics({ getEntries: () => [], getBranch: () => [] });
}

function within(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return !!relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validAssistant(entry: SessionEntry): boolean {
  if (entry.type !== "message" || entry.message.role !== "assistant") return true;
  const usage = object(entry.message.usage);
  return !!usage && ["input", "output", "cacheRead", "cacheWrite", "totalTokens"].every(
    (key) => typeof usage[key] === "number" && Number.isFinite(usage[key]),
  );
}

/** Read a selected agent's current checkpoint without opening a mutable session manager. */
export function collectAgentCacheMetrics(root: MetricsRoot, agent: CacheAgent): { metrics: CacheSessionMetrics; error?: string } {
  if (agent.path === "/root") return { metrics: collectCacheSessionMetrics(root) };
  const fail = (error: string) => ({ metrics: emptyMetrics(), error });
  if (!agent.sessionFile) return fail("Agent session is not available yet.");
  try {
    const file = realpathSync(agent.sessionFile);
    const sessionDir = realpathSync(root.getSessionDir());
    const rootId = root.getSessionId();
    let legacy = false;
    if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(rootId)) {
      const legacyPath = path.join(getAgentDir(), "subagents", rootId);
      try { legacy = within(realpathSync(legacyPath), file); } catch { /* no legacy directory */ }
    }
    if (!file.endsWith(".jsonl") || (!legacy && path.dirname(file) !== sessionDir)) {
      return fail("Agent session file is outside the allowed session directory.");
    }
    const lines = readFileSync(file, "utf8").split("\n");
    const entries: SessionEntry[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = object(JSON.parse(line));
        if (entry && typeof entry.id === "string" && typeof entry.type === "string" && entry.type !== "session") {
          entries.push(entry as unknown as SessionEntry);
        }
      } catch { /* Ignore incomplete trailing writes and malformed lines. */ }
    }
    const owner = entries.find((entry) => entry.type === "custom" && entry.customType === "pi-subagent:thread:v1");
    const data = owner?.type === "custom" ? object(owner.data) : undefined;
    if (!legacy && (data?.rootId !== root.getSessionId() || data?.threadPath !== agent.path)) {
      return fail("Agent session ownership does not match the registry.");
    }
    // Older sessions without ownership cannot reliably distinguish copied context.
    if (!data || !Number.isInteger(data.inheritedCount) || (data.inheritedCount as number) < 0) {
      return fail("Agent session does not identify its inherited history.");
    }
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    if (agent.sessionLeafId === null) return { metrics: emptyMetrics() };
    const leaf = agent.sessionLeafId ?? entries.at(-1)?.id;
    if (!leaf) return { metrics: emptyMetrics() };
    const branch: SessionEntry[] = [];
    const seen = new Set<string>();
    let id: string | null = leaf;
    while (id !== null) {
      if (seen.has(id)) return fail("Agent session branch is invalid.");
      seen.add(id);
      const entry = byId.get(id);
      if (!entry) return fail("Agent session checkpoint is not available yet.");
      branch.push(entry);
      id = entry.parentId;
    }
    branch.reverse();
    const ownerIndex = branch.findIndex((entry) => entry.id === owner?.id);
    if (ownerIndex < 0) return fail("Agent checkpoint predates its ownership metadata.");
    let inherited = data.inheritedCount as number;
    const own: SessionEntry[] = [];
    for (const entry of branch.slice(ownerIndex + 1)) {
      if (inherited > 0 && (entry.type === "message" || entry.type === "custom_message")) {
        inherited--;
        continue;
      }
      if (validAssistant(entry)) own.push(entry);
    }
    if (inherited > 0) return fail("Agent inherited history is incomplete at this checkpoint.");
    return { metrics: collectCacheSessionMetrics({ getEntries: () => own, getBranch: () => own }) };
  } catch {
    return fail("Agent session could not be read.");
  }
}
