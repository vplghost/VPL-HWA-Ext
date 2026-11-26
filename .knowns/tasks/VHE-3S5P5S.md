---
id: VHE-3S5P5S
title: Fix Monster Queue MobNotFound retry, stale cache TTL, and dead target eviction (p1-16)
status: done
priority: high
labels:
  - bugfix,monster-queue,p1-16
createdAt: '2026-11-26T17:38:18.514Z'
updatedAt: '2026-11-26T17:40:42.091Z'
completedAt: '2026-11-26T17:40:42.091Z'
timeSpent: 0
---
# Fix Monster Queue MobNotFound retry, stale cache TTL, and dead target eviction (p1-16)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 monsterQueueService.advance auto-retries via fresh searchMob on MobNotFound with 5-error cap and immediate stop on energy errors
- [x] #2 monsterQueueService.start checks 5-minute TTL on experimentalSoloSearch and auto-searches when cache is missing/stale/mismatched
- [x] #3 rpcCache evicts dead mobId from experimentalSoloSearch/experimentalRallySearch on MobNotFound
- [x] #4 MonsterModal allows 1-click start without blocking on empty/evicted foundMonsters
- [x] #5 Unit tests and full build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p1-16: monsterQueueService auto-retries MobNotFound via fresh searchMob (5-error cap, instant energy stop), start() enforces 5m TTL and auto-searches on missing/stale cache, rpcCache evicts dead mobIds on MobNotFound for solo & rally searches, and MonsterModal supports 1-click start. Verified 1334 pass / 0 fail.
<!-- SECTION:NOTES:END -->

