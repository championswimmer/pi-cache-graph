# Proposed Structure: pi-cache-graph

## Package Structure
```text
pi-cache-graph/
├── package.json      # Extension metadata and pi-package entry
├── index.ts          # Main entry point for the extension
├── src/
│   ├── commands.ts   # Implementation of /cache graph and /cache stats
│   ├── graph.ts      # Logic for rendering the cache distribution graph
│   ├── stats.ts      # Logic for calculating cache statistics
│   └── types.ts      # Shared interfaces and types
└── tsconfig.json     # TypeScript configuration
```

## recommended `package.json` snippets

```json
{
  "name": "pi-cache-graph",
  "type": "module",
  "pi": {
    "extensions": [
      "./index.ts"
    ]
  },
  "scripts": {
    "dev": "pi -e .",
    "check": "tsc --noEmit"
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-tui": "*"
  }
}
```

## How to Load Locally
1. Navigate to the extension directory: `cd pi-cache-graph`
2. Start `pi` with the local extension enabled:
   ```bash
   pi -e .
   ```
3. Once `pi` is running, you can use the commands:
   - `/cache graph`
   - `/cache stats`

## Key Files
1. `index.ts`: The entry point that receives `ExtensionAPI` and wires up commands.
2. `src/commands.ts`: Uses `pi.registerCommand` to define the `/cache` namespace and subcommands.
3. `src/graph.ts`: Should implement ASCII/Box-drawing character based visualization for the TUI.
