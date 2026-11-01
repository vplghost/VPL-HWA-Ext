---
id: VHE-FZRFSN
title: Sync spend and mail rewards from live RPC
status: done
priority: high
labels: []
createdAt: '2026-11-01T13:48:30.950Z'
updatedAt: '2026-11-01T13:51:25.599Z'
completedAt: '2026-11-01T13:51:25.599Z'
timeSpent: 0
---
# Sync spend and mail rewards from live RPC

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Energy updates after successful mission raid and battle actions using mission costs, with refill timer restarted when crossing cap
- [x] #2 Skill Points spend immediately, refill only below soft cap 10, and timer appears in selected resource tooltip
- [x] #3 Claimed mail rewards update observed resource balances without applying twice
- [x] #4 Newer API snapshots remain authoritative and tests, build, docs, and Knowns validation pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify RPC action schemas and mission/refillable config. 2. Extract per-call resource deltas and apply them idempotently against cached snapshots with refill-clock correction. 3. Surface soft cap in UI, document behavior, add focused tests. 4. Run full validation and commit locally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified captured RPC actions: mission id 99 yields 12 Energy total across raid plus battle, 10 successful skill upgrades spend 10 Skill Points, and mail claim yields four material rewards. Added versioned mission-cost map, idempotent delta merge with authoritative snapshots, cap 10 and refill-clock reset. npm run check passed 46/46; knowns validate passed with pre-existing memory warnings.
<!-- SECTION:NOTES:END -->

