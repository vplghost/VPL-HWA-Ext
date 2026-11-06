---
id: VHE-257GHV
title: Implement in-game engine probe and automation dispatcher bridge
status: done
priority: medium
labels:
  - feat automation
createdAt: '2026-11-02T15:03:18.034Z'
updatedAt: '2026-11-06T10:31:31.201Z'
completedAt: '2026-11-02T15:10:30.932Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:31.201Z'
---
# Implement in-game engine probe and automation dispatcher bridge

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Probe detects and intercepts createUnityInstance and unityInstance in window
- [x] #2 Bridge passes discovered game engine capabilities to background and popup
- [x] #3 Tests verify probe installation, lifecycle hooks, and safe degradation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified createUnityInstance/setter/Module/canvas/SendMessage hooks, engine-status forwarding and safe degradation in intercept/bridge/background. Removed original AC #2 as obsolete/unproven: private Nexters dispatcher/RPC-queue discovery was never verified and is no longer the selected transport. Current authorized mechanisms are shared RPC interception and MQTT-assisted piggyback (@task-VHE-62VVG5, @task-VHE-6PCSC3), not a private dispatcher claim. Tests: intercept.test.mjs engine hook/scanner cases and bridge.test.mjs engine command forwarding. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

