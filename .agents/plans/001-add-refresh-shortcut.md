---
title: Add refresh keyboard shortcut to cache graph
---

# Plan - Add refresh keyboard shortcut to cache graph

We want to add a shortcut 'r' to the `/cache graph` (and potentially `/cache stats`) TUI views that re-collects session metrics and re-renders the dialog.

## Steps

1. **Step 1: Update `/cache graph` to support refreshing**
   - Modify `src/index.ts` to allow updating the `metrics` object inside the `onKey` handler.
   - Implement the 'r' key in `onKey` for `/cache graph`.
   - Call `collectCacheSessionMetrics(ctx.sessionManager)` to refresh data.
   - Trigger a re-render.
   - Commit and push.

2. **Step 2: Update `/cache stats` to support refreshing**
   - Apply similar logic to `/cache stats` for consistency.
   - Implement the 'r' key in `onKey` for `/cache stats`.
   - Commit and push.

3. **Step 3: Update help text**
   - Ensure the help text in both dialogs mentions 'r' for refresh.
   - Commit and push.

4. **Step 4: Release**
   - Use the `release` skill to release a new minor version.
