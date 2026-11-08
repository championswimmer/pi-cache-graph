import { beforeEach, describe, expect, it, vi } from "vitest";
import cacheGraphExtension from "../src/index.js";
import { collectCacheSessionMetrics } from "../src/session-data.js";
import { collectAgentCacheMetrics, listCacheAgents } from "../src/subagent-data.js";

vi.mock("../src/session-data.js", () => ({ collectCacheSessionMetrics: vi.fn(() => ({ source: "main" })) }));
vi.mock("../src/subagent-data.js", () => ({
  listCacheAgents: vi.fn(() => [{ path: "/root" }, { path: "/root/research" }]),
  collectAgentCacheMetrics: vi.fn((_session, agent) => ({ metrics: { source: agent.path } })),
}));

describe("graph agent selector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("switches agents and refreshes the selected agent and registry", async () => {
    let handler: any;
    const sessionManager = {};
    const pi = { registerCommand: (_name: string, command: any) => { handler = command.handler; } };
    cacheGraphExtension(pi as any);
    let dialog: any;
    const ctx = {
      sessionManager,
      hasUI: true,
      ui: { custom: async (create: any) => { dialog = create(null, {}, null, () => {}); } },
    };
    await handler("graph", ctx);
    const options = dialog.options;
    expect(options.getTitle()).toContain("/root");
    expect(options.onKey("]")).toBe(true);
    expect(options.getTitle()).toContain("/root/research");
    expect(collectAgentCacheMetrics).toHaveBeenLastCalledWith(sessionManager, { path: "/root/research" });
    vi.mocked(listCacheAgents).mockReturnValueOnce([{ path: "/root" }, { path: "/root/research" }, { path: "/root/new" }]);
    expect(options.onKey("r")).toBe(true);
    expect(listCacheAgents).toHaveBeenCalledTimes(2);
    expect(collectAgentCacheMetrics).toHaveBeenCalledTimes(2);
    expect(options.getTitle()).toContain("/root/research");
    expect(options.onKey("[")).toBe(true);
    expect(options.getTitle()).toContain("/root —");
    expect(collectCacheSessionMetrics).toHaveBeenCalled();
    expect(options.onKey("]")).toBe(true);
    vi.mocked(listCacheAgents).mockReturnValueOnce([{ path: "/root" }]);
    expect(options.onKey("r")).toBe(true);
    expect(options.getTitle()).toContain("/root —");
  });
});
