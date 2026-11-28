---
id: VHE-JH15YK
title: 'P2-53: Brigand Camp Dialog UI Polish — Header Cost Pill, 3-Column Camp Grid & Horizontal Icon Rewards'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T12:25:04.489Z'
updatedAt: '2026-11-28T12:25:34.533Z'
completedAt: '2026-11-28T12:25:34.533Z'
timeSpent: 0
---
# P2-53: Brigand Camp Dialog UI Polish — Header Cost Pill, 3-Column Camp Grid & Horizontal Icon Rewards

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove redundant World Energy banner in BrigandCampModal.vue, move energy cost and sync action to dialog header slots, switch camp list to compact 3-column grid without repeated energy text, and display last battle rewards horizontally with icons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 BrigandCampModal uses #header-status (#brigand-header-cost-pill) and #header-actions (#brigand-sync-btn) and removes the body World Energy banner
- [x] #2 Camp list (#brigand-camp-list) uses 3-column grid (sm:grid-cols-3) without repeated World Energy text per card
- [x] #3 Last battle result (#brigand-last-result) renders horizontal icon reward pills (#brigand-rewards-list) with 100% English UI
- [x] #4 tests/brigand-camp.test.mjs, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-53 (v0.11.405): removed redundant World Energy banner in BrigandCampModal.vue, moved cost & sync to header slots, switched #brigand-camp-list to 3-column grid without energy text spam, and rendered horizontal icon reward pills in #brigand-last-result. Verified: 1,413 pass / 0 fail, dual build pass.
<!-- SECTION:NOTES:END -->

