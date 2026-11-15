---
id: VHE-GKAAJP
title: 'Phase 3.5: Modularize RPC Cache into typed store, extractors, and domain reducers refactor'
status: done
priority: high
labels:
  - typescript
  - phase-3
createdAt: '2026-11-15T15:33:17.023Z'
updatedAt: '2026-11-15T15:38:21.970Z'
completedAt: '2026-11-15T15:38:21.970Z'
timeSpent: 0
assignee: '-l'
---
# Phase 3.5: Modularize RPC Cache into typed store, extractors, and domain reducers refactor

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modularize rpc-cache.js into typed TypeScript modules under src/core/cache/ with store management, extractors, and domain reducers, preserving 100% token deduplication and global fallbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for RPC records, cache entries, extractors, and domain reducers in src/types/game/rpcCache.ts
- [x] #2 Create typed definitions and domain extractors/reducers in src/core/cache/
- [x] #3 Implement typed cacheStore with atomic merge, extract, pruneCache, and global fallbacks
- [x] #4 Add unit test suite verifying typed cache store, extractors, and reducers
- [x] #5 Verify all 927+ tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

