---
id: VHE-0394FP
title: 'P2-36: Legends Draft Picked-Team WASM Sim, Standardized Draft Stats & Stage-3 5-Column Layout'
status: done
priority: medium
labels:
  - draft
  - ui
  - sim
  - p2
createdAt: '2026-11-27T11:06:10.904Z'
updatedAt: '2026-11-27T11:07:55.284Z'
completedAt: '2026-11-27T11:07:55.284Z'
timeSpent: 0
---
# P2-36: Legends Draft Picked-Team WASM Sim, Standardized Draft Stats & Stage-3 5-Column Layout

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add buildSyntheticDraftBattle with max Legends Draft stats + mirror-hero isolation, Simulate Picked 5-hero team button, and preserve 5-column Round layout with disabled cards during stageId=3 waiting state
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-36: buildSyntheticDraftBattle() with standardized Legends Draft max stats (Lv120, color 16, max skills 120, hero_runes 40x5, titanGiftLevel 30, 3x Lv100 6★ artifacts, Lv60 skins + object skinsInfo, min 3★ star rule, mirror-hero isolation, type='drafts'); Simulate Picked 5-hero team button (#draft-sim-picked-btn & #draft-sim-picked-result); Sim Error tooltip; preserved 5-column Round matrix during stageId=3 waiting state with disabled unpicked cards.
<!-- SECTION:NOTES:END -->

