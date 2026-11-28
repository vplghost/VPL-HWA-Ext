---
id: VHE-Z08Q56
title: 'P2-54: Auto-Gather Balanced Troop Split Allocation (Total - Reserve) / (MaxMarches - 1)'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T12:48:08.133Z'
updatedAt: '2026-11-28T12:51:01.022Z'
completedAt: '2026-11-28T12:51:01.022Z'
timeSpent: 0
---
# P2-54: Auto-Gather Balanced Troop Split Allocation (Total - Reserve) / (MaxMarches - 1)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When total army minus reserve cannot fill all maxMarches, evenly split gatherable troops across (maxMarches - 1) marches to balance travel/collection time and keep 1 march slot open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 computeBalancedGatherAllocation splits (totalTroops - reserve) / (maxMarches - 1) evenly across (maxMarches - 1) marches when constrained, keeps full allocation when unconstrained or maxMarches === 1
- [x] #2 planAutoGather enforces targetSlots = maxMarches - 1 and caps both standard and optimized squad allocations at dispatchCap while preserving reserveTroops
- [x] #3 Unit tests, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-54 (v0.11.408): computeBalancedGatherAllocation in autoGather.ts + maxTroopBudget support in mineData.ts. Evenly splits (totalTroops - reserve) / (maxMarches - 1) across (maxMarches - 1) marches when constrained. Verified: 1,415 pass / 0 fail, dual build pass.
<!-- SECTION:NOTES:END -->

