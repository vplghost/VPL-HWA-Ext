---
id: VHE-BTR30J
title: Sync research start and raid World Energy from live RPC
status: done
priority: high
labels: []
createdAt: '2026-11-01T12:45:28.990Z'
updatedAt: '2026-11-06T10:31:33.024Z'
completedAt: '2026-11-01T12:48:09.324Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:33.024Z'
---
# Sync research start and raid World Energy from live RPC

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Research countdown updates when startResearch succeeds and clears on completeResearch
- [x] #2 World Energy decreases when raid creation succeeds and is refunded on successful cancellation
- [x] #3 Later API refillable snapshots remain authoritative; duplicate and failed action records do not double count
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect action logs and authoritative mob cost; update RPC cache event handling; add regression tests; validate build and commit
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validated with 37 passing tests and extension build; game config globalMapMobRally on 2026-11-01 sets 25 World Energy for every rally boss.
<!-- SECTION:NOTES:END -->

