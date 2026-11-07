---
id: VHE-NT1AZC
title: Manage custom raid and farm teams and select available lowest-power heroes
status: in-review
priority: medium
labels: []
createdAt: '2026-11-07T02:08:16.487Z'
updatedAt: '2026-11-07T02:10:51.617Z'
timeSpent: 120
---
# Manage custom raid and farm teams and select available lowest-power heroes

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add local custom team CRUD separate from synced game teams; prioritize custom teams in raid/farm selectors; lowest-five selection must consider hero availability.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Custom teams can be created, edited and deleted independently of game synced teams.
- [x] #2 Raid and farm dropdowns show custom teams first.
- [x] #3 Lowest-power lineup selects only available heroes and refreshes at selection/dispatch.
- [ ] #4 Regression tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect team storage, dropdowns, and hero availability. 2. Add persistent account-local custom team CRUD and custom-first raid/farm options. 3. Resolve lowest-five from currently available heroes on selection and dispatch. 4. Add regression tests and run checks/build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented account-local custom team CRUD in Teams, custom-first raid/farm dropdowns, deployment-aware weakest-five resolution on selection, gathering dispatch and raid roster refresh. Verification: 53 targeted tests pass; all available suites excluding quest-data.test.mjs pass (306 pass, 10 optional trace skips); build 0.9.95 passes. Full npm run check blocked only by pre-existing missing temp/tracking-data/hwa-game-record-202611062259_start.json used by quest-data.test.mjs. AC4 remains unchecked because full suite cannot pass without private fixture. System Decision Impact: candidate @decision/20261107-0910-custom-raid-and-farm-teams-are-local-per-account-and-precede-synced-teams (added) — account-local storage and selector availability behavior.
<!-- SECTION:NOTES:END -->

