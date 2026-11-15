---
id: VHE-NS3A6P
title: 'Phase 1.4: Migrate Quest, Tower, Refillable, and Speedup metadata to typed TypeScript modules'
status: done
priority: high
labels:
  - refactor
  - typescript
  - metadata
  - phase-1
createdAt: '2026-11-15T13:54:20.044Z'
updatedAt: '2026-11-15T14:13:26.491Z'
completedAt: '2026-11-15T14:13:26.491Z'
timeSpent: 0
assignee: '@me'
---
# Phase 1.4: Migrate Quest, Tower, Refillable, and Speedup metadata to typed TypeScript modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate static metadata for Quests, Tower buffs/rules, Refillables, Speedup durations, and Clan Versus rewards from legacy JS to typed TypeScript modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces in src/types/game/ for quest, tower, refillable, speedup, and clan-versus
- [x] #2 Create typed data modules in src/data/ for quest, tower, refillable, speedup, and clan-versus
- [x] #3 Update Vue dialogs, composables, and utils to consume typed data modules
- [x] #4 Add unit test suite tests/quest-tower-refillable-typed-data.test.mjs
- [x] #5 Verify all tests pass, typecheck, build, bump version, and update changelog
<!-- AC:END -->

