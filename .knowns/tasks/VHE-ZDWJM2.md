---
id: VHE-ZDWJM2
title: Fix Raid, Monster, and Gathering RPC dispatch, map search targets, direct mode settings sync, and 10 mine levels
status: done
priority: high
labels:
  - dialogs,rpc,gather
createdAt: '2026-11-11T10:31:38.256Z'
updatedAt: '2026-11-13T02:37:00.105Z'
completedAt: '2026-11-11T10:31:41.400Z'
timeSpent: 0
---
# Fix Raid, Monster, and Gathering RPC dispatch, map search targets, direct mode settings sync, and 10 mine levels

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SettingsTab synchronizes popupRpcEnabled and socketRefreshMode in chrome.storage.local
- [x] #2 RaidModal provides boss search, target selection dropdown, firstMobId parameter, and attack once
- [x] #3 MonsterModal provides monster search, target selection dropdown, firstMobId parameter, and attack once
- [x] #4 GatheringModal supports mine levels up to 10 in auto and manual, real searchMine, target squad dispatch, and march recall
- [x] #5 Automated regression tests verify 10 mine levels, target dropdowns, RPC toggles, and build passes
<!-- AC:END -->

