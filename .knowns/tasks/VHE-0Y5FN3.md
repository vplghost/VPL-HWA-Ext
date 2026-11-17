---
id: VHE-0Y5FN3
title: 'Campaign Raid & Equipment Farm: Hero-based equipment farming with aggregated flat leaf resources'
status: done
priority: high
labels: []
createdAt: '2026-11-17T08:24:40.295Z'
updatedAt: '2026-11-17T08:31:46.680Z'
completedAt: '2026-11-17T08:31:46.680Z'
timeSpent: 0
assignee: '@me'
---
# Campaign Raid & Equipment Farm: Hero-based equipment farming with aggregated flat leaf resources

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HeroDetailModal provides button to transfer hero context to Campaign Raid modal
- [x] #2 aggregateHeroLeafEquipment extracts deepest leaf resources across all unequipped gear slots
- [x] #3 Shared inventory is reserved once and identical leaf resources are aggregated by item and required quantity
- [x] #4 CampaignRaidModal renders flat leaf resource list with item status, mission candidates, and direct raid execution
- [x] #5 Automated unit tests prove correct multi-slot leaf extraction, inventory allocation, and UI routing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update useModals.ts to add selectedCampaignHeroId to modalContext and openModal
2. Implement aggregateHeroLeafEquipment in src/utils/recipeTree.ts to recursively collect and aggregate deepest leaf resources across all unequipped hero gear slots with shared inventory allocation
3. Add hero farming trigger button on HeroDetailModal.vue to open Campaign Raid modal with selectedCampaignHeroId
4. Update CampaignRaidModal.vue to support Hero Equipment Farm mode, hero switcher, flat leaf resource table with status and mission selection, and auto-stop sequential farming
5. Add automated unit tests in tests/hero-recipe-farm.test.mjs covering multi-slot leaf extraction, inventory reservation, deduplication, and modal routing
6. Verify full test suite and production build
<!-- SECTION:PLAN:END -->

