---
id: VHE-AA50M9
title: Add Titan Dungeon FAB dialog shortcut
status: done
priority: high
labels:
  - titan-dungeon,fab,dialog
createdAt: '2026-11-03T17:21:05.174Z'
updatedAt: '2026-11-06T10:31:32.692Z'
completedAt: '2026-11-03T17:22:24.515Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:32.692Z'
---
# Add Titan Dungeon FAB dialog shortcut

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the existing Titan Dungeon detail dialog from a sub-FAB above the Tower FAB and populate it from dungeonGetInfo snapshots.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Titan Dungeon sub-FAB appears directly above the Tower FAB and opens the details dialog.
- [x] #2 dungeonGetInfo snapshots populate current floor, progression, checkpoint, element, door, and titan state fields in the passive cache.
- [x] #3 Existing Events card remains able to open the dialog; closing works from button, backdrop, and Escape.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract dungeonGetInfo response fields into dungeonStatus while preserving action snapshots. 2. Add an accessible Titan Dungeon sub-FAB above Tower and wire it to the existing dialog. 3. Build the extension and inspect the resulting diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added dungeonGetInfo cache extraction with numeric normalization and preserved the latest valid progress when failed battle responses omit a dungeon snapshot. Added an accessible Titan Dungeon sub-FAB above Tower wired to the existing detail dialog; retained the Events card opener. node --check passed for updated JavaScript; npm run build passed and generated version 0.9.46. Full tests not run per session instruction. System Decision Impact: none — this exposes observed passive dungeon data and introduces no durable project policy.
<!-- SECTION:NOTES:END -->

