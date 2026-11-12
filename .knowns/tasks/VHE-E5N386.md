---
id: VHE-E5N386
title: Fix header building and research timers, campaign raid RPC dispatch, and raid map coordinates
status: done
priority: high
labels: []
createdAt: '2026-11-12T03:44:24.580Z'
updatedAt: '2026-11-12T04:26:57.323Z'
completedAt: '2026-11-12T04:26:57.323Z'
timeSpent: 0
assignee: '@me'
---
# Fix header building and research timers, campaign raid RPC dispatch, and raid map coordinates

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Header displays active building and research queue countdowns with live per-second duration and normalizeArray parsing
- [x] #2 Campaign raid modal dispatches missionRaid RPC directly with permission for playable_getAvailable and worldStars_getAvailable
- [x] #3 Raid modal resolves map coordinates from getRallyById and outposts when world map chunk was cached by Unity
<!-- AC:END -->

