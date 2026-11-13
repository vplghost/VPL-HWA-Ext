---
id: VHE-R8Z54P
title: Restore bounded piggyback refresh RPC compatibility
status: done
priority: high
labels:
  - migration
  - rpc
  - piggyback
createdAt: '2026-11-13T04:01:34.503Z'
updatedAt: '2026-11-13T04:02:42.933Z'
completedAt: '2026-11-13T04:02:42.933Z'
timeSpent: 0
parent: VHE-HRA25T
---
# Restore bounded piggyback refresh RPC compatibility

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Permit established migrated Tower/Dungeon/quest/clanVersus/chat read contracts in normal and MQTT piggyback queues using explicit method+feature validation. Keep unrelated methods/pairs rejected and original response isolation intact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Established migration reads queue in both piggyback and MQTT modes using bounded method-feature contracts
- [x] #2 Unsupported method-feature pairs and arbitrary calls remain excluded
- [x] #3 Carrier request appends supported refreshes and response isolation preserves game results
- [x] #4 Intercept regression suite and task validation pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add exact established read method/feature matcher for migrated refresh calls, retaining existing legacy method allowlist.
2. Apply matcher consistently at queue admission, refresh de-duplication and response merge boundaries.
3. Exercise fetch carrier append and original response isolation for both piggyback modes; reject unsupported feature pairs and arbitrary methods.
4. Run intercept tests and focused task validation; parent runs integrated build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added method+feature matcher for getInfo:clanVersus, getDailyQuests:quest, getSpecialQuestState:quest and unfeatured magicTower_briefInfo/magicTower_getAll/dungeonGetInfo/chatGetAll. Matcher is used for admission, action-associated refresh deduplication, native-carrier handling and retry restoration. No arbitrary RPC widening. Regression queues all seven valid reads plus invalid pairs/arbitrary method under both piggyback modes, verifies exact appended requests, native response isolation and full extension recording. node --test tests/intercept.test.mjs: 42 tests, 42 pass, 0 fail. git diff --check scoped clean. System Decision Impact: none — restores established read contracts across existing transport modes without new architecture guidance. Spec Decision Compliance: not applicable — no linked spec.
<!-- SECTION:NOTES:END -->

