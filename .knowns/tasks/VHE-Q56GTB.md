---
id: VHE-Q56GTB
title: 'P2-38: Auto Free Heroic Chest (Video) Collector & 2-Column Auto Freebies Card'
status: done
priority: medium
labels: []
createdAt: '2026-11-27T16:32:10.524Z'
updatedAt: '2026-11-27T16:37:21.083Z'
completedAt: '2026-11-27T16:37:21.083Z'
timeSpent: 0
---
# P2-38: Auto Free Heroic Chest (Video) Collector & 2-Column Auto Freebies Card

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add autoHeroicChestVideoEnabled background scheduler (alarm hwa-auto-heroic-chest-video, 0-Emerald heroChest_openChest guard), useHeroicChestVideoAutomation composable, and 2-column #settings-auto-collectors-grid in SettingsTab.vue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SettingsTab #settings-auto-collectors-grid uses 2-column layout with all 4 collectors including #setting-auto-heroic-chest-video
- [x] #2 runHeroicChestVideoOpen schedules single alarm on cooldown, refreshes when cache missing, opens free video chest strictly with count:1/free:true/video:true/costId:'' when ready, and prevents 60s duplicate opens
- [x] #3 All unit tests pass (npm test) and dual build (npm run build) succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-38 (v0.11.388): added useHeroicChestVideoAutomation.ts, runHeroicChestVideoOpen() with hwa-auto-heroic-chest-video single wake alarm and 0-Emerald heroChest_openChest guard in backgroundRuntime.ts, refactored #settings-auto-collectors-section into 2-column #settings-auto-collectors-grid in SettingsTab.vue, added 5 unit tests in tests/heroic-chest-video-auto.test.mjs (1368 pass / 0 fail).
<!-- SECTION:NOTES:END -->

