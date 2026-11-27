---
id: VHE-5G4WQ7
title: 'P2-37: Daily Autopilot Unified Dialog Runner (1:1 Parity for Expeditions, Tower, Soul Sweep)'
status: done
priority: medium
labels:
  - autopilot
  - ui
  - p2
createdAt: '2026-11-27T13:37:24.956Z'
updatedAt: '2026-11-27T13:39:28.970Z'
completedAt: '2026-11-27T13:39:28.970Z'
timeSpent: 0
---
# P2-37: Daily Autopilot Unified Dialog Runner (1:1 Parity for Expeditions, Tower, Soul Sweep)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create useAutopilotDialogBridge.ts registry and wire ExpeditionsModal, TowerModal, CampaignRaidModal to execute 1:1 with manual buttons (open if closed -> await handler -> close only if opened by autopilot)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-37: useAutopilotDialogBridge.ts registry (open if closed -> await 1:1 manual button handler -> close only if opened by autopilot) wired into ExpeditionsModal, TowerModal, CampaignRaidModal, and useDailyAutopilot with stop propagation.
<!-- SECTION:NOTES:END -->

