---
id: VHE-SEVM60
title: Decouple Dungeon Battle History completely from rpcCache to dedicated storage
status: done
priority: high
labels:
  - storage,dungeon,performance
createdAt: '2026-11-21T01:38:17.581Z'
updatedAt: '2026-11-21T01:44:16.031Z'
completedAt: '2026-11-21T01:44:12.620Z'
timeSpent: 0
---
# Decouple Dungeon Battle History completely from rpcCache to dedicated storage

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Remove redundant battleHistory accumulation inside rpcCache.dungeonStatus.data
- [x] #2 Persist dungeon battle history solely through dedicated dungeonBattleHistory storage key
- [x] #3 Ensure DungeonModal loads history from dedicated storage without regressions
- [x] #4 Pass all dungeon and cache unit tests
<!-- AC:END -->

