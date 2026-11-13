---
id: VHE-3XG8MM
title: Compact raid auto-cancel member threshold controls
status: done
priority: medium
labels: []
createdAt: '2026-11-13T13:04:19.037Z'
updatedAt: '2026-11-13T13:05:10.269Z'
completedAt: '2026-11-13T13:05:10.269Z'
timeSpent: 28
---
# Compact raid auto-cancel member threshold controls

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Combine auto-cancel checkbox and minimum-member number field into a compact input group with a short label; preserve current save and auto-raid option behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Auto-cancel checkbox and member threshold share one compact input group; label is shorter while final-ten-second behavior remains clear.
- [x] #2 Existing bindings and preference saving remain intact; typecheck, relevant tests and build pass; version/changelog and commit completed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace the minimum-members field with the grouped control, remove the standalone checkbox row, verify existing Raid tests/typecheck/build, update release changelog and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Grouped existing autoCancel checkbox and raid-min-members input in one bordered row, shortened label to Auto-cancel · last 10s, retained range1–6, both savePreferences handlers and explanatory title. Removed standalone checkbox row. Verification: 52 relevant Raid/frontend tests passed, vue-tsc and WXT production build passed; git diff check clean. Release0.10.57 with matching source/package/lock/dist versions and changelog prepared for authorized commit.
System Decision Impact: none — compact presentation change only; existing raid cancellation behavior and settings are unchanged.
<!-- SECTION:NOTES:END -->

