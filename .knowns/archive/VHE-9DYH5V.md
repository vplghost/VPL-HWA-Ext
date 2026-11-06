---
id: VHE-9DYH5V
title: Titan Dungeon tracking, detail modal, and bridge context invalidation recovery
status: done
priority: high
labels:
  - dungeon
  - bridge
  - events
createdAt: '2026-11-02T05:50:04.077Z'
updatedAt: '2026-11-06T10:31:32.518Z'
completedAt: '2026-11-02T05:50:09.029Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:32.518Z'
---
# Titan Dungeon tracking, detail modal, and bridge context invalidation recovery

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catch extension context invalidated in bridge and prompt page refresh
- [x] #2 Extract dungeonEndBattle, dungeonSaveProgress, and inventory_use in rpc-cache
- [x] #3 Update titan potions, titan soul fragments, and gold rewards from dungeon battles
- [x] #4 Render Titan Dungeon event card in Events tab and open detailed modal dialog
- [x] #5 Display current floor, cleared floors, checkpoint, prime elements, floor doors, and titan HP/energy status
- [x] #6 All unit tests pass and extension builds cleanly
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified context-invalidation recovery, dungeonEndBattle/dungeonSaveProgress/inventory_use reducers and reward balances, Events card and Dungeon modal floor/checkpoint/elements/doors/titan state. Evidence: bridge, rpc-cache, events-ui tests. Full suite: 283 passed, 10 explicitly optional historical trace replays skipped; 0 failures. Build is verified in final audit pass, not claimed as a live browser test. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

