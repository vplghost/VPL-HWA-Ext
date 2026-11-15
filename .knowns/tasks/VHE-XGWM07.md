---
id: VHE-XGWM07
title: 'Phase 2.3: Migrate Speedup Service and World Read Service to typed TypeScript modules'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-2
createdAt: '2026-11-15T14:36:27.870Z'
updatedAt: '2026-11-15T14:40:51.847Z'
completedAt: '2026-11-15T14:40:51.847Z'
timeSpent: 0
assignee: '@me'
---
# Phase 2.3: Migrate Speedup Service and World Read Service to typed TypeScript modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate speedup logic (validation, quoting, call building) and world-read cooldown/freshness planning from legacy JavaScript to typed TypeScript services.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for Speedup and World Read operations
- [x] #2 Create typed src/services/speedupService.ts and src/services/worldReadService.ts with backward-compatible fallbacks
- [x] #3 Update src/utils/speedup.ts and consuming Vue components to use typed speedupService
- [x] #4 Create comprehensive unit test suite covering speedup and world-read services
- [x] #5 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

