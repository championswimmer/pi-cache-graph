# Releasing pi-cache-graph

This repository includes a project-local Pi release workflow:

- skill: `.agents/skills/release/SKILL.md`
- prompt template: `.pi/prompts/release.md`
- helper script: `scripts/release.mjs`

## From Pi

Use one of:

```text
/release patch
/release minor
/release major
```

The prompt template routes the agent into the `release` skill, which then runs the canonical helper script.

## What happens

The helper script performs these steps:

1. ensure the working tree is clean
2. ensure the current branch is `main`
3. `git fetch origin main --tags`
4. `git pull --ff-only origin main`
5. `npm run check`
6. `npm test`
7. `npm pack --dry-run`
8. `npm version <major|minor|patch> -m "release: v%s"`
9. `git push origin main`
10. `git push origin vX.Y.Z`

## npm publication

npm publication is handled by GitHub Actions, not by a separate local publish command.

Pushing a matching tag triggers:

- `.github/workflows/publish.yml`

That workflow runs `npm publish --access public` using the repository `NPM_TOKEN` secret.

## Direct CLI fallback

If needed, you can run the script directly from the repo root:

```bash
node scripts/release.mjs patch
node scripts/release.mjs minor
node scripts/release.mjs major
```
