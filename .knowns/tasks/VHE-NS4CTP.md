---
id: VHE-NS4CTP
title: 'P1-20: Fix Dashboard Auto-Join Stats Stuck at 200 Ext / 1 Game'
status: done
priority: high
labels:
  - dashboard
  - bug
  - p1
createdAt: '2026-11-27T12:56:50.175Z'
updatedAt: '2026-11-27T12:58:41.418Z'
completedAt: '2026-11-27T12:58:41.418Z'
timeSpent: 0
---
# P1-20: Fix Dashboard Auto-Join Stats Stuck at 200 Ext / 1 Game

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace untimestamped 200-cap priorityAutoJoinedRallies.data.length with UTC-day dailyCounts, recover accurate gameAutoJoinCount, and self-heal stale dailyActivityHistory entries via autoJoinV2 flag
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P1-20: recordPriorityAutoJoinDaily UTC-day dailyCounts (7-day prune, deduplicated), removed untimestamped 200-cap data.length from getTodayActivityStats, restored accurate gameAutoJoinCount, and added autoJoinV2 self-healing for stale dailyActivityHistory entries.
<!-- SECTION:NOTES:END -->

