---
id: VHE-08JN1Z
title: Eliminate globalThis fallback getters in rpcCache and recipeTree
status: done
priority: high
labels:
  - refactor,clean-code
createdAt: '2026-11-21T05:12:41.036Z'
updatedAt: '2026-11-21T05:13:21.062Z'
completedAt: '2026-11-21T05:13:21.062Z'
timeSpent: 0
---
# Eliminate globalThis fallback getters in rpcCache and recipeTree

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rpcCache.ts uses direct typed imports without globalThis fallback getters
- [ ] #2 recipeTree.ts uses imported heroMetadata directly
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Converted all 19 fallback getters in rpcCache to use typed imports directly and updated recipeTree to use imported heroMetadata
<!-- SECTION:NOTES:END -->

