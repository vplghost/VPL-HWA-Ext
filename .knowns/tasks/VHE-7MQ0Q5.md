---
id: VHE-7MQ0Q5
title: 'Phase 3.3: Migrate Auto Gathering and Smart Gathering controllers to typed TypeScript services'
status: done
priority: high
labels:
  - refactor
  - typescript
  - phase-3
createdAt: '2026-11-15T15:19:34.717Z'
updatedAt: '2026-11-15T15:25:59.694Z'
completedAt: '2026-11-15T15:25:59.694Z'
timeSpent: 0
assignee: '@me'
---
# Phase 3.3: Migrate Auto Gathering and Smart Gathering controllers to typed TypeScript services

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate auto-gather.js, smart-gather.js, and smart-gather-data.js to typed TypeScript modules and services in src/services/queues/ and src/data/ with global fallbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define TypeScript interfaces for Auto Gather and Smart Gather state, settings, and plans
- [x] #2 Create typed src/data/smartGatherData.ts with mine configs and daily chain data
- [x] #3 Create typed src/services/queues/autoGather.ts and smartGather.ts with global fallbacks
- [x] #4 Create unit test suite covering auto gather and smart gather services
- [x] #5 Verify all tests pass, typecheck passes, build succeeds, bump version, and update changelog
<!-- AC:END -->

