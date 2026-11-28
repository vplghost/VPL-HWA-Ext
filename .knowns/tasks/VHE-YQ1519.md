---
id: VHE-YQ1519
title: 'P2-42: Dialog Header Optimization — Compact Status Pills & Subtle Icon-Only Header Actions'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T05:51:26.456Z'
updatedAt: '2026-11-28T05:54:00.128Z'
completedAt: '2026-11-28T05:54:00.128Z'
timeSpent: 0
---
# P2-42: Dialog Header Optimization — Compact Status Pills & Subtle Icon-Only Header Actions

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add #header-status and #header-actions slots to ModalDialog.vue; move status pills and subtle icon-only refresh buttons to dialog headers across TowerModal (with pinned footer), ArenaModal, GrandArenaModal, HydraModal, ShopModal, and DungeonModal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ModalDialog.vue supports #header-status and #header-actions slots right next to Close button
- [x] #2 TowerModal, ArenaModal, GrandArenaModal, HydraModal, and ShopModal place compact status pills in #header-status and subtle size-7 icon-only Refresh buttons in #header-actions; TowerModal pins Start/Stop Auto in #footer; DungeonModal #dungeon-refresh-btn uses subtle icon-only style
- [x] #3 Unit tests updated, npm test (0 fail) and npm run build (dist/ + .output/chrome-mv3/) pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-42 (v0.11.395): added #header-status and #header-actions slots to ModalDialog.vue; moved live status pills and subtle size-7 icon-only Refresh buttons to dialog headers across TowerModal (with pinned #tower-dialog-footer), ArenaModal, GrandArenaModal, HydraModal, ShopModal, and DungeonModal.
<!-- SECTION:NOTES:END -->

