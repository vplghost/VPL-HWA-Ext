---
id: VHE-H21N2H
title: Track Wheel of Fortune free spin, Legend Draft coin deduction, and Shop purchase updates
status: done
priority: medium
labels: []
createdAt: '2026-11-02T23:51:44.250Z'
updatedAt: '2026-11-02T23:52:51.355Z'
completedAt: '2026-11-02T23:52:51.355Z'
timeSpent: 0
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
<!-- SECTION:NOTES:END -->

