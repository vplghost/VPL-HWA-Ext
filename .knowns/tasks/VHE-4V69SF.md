---
id: VHE-4V69SF
title: Improve Brigand team and Campaign mission selectors
status: done
priority: medium
labels: []
createdAt: '2026-11-13T18:27:37.927Z'
updatedAt: '2026-11-13T18:38:21.177Z'
completedAt: '2026-11-13T18:38:21.142Z'
timeSpent: 637
---
# Improve Brigand team and Campaign mission selectors

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Brigand individual hero picking with raid/monster-style saved-team selection and preview. Campaign uses chapter-name then mission dropdowns, five most recently successfully farmed missions without target item, and image/name drop previews on hover.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Brigand uses saved teams with preview and remembered choice, without individual hero picking.
- [x] #2 Campaign supports chapter-name then mission selection and five persisted recent successful farms when no target is selected.
- [x] #3 Mission hover previews show verified drop names/images, preserve attempt/target restrictions, and checks/build pass before commit.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect team selector patterns, campaign metadata and successful-raid result paths. 2. Reuse saved-team previews and implement accessible chapter/mission selection with drop previews and persisted recent successes. 3. Verify behavior, document release, version/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Brigand now reuses shared teamOptions (server/custom/lowest-power) plus current globalMapCamp team, restores legacy custom IDs to prefixed IDs, and shows read-only avatar/name/hover previews. Removed individual hero toggling; pending attacks lock selection. CampaignMissionPicker provides named LIB_WORLD_<id> chapters and LIB_MISSION_NAME_<id> missions, keyboard navigation, focus restoration and exhausted-attempt guards. MissionDropTooltip uses rich BaseTooltip slots with local images/name fallbacks for dropdown rows and recommended/recent chips. Existing target restrictions and recipe farming retained; closing/reopening without a target clears stale target context. useCampaignMissionHistory stores five unique successful farms per account, merges late reads and serializes writes; queued/rejected requests do not enter history. Generate reproducibly with npm run campaign:picker -- <current capture>; requires cached splitlib and locale, verifies recorded size/MD5 before reading mission.json and locale. src/data/campaign-picker.json records source hashes and contains13chapters/190missions, including positive-chance gear, scroll, soulstone and consumable drops. Source chapter keys LIB_WORLD differ from unrelated CAMPAIGN_CHAPTER_NAME keys. Review PASS P1=0/P2=0/P3=0. Final698tests:686pass,0fail,12optional skips; typecheck and production build0.10.72 passed. System Decision Impact: none — applies existing account-scoped preferences, shared team normalization and verified build-time metadata conventions to these dialogs; global RPC settings/contracts unchanged.
<!-- SECTION:NOTES:END -->

