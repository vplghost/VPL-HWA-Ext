---
id: VHE-3HCYEV
title: 'Hero dialog: add Campaign Raid soul stone farm bridge and multi-campaign raid loop'
status: done
priority: high
labels:
  - hero,campaign,raid,soul-stone
createdAt: '2026-11-20T09:08:21.729Z'
updatedAt: '2026-11-20T09:23:40.464Z'
completedAt: '2026-11-20T09:23:40.464Z'
timeSpent: 0
assignee: '@me'
---
# Hero dialog: add Campaign Raid soul stone farm bridge and multi-campaign raid loop

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add soul stone farm icon button to HeroDetailModal next to soul stone progress opening CampaignRaidModal with soul mode
- [x] #2 Display hero soul stone campaign candidate missions sorted ascending by mission ID with remaining tries and costs
- [x] #3 Implement multi-campaign raid all loop executing raidable soul missions in ascending order up to daily limits and available energy
- [x] #4 Track and merge fragmentHero drops into local inventory and raid result accumulator
- [x] #5 Targeted unit tests and extension build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add getHeroSoulMissions helper in campaignData. 2. Support campaignFarmMode in useModals and add add-button bridge in HeroDetailModal next to soul stone info. 3. Implement soul stone farm mode and multi-campaign sequential raid all loop in CampaignRaidModal. 4. Track and merge fragmentHero drops into inventory and drops accumulator. 5. Write targeted unit tests and verify build.
<!-- SECTION:PLAN:END -->

