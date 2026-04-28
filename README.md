# pi-cache-graph

A project-local pi extension that adds cache inspection commands:

- `/cache graph` — shows cache hit % over time for assistant turns across the current session timeline
- `/cache stats` — shows per-message token/cache breakdown for assistant messages across the whole session tree, plus cumulative totals
- `/cache export` — writes the same stats data to `session-name.csv` at the project root

## Commands

### `/cache graph`
Opens a TUI overlay that shows:
- cache hit % trend over time across assistant messages in session append order
- latest / min / max cache hit rate
- active-branch totals
- whole-tree totals

Cache hit % is computed as:

```text
cacheRead / (input + cacheRead)
```

### `/cache stats`
Opens a TUI overlay table that shows:
- one row per assistant message with usage data
- whether the message is on the current active branch
- sent / received / cache-hit / cache-write tokens
- per-message cache hit %
- cumulative totals for the active branch and the whole tree

### `/cache export`
Writes a CSV to the project root:
- filename: `session-name.csv`
- uses the current pi session name when available
- falls back to the session file basename if the session has no explicit name
- contains summary rows plus the per-message rows shown in `/cache stats`
- can be opened in Excel to build graphs from the exported columns

## Local usage

Run pi with this extension from the current folder:

```bash
pi -e .
```

Then use:

```text
/cache graph
/cache stats
/cache export
```

## Install as a local package

You can also install the package path into pi:

```bash
pi install .
```

Or add it to `.pi/settings.json`:

```json
{
  "packages": [
    "."
  ]
}
```

## Development

```bash
npm install
npm run check
```

## Files

- `index.ts` — extension entrypoint
- `src/index.ts` — command registration
- `src/session-data.ts` — session traversal and metric computation
- `src/graph-view.ts` — graph rendering
- `src/stats-view.ts` — stats table rendering
- `src/render-utils.ts` — shared TUI dialog + formatting helpers
