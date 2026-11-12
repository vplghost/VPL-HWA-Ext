---
id: VHE-6ZKXD6
title: Exclude obsolete legacy popup scripts from distribution build
status: done
priority: medium
labels: []
createdAt: '2026-11-12T05:41:42.755Z'
updatedAt: '2026-11-12T06:00:10.125Z'
completedAt: '2026-11-12T06:00:10.125Z'
timeSpent: 0
assignee: '@me'
---
# Exclude obsolete legacy popup scripts from distribution build

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update scripts/build.mjs to exclude obsolete popup.js, popup-data.js, and dashboard-data.js from dist/
- [x] #2 Ensure dist/ bundle only contains runtime scripts, WXT chunks, and manifest
- [x] #3 Verify clean build output without missing asset errors
<!-- AC:END -->

