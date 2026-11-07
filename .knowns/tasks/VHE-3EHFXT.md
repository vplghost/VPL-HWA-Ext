---
id: VHE-3EHFXT
title: Polish raid dialog controls and show confirmed wins immediately
status: done
priority: medium
labels: []
createdAt: '2026-11-07T05:14:03.776Z'
updatedAt: '2026-11-07T05:15:21.048Z'
completedAt: '2026-11-07T05:15:21.048Z'
timeSpent: 41
---
# Polish raid dialog controls and show confirmed wins immediately

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Group boss level/Find, align control heights, inline lineup/target info and compact troop refresh; fix win display lag while troops return.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Raid controls align and information is inline as requested.
- [x] #2 Confirmed wins show immediately and do not double count on return or duplicate result.
- [x] #3 Tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Standardize raid control heights, group boss selector/Find, inline descriptive labels and troop refresh icon. 2. Separate displayed confirmed wins from return-completed cycles. 3. Test win/return/duplicate behavior and render smoke; build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Standardized dialog selects/inputs/buttons to h-10 and line-height 5; boss level and Find share a bordered control group. Selected hero names now appear inline with Lineup; search summary inline with Target; troop total and accessible size-5 refresh icon share a row. Won display now uses confirmedWins: completed return cycles plus current confirmed win; next raid still waits for return. Added duplicate win/return regression; 65 targeted tests and runtime DOM rendering smoke pass; build 0.9.99 passes. System Decision Impact: none — layout correction and displayed counter accuracy; dispatch/queue progression contract unchanged.
<!-- SECTION:NOTES:END -->

