---
id: VHE-443GA7
title: Move raid controls into dashboard dialog
status: done
priority: medium
labels: []
createdAt: '2026-11-07T04:12:48.235Z'
updatedAt: '2026-11-07T04:14:23.796Z'
completedAt: '2026-11-07T04:14:23.796Z'
timeSpent: 85
---
# Move raid controls into dashboard dialog

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dashboard Raid button opens rally dialog; compact boss/find/target and wait/members/count rows with spaced start buttons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard Raid button opens and closes a live rally dialog.
- [x] #2 Requested compact rows and separated start actions are present.
- [x] #3 Checks and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse raid rendering in a dedicated native dialog with dashboard entry and live refresh. 2. Arrange boss/find/target and wait/member/count rows; space start actions. 3. Verify syntax, relevant UI/queue tests and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved rally rendering to native modal dialog opened by Dashboard Raid button, with native close/Escape/focus management. Live cache renders refresh the open dialog. Experimental retains gathering only. Grouped boss level/Find/Target and wait/minimum members/raid count in three-column rows; start controls share flex gap-4 and label Start queue. 54 targeted UI/data/queue tests pass; runtime DOM smoke passes populated and empty snapshots, control grouping, enabled states and isolated dialog rendering; build 0.9.98 passes. System Decision Impact: none — bounded UI placement/layout change; queue and RPC contracts unchanged.
<!-- SECTION:NOTES:END -->

