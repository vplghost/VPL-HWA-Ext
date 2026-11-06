---
id: VHE-RKR0TA
title: Fix raid queue running only one round
status: done
priority: high
labels:
  - raid,bug
createdAt: '2026-11-06T14:30:22.931Z'
updatedAt: '2026-11-06T14:31:34.852Z'
completedAt: '2026-11-06T14:31:34.852Z'
timeSpent: 0
---
# Fix raid queue running only one round

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Captured log confirms one rally win and squad return, with no second rally. Controller replay continues when count exceeds one; popup defaults queue count to one and reads stored value.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Start raid queue requires at least two rounds and clearly reports invalid input
- [x] #2 Queue uses the live number input value when starting
- [x] #3 Captured win and return events continue a multi-round queue
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Set queue default to two, read and validate live input on click, add focused UI/controller regression checks, run project validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replay of captured mobRallyAttackResult and returnFromMobCompleted enters refreshing with count=3. Popup previously defaulted raidCount=1; queue now defaults/migrates to 2, reads the live input and rejects values outside 2-100. npm run check passed 298 tests and built 0.9.84.
<!-- SECTION:NOTES:END -->

