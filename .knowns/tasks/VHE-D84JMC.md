---
id: VHE-D84JMC
title: Fix monster dialog pending search and stale queue status
status: done
priority: high
labels: []
createdAt: '2026-11-07T12:57:01.186Z'
updatedAt: '2026-11-07T12:58:36.417Z'
completedAt: '2026-11-07T12:58:36.417Z'
timeSpent: 0
---
# Fix monster dialog pending search and stale queue status

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A successful solo monster search clears pending RPC state and enables Attack in the open dialog.
- [x] #2 Old stopped queue is labeled as previous and does not imply the current search failed.
- [x] #3 Targeted tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reconcile experimental RPC status in Monster renderer, guard async response race, clarify previous queue label, add UI regression test, run targeted tests and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Captured log contains successful searchMob:mob response with five mobs at 12:54:23.755Z and no attackMob. Root cause: renderMonster never reconciled experimentalPending after experimentalActionStatus updated, leaving Search and Attack disabled; stopped queue message was persisted from prior user cancellation. Shared pending sync now runs in both dialogs; async response guard avoids overwriting a completed status. Previous queue labeled clearly. 329 tests pass; build 0.9.104. System Decision Impact: none.
<!-- SECTION:NOTES:END -->

