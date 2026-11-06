---
id: VHE-4VAA2V
title: Resolve Legend Draft false lock, display 15-hero candidate matrix for calculation, and poll canvas engine status
status: done
priority: high
labels: []
createdAt: '2026-11-02T16:02:13.621Z'
updatedAt: '2026-11-06T10:31:31.821Z'
completedAt: '2026-11-02T16:18:21.373Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:31.821Z'
---
# Resolve Legend Draft false lock, display 15-hero candidate matrix for calculation, and poll canvas engine status

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reset draft picks on new match or stage 1/2 so defense is not falsely locked at match start
- [x] #2 Always display the 15-hero candidate matrix in Legend Draft with hero power, star, role, and swap selector
- [x] #3 Persist custom draft candidate matrices to chrome.storage.local
- [x] #4 Poll canvas and report engine status on RPC traffic in intercept.js
- [x] #5 Ensure all unit tests pass and build extension
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved Legend Draft false lock on match start, kept 15 candidate heroes matrix always visible for calculations with hero stats, power, stars, and swap search. Added periodic canvas polling and RPC traffic reporting for engine status.
<!-- SECTION:NOTES:END -->

