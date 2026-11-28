---
id: VHE-4Z6JWT
title: 'P2-55: Auto-Gather Full Max-Marches Troop Split, 5% Daily Margin & Weighted Stock Mine Selection'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T16:43:07.731Z'
updatedAt: '2026-11-28T16:46:28.695Z'
completedAt: '2026-11-28T16:46:28.695Z'
timeSpent: 0
---
# P2-55: Auto-Gather Full Max-Marches Troop Split, 5% Daily Margin & Weighted Stock Mine Selection

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Respect user Max Gathering Marches in computeBalancedGatherAllocation (remove maxMarches-1 cap), raise dailyPlan margin to 5% (105%), replace fixed rotation with capacity-weighted stock balancing (city non-chest stock + in-flight gathering/marching amounts * RESOURCE_CARGO_WEIGHT), and preserve resumePlan priority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 computeBalancedGatherAllocation splits (totalTroops - reserve) / effectiveMaxMarches across all effectiveMaxMarches slots without capping at maxMarches-1
- [x] #2 dailyPlan uses 5% margin (105%) with immediate recall on completion and resumePlan retains top priority for Raid/Monster interrupted mines
- [x] #3 selectBalancedResourceType selects lowest (cityStock + inFlightAmount) * RESOURCE_CARGO_WEIGHT including marching/gathering/returning marches (excluding chests)
- [x] #4 Unit tests, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-55 (v0.11.411): computeBalancedGatherAllocation respects full user effectiveMaxMarches, dailyPlan uses 5% margin (105%) with immediate recall, selectBalancedResourceType picks lowest (cityStock + inFlight) * RESOURCE_CARGO_WEIGHT including marching/gathering/returning marches, and resumePlan retains top priority. Verified: 1,426 pass / 0 fail, dual build pass.
<!-- SECTION:NOTES:END -->

