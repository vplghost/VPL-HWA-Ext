---
id: VHE-CE8PPK
title: Track gathering spots and return route to clear header icon
status: done
priority: high
labels:
  - gather,marches
createdAt: '2026-11-02T12:16:35.068Z'
updatedAt: '2026-11-02T12:28:06.298Z'
completedAt: '2026-11-02T12:28:06.298Z'
timeSpent: 0
---
# Track gathering spots and return route to clear header icon

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Track attackMine to register active gathering march with mine resource kind, team, and route
- [x] #2 Track stopMineGathering to set return route ETA and transition march to returnToOutpost
- [x] #3 Remove return march icon from header immediately when returnAt reached
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted attackMine, stopMineGathering, searchMine, and getChunks into rpc-cache. Map mineId to mineConfigId/type, register active gathering march with travel & gather stages, and transition to returnToOutpost with exact return route ETA. In popup.js and popup-data.js, evaluate returnAt and auto-remove return march badge when expired.
<!-- SECTION:NOTES:END -->

