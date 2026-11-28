---
id: VHE-YH1DST
title: 'P2-50: Consolidate Auto Raid Rally into Energy Burner, Draggable Autopilot Pills & Balanced Settings Layout'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T10:38:19.835Z'
updatedAt: '2026-11-28T10:42:57.877Z'
completedAt: '2026-11-28T10:42:57.877Z'
timeSpent: 0
---
# P2-50: Consolidate Auto Raid Rally into Energy Burner, Draggable Autopilot Pills & Balanced Settings Layout

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove #raid-auto-energy-section from RaidModal.vue (saving full raidPreferences snapshot), consolidate World Energy Off/Auto Raid Rally/Solo Monster mode into #settings-auto-energy-burn-section in SettingsTab.vue, convert Daily Routine Autopilot steps into compact draggable pills (#settings-autopilot-step-pills) with Reset order, and balance SettingsTab into #settings-row-autopilot-collectors and #settings-row-troops-energy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 RaidModal.vue removes #raid-auto-energy-section while saving full raidPreferences; SettingsTab.vue consolidates World Energy Off/Auto Raid Rally/Solo Monster with #setting-energy-burn-world-mode and #raid-energy-threshold
- [x] #2 Daily Routine Autopilot renders compact draggable pills (#settings-autopilot-step-pills) using moveItemToIndex + #setting-daily-autopilot-reset-order
- [x] #3 SettingsTab.vue splits balanced 2-column rows (#settings-row-autopilot-collectors and #settings-row-troops-energy) with 100% English Vue UI
- [x] #4 Updated tests (status-alert-banner.test.mjs, energy-auto-burn.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P2-50 (v0.11.402): removed #raid-auto-energy-section from RaidModal.vue (saving full raidPreferences snapshot), consolidated World Energy Off/Auto Raid Rally/Solo Monster mode in SettingsTab.vue #settings-auto-energy-burn-section, converted Daily Routine Autopilot to compact draggable pills (#settings-autopilot-step-pills) with Reset order, balanced 2-column Settings rows (#settings-row-autopilot-collectors & #settings-row-troops-energy), 1404/1404 tests and dual build passed.
<!-- SECTION:NOTES:END -->

