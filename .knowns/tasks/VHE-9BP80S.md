---
id: VHE-9BP80S
title: 'Phase 3.1: Migrate Building Queue and Research Queue controllers to typed TypeScript services'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-3
createdAt: '2026-11-15T14:42:26.894Z'
updatedAt: '2026-11-15T14:54:34.763Z'
completedAt: '2026-11-15T14:54:34.763Z'
timeSpent: 0
assignee: '@me'
---
# Phase 3.1: Migrate Building Queue and Research Queue controllers to typed TypeScript services

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate building-queue.js and research-queue.js to typed TypeScript queue controllers in src/services/queues/ with simulation, timeline, eligible candidates, and dispatch planning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for Building and Research Queue items, state, and timeline
- [x] #2 Create typed src/services/queues/buildingQueue.ts and src/services/queues/researchQueue.ts with global fallbacks
- [x] #3 Update BuildingModal.vue and ResearchModal.vue to consume typed queue controllers
- [x] #4 Create comprehensive unit test suite covering building and research queue services
- [x] #5 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

