---
id: VHE-E8SQ7W
title: Sync item craft and hero equip RPCs with inventory and hero slot reduction
status: done
priority: medium
labels: []
createdAt: '2026-11-12T03:12:47.411Z'
updatedAt: '2026-11-12T03:20:26.869Z'
completedAt: '2026-11-12T03:20:26.869Z'
timeSpent: 0
assignee: '@me'
---
# Sync item craft and hero equip RPCs with inventory and hero slot reduction

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Process heroInsertItem and inventoryCraftFragments/inventoryCraftRecipe in rpc-cache, deduct equipped gear and update hero slots in cache, permit action RPCs in intercept, and allow equipping from HeroDetailModal
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 heroInsertItem reduces heroGetAll slots and inventory gear count in rpc-cache
- [x] #2 heroInsertItem and craft RPCs permitted in intercept helperActionMethods
- [x] #3 HeroDetailModal provides Equip button when gear is present in inventory
- [x] #4 Tests and build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented heroInsertItem RPC extraction and reduction in rpc-cache, updating heroGetAll slots and decrementing inventory gear and resource balances. Allowed heroInsertItem, inventoryCraftFragments, and inventoryCraftRecipe in intercept helperActionMethods. Added Equip button and dispatch handler to HeroDetailModal when items are in inventory. Fixed HeroHoverCard 0-indexed slot resolution. All 506 tests pass and build 0.10.23 succeeded.
<!-- SECTION:NOTES:END -->

