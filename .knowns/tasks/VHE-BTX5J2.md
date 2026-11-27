---
id: VHE-BTX5J2
title: 'Optimize Titan Dungeon Modal layout stability, compact Element Affinities & floating Combat Log Hover Card (p2-34)'
status: done
priority: medium
labels:
  - ui,ux,dungeon,p2-34
createdAt: '2026-11-27T04:37:59.709Z'
updatedAt: '2026-11-27T04:42:20.759Z'
completedAt: '2026-11-27T04:42:20.759Z'
timeSpent: 0
---
# Optimize Titan Dungeon Modal layout stability, compact Element Affinities & floating Combat Log Hover Card (p2-34)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 DungeonModal DOM order is Overview Stats -> #dungeon-element-affinities -> #dungeon-auto-config-bar -> #dungeon-battle-status-slot -> #dungeon-doors-section -> #dungeon-combat-log-section
- [x] #2 #dungeon-element-affinities renders on a single compact horizontal bar for Prime & Non-Prime elements
- [x] #3 #dungeon-log-card-tooltip renders via Teleport to body with fixed viewport-aware positioning (zero layout shift on hover/focus)
- [x] #4 Unit tests and full build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p2-34: reordered DungeonModal sections (Overview -> single-line Element Affinities -> Auto Config -> Battle Status/Outcome slot -> Floor Doors -> Combat Log) and converted Combat Log detail panel into a viewport-aware fixed floating hover card inside Teleport to body. Verified 1345 pass / 0 fail.
<!-- SECTION:NOTES:END -->

