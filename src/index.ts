import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { exportStatsCsv } from "./export.js";
import { renderGraphBody } from "./graph-view.js";
import { ScrollDialog } from "./render-utils.js";
import { collectCacheSessionMetrics } from "./session-data.js";
import { renderStatsBody } from "./stats-view.js";

function normalizeSubcommand(args: string): string {
  return args.trim().toLowerCase();
}

function usageText(): string {
  return "Usage: /cache graph | /cache stats | /cache export";
}

export default function cacheGraphExtension(pi: ExtensionAPI): void {
  pi.registerCommand("cache", {
    description: "Show cache hit graph, token/cache statistics, or export CSV",
    getArgumentCompletions(prefix) {
      const items = [
        { value: "graph", label: "graph", description: "Show cache hit % graph over time" },
        { value: "stats", label: "stats", description: "Show token/cache breakdown table" },
        { value: "export", label: "export", description: "Export stats data to a CSV at project root" },
      ];

      const filtered = items.filter((item) => item.value.startsWith(prefix.toLowerCase()));
      return filtered.length > 0 ? filtered : items;
    },
    handler: async (args, ctx) => {
      const subcommand = normalizeSubcommand(args);

      if (subcommand !== "graph" && subcommand !== "stats" && subcommand !== "export") {
        ctx.ui.notify(usageText(), "info");
        return;
      }

      const metrics = collectCacheSessionMetrics(ctx.sessionManager);

      if (subcommand === "export") {
        const filePath = await exportStatsCsv(ctx.cwd, ctx.sessionManager, metrics);
        ctx.ui.notify(`Exported cache stats CSV to ${filePath}`, "info");
        return;
      }

      if (!ctx.hasUI) {
        ctx.ui.notify(
          "/cache graph and /cache stats require interactive TUI mode. Use /cache export in non-interactive mode.",
          "info",
        );
        return;
      }

      await ctx.ui.custom<void>(
        (_tui, theme, _keybindings, done) =>
          new ScrollDialog(
            theme,
            {
              title: subcommand === "graph" ? "Context Cache Graph" : "Context Cache Stats",
              renderBody: (innerWidth) =>
                subcommand === "graph"
                  ? renderGraphBody(theme, metrics, innerWidth)
                  : renderStatsBody(theme, metrics, innerWidth),
            },
            () => done(undefined),
          ),
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "90%",
            maxHeight: "90%",
            margin: 1,
          },
        },
      );
    },
  });
}
