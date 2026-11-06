---
id: VHE-E2CHEH
title: Investigate and resolve Unity instance detection in automation bridge
status: done
priority: high
labels:
  - bug automation
createdAt: '2026-11-02T15:22:17.493Z'
updatedAt: '2026-11-06T10:31:33.511Z'
completedAt: '2026-11-02T15:30:22.350Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:33.511Z'
---
# Investigate and resolve Unity instance detection in automation bridge

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Identify how Unity instance and SendMessage are exposed in game window
- [x] #2 Probe Module, UnityLoader, canvas properties, and window globals
- [x] #3 Update engine probe to reliably capture activeUnityInstance and SendMessage
- [x] #4 Unit tests verify fallback detection modes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented multi-tier active scanner (window.SendMessage, Module, canvas element properties, window property sweep) with startup polling. Updated popup UI to show Active (RPC Bridge) and clear SendMessage state when game WebGL build does not expose SendMessage. Added unit tests for canvas/Module/SendMessage scanning and popup status rendering.
<!-- SECTION:NOTES:END -->

