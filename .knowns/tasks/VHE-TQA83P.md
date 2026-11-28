---
id: VHE-TQA83P
title: 'P2-52: Gathering Dialog UI Overhaul, Independent Mine Defense, Troop Reserve & Zero-Troop Event Wait'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T11:40:56.529Z'
updatedAt: '2026-11-28T11:47:33.932Z'
completedAt: '2026-11-28T11:47:33.932Z'
timeSpent: 0
---
# P2-52: Gathering Dialog UI Overhaul, Independent Mine Defense, Troop Reserve & Zero-Troop Event Wait

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decouple Mine Defense from Auto-Gather, merge Smart Gathering + Active into 1 header toggle, show/hide Auto vs Manual sections mutually exclusively, add per-type highest-tier troop reserve with collapsible icon toggle, and add zero-troop event-driven wait latch in autoGather/backgroundRuntime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Independent Mine Defense runs and handles hwa-mine-defense even when autoGatherSettings.enabled is false; auto-gather-stop does not drop mine-defense RPCs
- [x] #2 applyTroopReserve preserves highest-tier troops per type (infantry/spearmen/marksmen) without mutating source summary and integrates with planAutoGather
- [x] #3 Zero-troop early gate + waitingForTroops latch stops searchMine/getMineById spam and wakes on completeTraining, completeHealing, march return, or unit summary > 0
- [x] #4 GatheringModal uses #header-status/#header-actions with unified #gather-auto-toggle, mutual Auto/Manual visibility, independent #gather-defense-section, collapsible #gather-reserve-panel, and 100% English UI
- [x] #5 Unit tests, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-52 (v0.11.404): independent Mine Defense (tickMineDefense + #gather-defense-section), unified header Auto toggle + status pills + mutual Auto/Manual sections in GatheringModal.vue, highest-tier per-type troop reserve with collapsible #gather-reserve-panel, and zero-troop event-driven waitingForTroops latch. Verified: 1,412 pass / 0 fail, dual build pass.
<!-- SECTION:NOTES:END -->

