---
id: VHE-H21N2H
title: Track Wheel of Fortune free spin, Legend Draft coin deduction, and Shop purchase updates
status: done
priority: medium
labels: []
createdAt: '2026-11-02T23:51:44.250Z'
updatedAt: '2026-11-06T10:31:34.802Z'
completedAt: '2026-11-02T23:52:51.355Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:34.802Z'
---
# Track Wheel of Fortune free spin, Legend Draft coin deduction, and Shop purchase updates

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tracked Wheel of Fortune (Emerald Exchange) free spin availability and nextResetTs countdown timer in userGetInfo and marked used in alchemyUseFree. Deducted Legend Draft chip in randomDraft_register (chip:80) and reset draft status on match start. Synchronized inventory and resource caches on shopBuy. Version bumped to v0.9.32.

Backlog disposition 2026-11-06 (@task-VHE-MRH4NM): Wheel tracking portion is explicitly shelved by @task-VHE-8D82V9; do not resume it during backlog cleanup. Draft coin/shop portions remain covered by rpc-cache tests.
<!-- SECTION:NOTES:END -->

