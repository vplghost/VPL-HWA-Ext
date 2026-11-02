---
id: doc-6b85d2ecec638a01bb82b51c4acf86f2
title: Extension Versioning and Release
description: SemVer rules, manifest.json synchronization, and release verification workflow
createdAt: '2026-11-02T06:43:51.516Z'
updatedAt: '2026-11-02T06:44:03.713Z'
tags:
  - workflows,release,versioning
---

# Extension Versioning and Release

## Overview
HWA Helper follows Semantic Versioning (MAJOR.MINOR.PATCH). Chrome requires the version in manifest.json to change to properly identify extension updates when reloaded in chrome://extensions.

## Versioning Policy
1. Every feature wave or commit batch must increment SemVer patch (or minor for milestone releases).
2. package.json and extension/manifest.json must stay in 1:1 synchronization.
3. Automatic bump helper: npm run version:bump (defaults to patch, accepts minor, major, or X.Y.Z).
4. Verification: npm run check runs all node test suites and executes scripts/build.mjs to produce a fresh build in dist/ with the updated manifest.

## Git Commit Rules
- Use conventional commit messages: feat(...), fix(...), refactor(...).
- Include task ID when tracking via Knowns.
- Never commit temporary files from temp/ to Git.
- UI labels, statuses, and tooltips must strictly remain in English.
