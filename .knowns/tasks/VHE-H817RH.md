---
id: VHE-H817RH
title: Implement Auto-Claim automation for Mail rewards, Battle Reports, and Completed Quests
status: done
priority: high
labels: []
createdAt: '2026-11-02T16:41:32.493Z'
updatedAt: '2026-11-02T16:51:25.029Z'
completedAt: '2026-11-02T16:51:25.029Z'
timeSpent: 0
---
# Implement Auto-Claim automation for Mail rewards, Battle Reports, and Completed Quests

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add Auto-Claim controls and pending counter in popup UI
- [x] #2 Implement auto-claim RPC dispatcher in popup.js (mailFarm, readAndClaimAll, quest_multiFarm)
- [x] #3 Update unit tests in tests/events-ui.test.mjs
- [x] #4 Verify build and all unit tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add pending claim detection (getPendingClaims) for mail letters, battle reports, and completed quests.
<!-- SECTION:PLAN:END -->

