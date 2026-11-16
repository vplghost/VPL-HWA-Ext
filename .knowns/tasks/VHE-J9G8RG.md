---
id: VHE-J9G8RG
title: Migrate automation and queue unit tests to import TypeScript services directly in-progress
status: done
priority: high
labels:
  - typescript,tests,refactor
createdAt: '2026-11-16T04:26:43.134Z'
updatedAt: '2026-11-16T04:33:47.993Z'
completedAt: '2026-11-16T04:33:47.993Z'
timeSpent: 0
assignee: '-s'
---
# Migrate automation and queue unit tests to import TypeScript services directly in-progress

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate tests for smart-gather, auto-gather, building-queue, research-queue, and raid-queue to import from src/services/queues/*.ts, eliminating the dual-maintenance requirement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Migrate tests/smart-gather.test.mjs and tests/auto-gather.test.mjs to import TypeScript queue services
- [x] #2 Migrate tests/building-queue.test.mjs and tests/research-queue.test.mjs to import TypeScript queue services
- [x] #3 Verify all unit tests pass with zero regressions
<!-- AC:END -->

