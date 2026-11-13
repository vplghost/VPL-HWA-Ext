---
id: r95cpb
title: dist/ is committed to Git for direct load without rebuild
layer: project
category: convention
status: proposed
confidence: high
lastVerified: '2026-11-03T14:35:02.285Z'
ttlDays: 90
sources:
  - dist/
  - @doc/workflows/extension-versioning-and-release
tags:
  - dist
  - git
  - build
createdAt: '2026-11-03T14:35:02.285Z'
updatedAt: '2026-11-03T14:35:02.285Z'
---

dist/ is NOT in .gitignore and is tracked in Git intentionally. Built extension files must be committed alongside source changes so any checkout can load the extension directly in chrome://extensions without running npm install or npm run build. Every successful build must include dist/ in the same commit. Never revert or cherry-pick source without updating dist/ to match. See @doc/workflows/extension-versioning-and-release.
