---
id: doc-6b85d2ecec638a01bb82b51c4acf86f2
title: Extension Versioning and Release
description: SemVer rules, manifest.json synchronization, and release verification workflow
createdAt: '2026-11-02T06:43:51.516Z'
updatedAt: '2026-11-03T06:08:57.021Z'
tags:
  - workflows,release,versioning
---

# Extension Versioning and Release

## Overview
HWA Helper follows Semantic Versioning (MAJOR.MINOR.PATCH). Chrome requires the version in manifest.json to change to properly identify extension updates when reloaded in chrome://extensions.

## Versioning Policy
1. Every successful `npm run build` increments the extension version exactly once. The default is a SemVer patch bump; use `npm run build -- minor` or `npm run build -- major` for a milestone. An explicit higher `X.Y.Z` may also be passed. Equal or lower versions are rejected.
2. The build compiles and copies assets first, then bumps the version and writes the updated manifest into `dist/`. A failure before the bump does not advance the version.
3. `package.json`, `package-lock.json`, `extension/manifest.json`, and `dist/manifest.json` must hold the same version after each successful build. Build fails if the three source version files disagree before bumping.
4. `npm run check` runs tests and then `npm run build`; a successful check therefore increments the version once. Running tests alone does not create a build or change the version.
5. `npm run version:bump` remains a manual correction helper. Do not run it immediately before a normal build unless an extra increment is intended.

## Git Commit Rules
- Use conventional commit messages: feat(...), fix(...), refactor(...).
- Include task ID when tracking via Knowns.
- Never commit temporary files from temp/ to Git.
- UI labels, statuses, and tooltips must strictly remain in English.
