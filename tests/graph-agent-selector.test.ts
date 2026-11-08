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

  it.each(["completed", "stopped", "failed"])("switches to %s agents with arrow keys and wraps around", async (state) => {
    const agent = { path: "/root/research", state };
    vi.mocked(listCacheAgents).mockReturnValueOnce([{ path: "/root" }, agent]);
    let handler: any;
    cacheGraphExtension({ registerCommand: (_name: string, command: any) => { handler = command.handler; } } as any);
    let dialog: any;
    const sessionManager = {};
    await handler("graph", {
      sessionManager,
      hasUI: true,
      ui: { custom: async (create: any) => { dialog = create(null, {}, null, () => {}); } },
    });
    const options = dialog.options;
    expect(options.helpText).toContain("←/→ agent");
    expect(options.helpText).not.toContain("[/]");
    dialog.handleInput("\x1b[C"); // right arrow
    expect(options.getTitle()).toContain("/root/research");
    expect(collectAgentCacheMetrics).toHaveBeenLastCalledWith(sessionManager, agent);
    dialog.handleInput("\x1b[C");
    expect(options.getTitle()).toContain("/root —");
    dialog.handleInput("\x1b[D"); // left arrow wraps to the last agent
    expect(options.getTitle()).toContain("/root/research");
    dialog.handleInput("\x1b[D");
    expect(options.getTitle()).toContain("/root —");
    expect(options.onKey("/")).toBe(false);
  });

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
