import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { collectCacheSessionMetrics } from "./session-data.js";
import { renderGraphBody } from "./graph-view.js";
import { ScrollDialog } from "./render-utils.js";
import { renderStatsBody } from "./stats-view.js";

function normalizeSubcommand(args: string): string {
  return args.trim().toLowerCase();
}

function usageText(): string {
  return "Usage: /cache graph | /cache stats";
}

export default function cacheGraphExtension(pi: ExtensionAPI): void {
  pi.registerCommand("cache", {
    description: "Show cache hit graph or token/cache statistics",
    getArgumentCompletions(prefix) {
      const items = [
        { value: "graph", label: "graph", description: "Show cache hit % graph over time" },
        { value: "stats", label: "stats", description: "Show token/cache breakdown table" },
      ];

      const filtered = items.filter((item) => item.value.startsWith(prefix.toLowerCase()));
      return filtered.length > 0 ? filtered : items;
    },
    handler: async (args, ctx) => {
      const subcommand = normalizeSubcommand(args);

      if (!ctx.hasUI) {
        ctx.ui.notify(usageText(), "info");
        return;
      }

      if (subcommand !== "graph" && subcommand !== "stats") {
        ctx.ui.notify(usageText(), "info");
        return;
      }

      const metrics = collectCacheSessionMetrics(ctx.sessionManager);

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
