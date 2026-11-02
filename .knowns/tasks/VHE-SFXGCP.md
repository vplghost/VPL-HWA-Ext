---
id: VHE-SFXGCP
title: Fix challenge resource stock zero inventory resolution for summoning and elemental spheres
status: done
priority: high
labels: []
createdAt: '2026-11-02T15:47:13.856Z'
updatedAt: '2026-11-02T15:50:44.353Z'
completedAt: '2026-11-02T15:50:44.353Z'
timeSpent: 0
---
# Fix challenge resource stock zero inventory resolution for summoning and elemental spheres

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prioritize inventoryGet over fallback cache and handle 0/absent item counts correctly
- [x] #2 Update getChallengeResourceStock in popup-data.js to accurately resolve 0 inventory for Summoning Sphere (coin 13) and Elemental Sphere (consumable 46)
- [x] #3 Synchronize resource entries in rpc-cache.js on inventoryGet so missing items are zeroed out
- [x] #4 Verify all unit tests pass and add tests for 0-inventory stock resolution
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved zero inventory stock resolution for Summoning Sphere and Elemental Sphere. Tested popup-data and rpc-cache synchronization.
<!-- SECTION:NOTES:END -->

