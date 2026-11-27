---
id: VHE-H4TMDB
title: 'P1-21: Autopilot Skip Done/Unwinnable Activities & Accurate Card States'
status: done
priority: high
labels:
  - autopilot
  - bug
  - p1
createdAt: '2026-11-27T14:07:34.635Z'
updatedAt: '2026-11-27T14:09:37.842Z'
completedAt: '2026-11-27T14:09:37.842Z'
timeSpent: 0
---
# P1-21: Autopilot Skip Done/Unwinnable Activities & Accurate Card States

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure Tower (floor 23 boss cleared), Dungeon (exhausted/unwinnable), Expeditions (done/waiting), Freebies, and Quests are never re-run when done, and prevent mergeActivityWithAutopilotState from forcing false DONE labels on pending cards
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P1-21: towerActivityState checks all today entries for floor 23 boss clear, dungeonActivityState + DungeonModal mark exhausted/unwinnable floors done, isDailyActivityAlreadyDone covers all activities (including expeditions done/waiting, freebies, quests) in both startAutopilot and runSingleStep, and mergeActivityWithAutopilotState preserves done/pending card states accurately.
<!-- SECTION:NOTES:END -->

