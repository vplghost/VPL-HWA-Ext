---
id: VHE-AS3A8C
title: 'Phase 3.4: Migrate Tower and Dungeon automation runners to typed TypeScript services'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-3
createdAt: '2026-11-15T15:27:14.647Z'
updatedAt: '2026-11-15T15:31:46.119Z'
completedAt: '2026-11-15T15:31:46.119Z'
timeSpent: 0
assignee: '@me'
---
# Phase 3.4: Migrate Tower and Dungeon automation runners to typed TypeScript services

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate tower-automation.js, tower-runner.js, dungeon-automation.js, and dungeon-runner.js to typed TypeScript modules and services in src/services/queues/ with global fallbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for Tower and Dungeon automation plans, states, and runners
- [x] #2 Create typed src/services/queues/towerAutomation.ts, towerRunner.ts, dungeonAutomation.ts, dungeonRunner.ts with global fallbacks
- [x] #3 Create unit test suite covering tower and dungeon automation and runners
- [x] #4 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

