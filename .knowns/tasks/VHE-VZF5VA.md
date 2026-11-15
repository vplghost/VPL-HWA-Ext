---
id: VHE-VZF5VA
title: 'Phase 3.2: Migrate Raid Queue, Monster Queue, and Raid Energy Auto controllers to typed TypeScript services'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-3
createdAt: '2026-11-15T14:55:42.587Z'
updatedAt: '2026-11-15T15:03:05.844Z'
completedAt: '2026-11-15T15:03:05.844Z'
timeSpent: 0
assignee: '@me'
---
# Phase 3.2: Migrate Raid Queue, Monster Queue, and Raid Energy Auto controllers to typed TypeScript services

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate raid-queue.js, monster-queue.js, and raid-energy-auto.js to typed TypeScript services in src/services/queues/ with state management, planning, and global fallbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for Raid Queue, Monster Queue, and Raid Energy Auto
- [x] #2 Create typed src/services/queues/raidQueue.ts, monsterQueue.ts, and raidEnergyAuto.ts
- [x] #3 Maintain backward compatibility global fallbacks on globalThis
- [x] #4 Create unit test suite covering raid, monster, and raid energy auto services
- [x] #5 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

