---
id: VHE-ZFAXZJ
title: Enrich rally marches with target team and leg times
status: done
priority: high
labels: []
createdAt: '2026-11-01T14:21:50.127Z'
updatedAt: '2026-11-01T14:26:52.360Z'
completedAt: '2026-11-01T14:26:52.360Z'
timeSpent: 0
---
# Enrich rally marches with target team and leg times

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A successful createRally immediately shows one rally march with the departing hero and troop team and exact wait timer
- [x] #2 getRallyById enriches only the player's created rally with target name/level and estimated travel and return durations from versioned route configuration
- [x] #3 Later getMarches route timestamps replace estimated leg ETA and cancellation removes the rally, without duplicate badges
- [x] #4 Tooltip distinguishes exact and estimated times; tests, docs, build and validation pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect new createRally/getRallyById data and route configuration. 2. Project compact rally actions and merge with march snapshots by squad/rally ID. 3. Expand tooltip to show target, team, wait, outbound and return legs with estimate labels. 4. Add tests and documentation, verify and commit locally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New log hwa-api-202611012117_rally.json verified: createRally plannedStartTime is 5 min after creation, team heroes/units supplied in request, getRallyById targets PvP Boss level 20. Compact rally action joins by rally/squad ID; straight-line config estimate is ~32 sec outbound and ~42 sec return, clearly marked approximate. Observed getMarches route ETA overrides estimate, cancel removes badge. npm run check 52/52; Knowns validation valid with existing memory warnings.
<!-- SECTION:NOTES:END -->

