---
name: 05-release-skill
description: Add a project-local release skill, /release prompt template, and helper script that perform semver bumps, tagging, pushing, and npm publication via the existing GitHub workflow.
steps:
  - phase: discovery
    steps:
      - "- [x] step 1: inspect pi skill and prompt-template docs plus current package/workflow setup"
      - "- [x] step 2: decide how /release should invoke the release workflow in this repo"
  - phase: implementation
    steps:
      - "- [x] step 1: add a project-local release skill with the full release procedure and safety checks"
      - "- [x] step 2: add a helper release script that bumps semver, creates the git tag, and pushes the branch and tag"
      - "- [x] step 3: add a /release prompt template that routes major/minor/patch requests into the release workflow"
      - "- [x] step 4: document the maintainer release flow where appropriate"
  - phase: validation
    steps:
      - "- [x] step 1: inspect the added files and verify the prompt/skill locations are correct"
      - "- [x] step 2: run npm run check and summarize the final release workflow"
---

# 05-release-skill

## Phase 1 — Discovery
- [x] step 1: inspect pi skill and prompt-template docs plus current package/workflow setup
- [x] step 2: decide how /release should invoke the release workflow in this repo

## Phase 2 — Implementation
- [x] step 1: add a project-local release skill with the full release procedure and safety checks
- [x] step 2: add a helper release script that bumps semver, creates the git tag, and pushes the branch and tag
- [x] step 3: add a /release prompt template that routes major/minor/patch requests into the release workflow
- [x] step 4: document the maintainer release flow where appropriate

## Phase 3 — Validation
- [x] step 1: inspect the added files and verify the prompt/skill locations are correct
- [x] step 2: run npm run check and summarize the final release workflow
