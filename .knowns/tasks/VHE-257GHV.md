---
id: VHE-257GHV
title: Implement in-game engine probe and automation dispatcher bridge
status: done
priority: medium
labels:
  - feat automation
createdAt: '2026-11-02T15:03:18.034Z'
updatedAt: '2026-11-02T15:10:30.932Z'
completedAt: '2026-11-02T15:10:30.932Z'
timeSpent: 0
---
# Implement in-game engine probe and automation dispatcher bridge

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Probe detects and intercepts createUnityInstance and unityInstance in window
- [ ] #2 Probe discovers Nexters client network dispatcher or RPC queue if present
- [ ] #3 Bridge passes discovered game engine capabilities to background and popup
- [ ] #4 Tests verify probe installation, lifecycle hooks, and safe degradation
<!-- AC:END -->

