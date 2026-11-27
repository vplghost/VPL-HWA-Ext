---
id: VHE-AFDXTC
title: 'P2-41: Unified Pinned Dialog Footers (Monster, Arena, Grand Arena, PvP Optimizer, Expeditions)'
status: done
priority: medium
labels: []
createdAt: '2026-11-27T18:23:42.023Z'
updatedAt: '2026-11-27T18:26:22.744Z'
completedAt: '2026-11-27T18:26:22.744Z'
timeSpent: 0
---
# P2-41: Unified Pinned Dialog Footers (Monster, Arena, Grand Arena, PvP Optimizer, Expeditions)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract primary CTA buttons into pinned shrink-0 dialog footers outside the scroll body across MonsterModal, ArenaModal, GrandArenaModal, PvpTeamOptimizerModal, and ExpeditionsModal so primary actions are always clickable and never jump.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MonsterModal has #monster-dialog-footer with #monster-dialog-actions above StatusAlertBanner and top-anchored backdrop
- [x] #2 ArenaModal, GrandArenaModal, PvpTeamOptimizerModal, and ExpeditionsModal have pinned shrink-0 footers outside their scrollable bodies preserving all IDs and handlers
- [x] #3 Unit tests updated, npm test (0 fail) and npm run build (dist/ + .output/chrome-mv3/) pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-41 (v0.11.391): pinned primary CTA actions into shrink-0 dialog footers outside the scroll body across MonsterModal (#monster-dialog-footer with #monster-dialog-actions above StatusAlertBanner), ArenaModal (#arena-dialog-footer), GrandArenaModal (#grand-arena-dialog-footer), PvpTeamOptimizerModal (#pvp-optimizer-dialog-footer), and ExpeditionsModal (#expeditions-dialog-footer), plus shrink-0/min-h-0 hardening in ModalDialog.vue. Verified 1,370 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

