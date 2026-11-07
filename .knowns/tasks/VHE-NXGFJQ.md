---
id: VHE-NXGFJQ
title: Place Gathering and Monster beside Raid on Dashboard
status: done
priority: medium
labels: []
createdAt: '2026-11-07T12:32:27.347Z'
updatedAt: '2026-11-07T12:33:28.450Z'
completedAt: '2026-11-07T12:33:28.450Z'
timeSpent: 0
---
# Place Gathering and Monster beside Raid on Dashboard

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard shows Raid, Gathering, and Monster buttons together, with no Gathering or Monster buttons in the header.
- [x] #2 Each button opens its existing dialog and feature tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move both triggers into renderDashboard beside Raid, remove header controls and old listeners, adjust UI tests, run tests and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved dashboard dialog triggers beside Raid; removed header buttons and former global listeners. Focused UI test verifies order, accessibility targets, and dialog open behavior.

Focused UI test: 4 passed; node --check popup.js passed; npm run build produced 0.9.102. System Decision Impact: none; button placement only.
<!-- SECTION:NOTES:END -->

