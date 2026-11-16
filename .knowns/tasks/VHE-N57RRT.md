---
id: VHE-N57RRT
title: Restore extension version bump on commit mechanism
status: done
priority: high
labels:
  - release
  - version
createdAt: '2026-11-16T04:50:18.285Z'
updatedAt: '2026-11-16T04:50:55.384Z'
completedAt: '2026-11-16T04:50:55.384Z'
timeSpent: 0
---
# Restore extension version bump on commit mechanism

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Set up automatic extension version bumping on every commit, synchronizing package.json, package-lock.json, extension/manifest.json, and dist/manifest.json via git pre-commit hook and scripts/bump-version.mjs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Enhance scripts/bump-version.mjs to support dist/manifest.json
- [x] #2 Install git pre-commit hook to bump patch version on every commit
- [x] #3 Verify tests/version-bump.test.mjs passes
<!-- AC:END -->

