---
id: doc-7c21610a499bc5c1f0192daa9cca4f82
title: Battles Rpc Catalog
description: Observed 27 RPC method contracts with request/response field types, counts and source evidence
createdAt: '2026-11-06T04:06:01.774Z'
updatedAt: '2026-11-06T04:06:01.774Z'
tags:
  - api
  - rpc
  - catalog
  - captured
---

# Battles Rpc Catalog

Captured evidence catalog, audited 2026-11-06. See @doc/api/observed-protocol-index for source IDs, transport envelope, redaction and interpretation rules.

27 distinct method/feature pairs. Fields below are observed type unions through two nesting levels; they are not required-field definitions or complete server schemas. `<key>` means dynamic dictionary key; empty arrays reveal no element contract. Counts include repeated calls and bootstrap batches.

## IsometricRPG_getMapState

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.mapId: number
```

Successful `result.response` fields:
```text
$: object
$.data: array
$.mapId: number
$.timeStamp: number
```

## adventureGetInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: null
```

## arenaGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.arenaBest: string
$.arenaHeroes: array
$.arenaHeroes[]: object
$.arenaPlace: string
$.arenaPower: string
$.grandBest: string
$.grandCoin: number
$.grandCoinTime: number
$.grandHeroes: array
$.grandHeroes[]: array
$.grandPlace: string
$.grandPower: string
$.userId: string
```

## bossGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].bossMapId: number
$[].id: number
$[].mapId: number
$[].mayOpenChest: boolean
```

## bossGetChestInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.freeChests: object
$.freeChests.<key>: boolean
$.starmoneySpent: number
```

## bossGetCurrent

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].bossMapId: number
$[].id: number
$[].mapId: number
$[].mayOpenChest: boolean
```

## brawl_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].brawlId: string
$[].defenceTeam: array
$[].enemies: object
$[].groupNum: string
$[].isQuestFarmed: boolean
$[].nextDayReset: number
$[].power: string
$[].wins: string
```

## clanBoss_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.endDay: number
$.heads: array
$.headsBestResults: array
$.headsBestResults[]: object
$.heads[]: object
$.superTries: number
$.tries: number
```

## clanBoss_getDayHistory

Occurrences: 6; response present without error: 6; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.day: number
$.hydraId: number
```

Successful `result.response` fields:
```text
$: object
$.battles: object
$.battles.<key>: object
$.users: object
$.users.<key>: object
```

## clanBoss_getHistory

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.history: object
$.history.<key>: array
$.today: number
```

## dungeonEndBattle

Occurrences: 10; response present without error: 10; RPC errors: 0; missing/unmatched response: 0. Sources: S05.

Request `args` fields:
```text
$: object
$.progress: array
$.progress[]: object
$.result: object
$.result.stars: number
$.result.win: boolean
```

Successful `result.response` fields:
```text
$: object
$.dungeon: object
$.dungeon.elements: object
$.dungeon.floor: object
$.dungeon.floorNumber: number
$.dungeon.floorType: string
$.dungeon.maxFloorPassed: string
$.dungeon.maxFloorReached: number
$.dungeon.respawnFloor: string
$.dungeon.reward: array
$.dungeon.states: object
$.dungeon.userId: string
$.dungeonActivity: number
$.reward: object
$.reward.consumable: object
$.reward.dungeonActivity: number
$.reward.fragmentTitan: object
$.rewardMultiplier: number
$.states: object
$.states.titans: object
```

## dungeonSaveProgress

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S05.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.dungeon: object
$.dungeon.elements: object
$.dungeon.floor: object
$.dungeon.floorNumber: number
$.dungeon.floorType: string
$.dungeon.maxFloorPassed: string
$.dungeon.maxFloorReached: number
$.dungeon.respawnFloor: string
$.dungeon.reward: array
$.dungeon.states: object
$.dungeon.userId: string
$.reward: object
$.reward.gold: number
```

## dungeonStartBattle

Occurrences: 10; response present without error: 10; RPC errors: 0; missing/unmatched response: 0. Sources: S05.

Request `args` fields:
```text
$: object
$.heroes: array
$.heroes[]: number
$.teamNum: number
```

Successful `result.response` fields:
```text
$: object
$.attackers: object
$.attackers.<key>: object
$.battleEffects: object
$.battleEffects.<key>: number
$.battleFeatures: array
$.battleFeatures[]: string
$.defenders: array
$.defenders[]: object
$.effects: array
$.reward: object
$.reward.consumable: object
$.reward.dungeonActivity: number
$.reward.fragmentTitan: object
$.rewardMultiplier: number
$.seed: number
$.startTime: number
$.type: string
$.typeId: number
$.userId: string
```

## eventBoss_getAll

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## isometricRPG_getFarmedMapObjects

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.mapId: number
```

Successful `result.response` fields:
```text
$: object
$.mapId: number
$.objects: array
```

## magicTower_activateBuff

Occurrences: 11; response present without error: 11; RPC errors: 0; missing/unmatched response: 0. Sources: S08.

Request `args` fields:
```text
$: object
$.id: number
```

Successful `result.response` fields:
```text
$: array
```

## magicTower_briefInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.deadHeroesCount: number
$.state: string
```

## magicTower_endBattle

Occurrences: 12; response present without error: 12; RPC errors: 0; missing/unmatched response: 0. Sources: S08.

Request `args` fields:
```text
$: object
$.progress: array
$.progress[]: object
$.result: object
$.result.stars: number
$.result.win: boolean
```

Successful `result.response` fields:
```text
$: object
$.currentRoomNumber: number
$.defendersStates: object
$.defendersStates.<key>: object
$.reward: object
$.reward.coin: object
$.reward.fragmentGear: object
$.reward.gold: number
$.userHeroStates: object
$.userHeroStates.<key>: object
```

## magicTower_enterNextFloor

Occurrences: 22; response present without error: 22; RPC errors: 0; missing/unmatched response: 0. Sources: S08.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.currentRoomNumber: number
$.floorNumber: number
$.rooms: object
$.rooms.<key>: object
```

## magicTower_enterRoom

Occurrences: 12; response present without error: 12; RPC errors: 0; missing/unmatched response: 0. Sources: S08.

Request `args` fields:
```text
$: object
$.number: number
```

Successful `result.response` fields:
```text
$: object
$.currentRoomNumber: number
```

## magicTower_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.battleRoomsData: object
$.battleRoomsData.userHeroStates: array|object
$.battleRoomsData.userTeam: array
$.buffsRoomsData: object
$.buffsRoomsData.activatedBuffs: array
$.buffsRoomsData.rerollsDone: number
$.floorData: object
$.floorData.currentRoomNumber: number
$.floorData.floorNumber: number
$.floorData.rooms: object
$.roomIdsOnFloors: object
$.roomIdsOnFloors.<key>: object
$.skipState: string
```

## magicTower_openChest

Occurrences: 11; response present without error: 11; RPC errors: 0; missing/unmatched response: 0. Sources: S08.

Request `args` fields:
```text
$: object
$.number: number
```

Successful `result.response` fields:
```text
$: object
$.reward: object
$.reward.coin: object
$.reward.fragmentGear: object
$.reward.fragmentScroll: object
$.reward.gold: number
$.rewardIndex: number
```

## magicTower_startBattle

Occurrences: 12; response present without error: 12; RPC errors: 0; missing/unmatched response: 0. Sources: S08.

Request `args` fields:
```text
$: object
$.heroes: array
$.heroes[]: number
```

Successful `result.response` fields:
```text
$: object
$.attackers: object
$.attackers.<key>: object
$.battleEffects: object
$.battleEffects.<key>: number
$.battleFeatures: array
$.battleFeatures[]: string
$.defenders: array
$.defenders[]: object
$.effects: array|object
$.effects.attackers: object
$.effects.defenders: object
$.reward: object
$.reward.coin: object
$.reward.fragmentGear: object
$.reward.gold: number
$.seed: number
$.startTime: number
$.type: string
$.userId: number
```

## missionGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].id: number
$[].resetToday: number
$[].stars: number
$[].triesSpent: number
```

## modularAdventure_getStates

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.adventureId: number
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].adventureId: number
$[].modulePath: array
$[].progressData: array|object
$[].state: number
```

## randomDraft_getInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.draft: string
$.draftEnemy: string
$.enemyUser: null
$.gameTimeTs: number
$.journal: array
$.journal[]: object
$.matchId: null
$.rating: object
$.rating.enemyRating: null
$.rating.userDifRating: null
$.rating.userRating: null
$.stageFinishTs: null
$.stageId: number
$.winstreak: object
$.winstreak.availableRestoreWinstreakCount: number
$.winstreak.defenceCount: number
$.winstreak.isDefenceBroken: boolean
$.winstreak.resetTime: number
$.winstreak.winStreakCount: number
```

## robberGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.robbers: array
```
