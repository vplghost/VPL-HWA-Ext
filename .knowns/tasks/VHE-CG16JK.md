---
id: VHE-CG16JK
title: 'Phase 2.1: Migrate March Rules, Tracking Filter, and Mission Costs to typed TypeScript modules'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-2
createdAt: '2026-11-15T14:14:51.257Z'
updatedAt: '2026-11-15T14:19:11.532Z'
completedAt: '2026-11-15T14:19:11.532Z'
timeSpent: 0
assignee: '@me'
---
# Phase 2.1: Migrate March Rules, Tracking Filter, and Mission Costs to typed TypeScript modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate march rules, route speeds, rally targets, tracking URL filter, and mission energy costs from legacy JavaScript to typed TypeScript modules with 100% backward compatibility.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for March Rules, Route Speeds, and Tracking Filters
- [x] #2 Create src/utils/marchRules.ts, src/utils/trackingFilter.ts, and src/data/missionCostData.ts with backward-compatible global fallbacks
- [x] #3 Update consuming extension scripts and Vue components to use the typed utilities
- [x] #4 Create comprehensive unit test suite tests/march-rules-tracking-filter.test.mjs
- [x] #5 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

