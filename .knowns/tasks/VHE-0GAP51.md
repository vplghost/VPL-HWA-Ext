---
id: VHE-0GAP51
title: Use RPC and MQTT quest data across dashboard events and goals
status: done
priority: high
labels:
  - quests
  - mqtt
createdAt: '2026-11-07T00:45:32.790Z'
updatedAt: '2026-11-07T00:54:09.892Z'
completedAt: '2026-11-07T00:54:09.892Z'
timeSpent: 0
---
# Use RPC and MQTT quest data across dashboard events and goals

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard shows actionable daily quests and refreshes from questUpdateAll
- [x] #2 Events and Goals show only active visible quest events and groups
- [x] #3 MQTT specialQuestEvents updates visible progress without a duplicate RPC
- [x] #4 Focused tests and full check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture authoritative daily and timed event snapshots, including view visibility. 2. Reduce full MQTT specialQuestEvents directly and refresh daily/quest RPCs on questUpdateAll. 3. Filter hidden, future, expired and inactive quests consistently in Dashboard, Events and Goals. 4. Replay captured records, test UI and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented quest-data filtering and daily reset handling, direct MQTT specialQuestEvents snapshot reduction, questUpdateAll RPC refresh, and Dashboard/Events/Goals integration. Replay test uses 202611062259 startup trace; npm run check passed 316 tests and built 0.9.93. Hidden view IDs are from game config 1.293.1010 and should be refreshed when that config changes. System Decision Impact: none.
<!-- SECTION:NOTES:END -->

