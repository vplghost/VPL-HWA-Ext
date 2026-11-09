---
id: VHE-V68GQ2
title: Farm equipment items via campaign mission raid
status: done
priority: medium
labels:
  - campaign
  - equipment
  - raid
  - farm
createdAt: '2026-11-09T13:21:16.561Z'
updatedAt: '2026-11-09T13:34:38.139Z'
completedAt: '2026-11-09T13:34:38.139Z'
timeSpent: 0
assignee: '@me'
---
# Farm equipment items via campaign mission raid

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 User can trigger campaign raid for a specific mission ID with chosen repeat times
- [x] #2 Background dispatches missionRaid with playable_getAvailable and worldStars_getAvailable
- [x] #3 Auto-craft fragments and recipe can be executed when components are ready
- [x] #4 UI supports quick farm of gear items with status feedback
- [x] #5 Tests verify missionRaid dispatch, drop parsing, and craft actions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add background handlers for campaign-raid, craft-fragment, and craft-recipe
2. Extend rpc-cache to process inventoryCraftFragments, inventoryCraftRecipe, and mission drop tracking
3. Implement Campaign Raid & Equipment Crafting UI card in popup.js with mission selector, times, drop feedback, and craft triggers
4. Add comprehensive unit tests in tests/campaign-raid.test.mjs
5. Run full test suite and build extension via npm run check
<!-- SECTION:PLAN:END -->

