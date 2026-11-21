---
id: VHE-P7TVAB
title: Split bulky history data (guildChat, dungeonBattleHistory) from monolithic rpcCache
status: done
priority: high
labels:
  - storage,performance
createdAt: '2026-11-20T17:15:01.306Z'
updatedAt: '2026-11-20T17:43:43.696Z'
completedAt: '2026-11-20T17:43:43.696Z'
timeSpent: 0
---
# Split bulky history data (guildChat, dungeonBattleHistory) from monolithic rpcCache

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Separate guildChat persistence into its own chrome.storage.local key
- [ ] #2 Remove redundant battleHistory storage from rpcCache.dungeonStatus.data
- [ ] #3 Maintain in-memory cache in backgroundRuntime to eliminate repetitive disk reads
- [ ] #4 Support targeted guildChat reactivity in useRpcCache without replacing root cache.value
- [ ] #5 Pass all existing background and cache unit tests
<!-- AC:END -->

