---
id: VHE-ZT6W4R
title: 'Phase 1.3: Migrate Item, Name Map, and Campaign metadata to typed modules'
status: done
priority: high
labels:
  - migration,phase1,clean-code,metadata
createdAt: '2026-11-15T10:39:06.624Z'
updatedAt: '2026-11-15T10:50:24.139Z'
completedAt: '2026-11-15T10:50:24.139Z'
timeSpent: 0
assignee: '@me'
---
# Phase 1.3: Migrate Item, Name Map, and Campaign metadata to typed modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract extension/item-resources.js, extension/data-names.js, extension/name-map.js, and extension/campaign-missions.js into src/data/ and src/types/game/ with typed helpers, refactoring Vue components and utilities while keeping legacy compatibility.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create typed src/types/game/item.ts and src/types/game/campaign.ts
- [x] #2 Create typed src/data/nameData.ts, src/data/itemData.ts, and src/data/campaignData.ts
- [x] #3 Refactor CampaignRaidModal.vue, CampaignMissionPicker.vue, recipeTree.ts, and resourceData.ts
- [x] #4 Ensure 100% backward compatibility for globalThis and VM test harnesses
- [x] #5 Verify all unit tests pass, typecheck, build, bump version, and update changelog
<!-- AC:END -->

