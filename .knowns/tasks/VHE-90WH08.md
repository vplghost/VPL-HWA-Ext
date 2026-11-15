---
id: VHE-90WH08
title: 'Phase 2.2: Migrate Free Alchemy, Mine Defense, and Mail Service to typed TypeScript modules'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-2
createdAt: '2026-11-15T14:30:37.697Z'
updatedAt: '2026-11-15T14:36:03.349Z'
completedAt: '2026-11-15T14:36:03.349Z'
timeSpent: 0
assignee: '@me'
---
# Phase 2.2: Migrate Free Alchemy, Mine Defense, and Mail Service to typed TypeScript modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate isolated automation units (free-alchemy.js, mine-defense.js / mine-defense-data.js, mail-data.js) to typed TypeScript modules in src/services/ or src/utils/ with backward-compatible global fallbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for Free Alchemy, Mine Defense, and Mail data structures
- [x] #2 Create typed modules for Free Alchemy, Mine Defense data/logic, and Mail Service
- [x] #3 Update consuming Vue components and background scripts to consume typed modules
- [x] #4 Create comprehensive unit test suite covering migrated services
- [x] #5 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

