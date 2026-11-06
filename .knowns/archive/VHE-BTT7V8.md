---
id: VHE-BTT7V8
title: Legend draft UI, hero stat cards, queue tooltips, and raid campaign tracking
status: done
priority: high
labels: []
createdAt: '2026-11-01T18:08:30.630Z'
updatedAt: '2026-11-06T10:31:33.111Z'
completedAt: '2026-11-01T18:08:34.712Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:33.111Z'
---
# Legend draft UI, hero stat cards, queue tooltips, and raid campaign tracking

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Legend draft modal with 5-step hero picking and enemy lineup display
- [x] #2 Hero hover card with spark of power, skills, skins, glyphs, and artifacts
- [x] #3 Queue tooltips for building and research details with name and level
- [x] #4 In-game helper button injection on canvas index page
- [x] #5 Cache tracking for skill point upgrades, raid stamina, and gold rewards
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Legend Draft modal with 5-step picking and validation, hero detailed hover cards with spark of power/skills/skins/glyphs/artifacts, building and research queue tooltips, in-game HWA Helper button injection, skill upgrade cache sync, and campaign raid stamina/gold tracking. 79/79 tests pass and extension built cleanly.

Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified renderDraft five-step picking, createHeroInline detailed cards, buildingTooltip/researchTooltip, bridge helper injection, heroUpgradeSkill and mission raid cache reducers. Evidence: legend-draft-ui, popup-hero-view, popup-data, bridge and rpc-cache tests, all passing. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

