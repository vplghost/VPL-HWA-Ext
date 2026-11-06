---
id: doc-ad3be9a3c4455cac770dfeff87bc12d7
title: World Map Rpc Catalog
description: Observed 32 RPC method contracts with request/response field types, counts and source evidence
createdAt: '2026-11-06T04:06:01.973Z'
updatedAt: '2026-11-06T04:06:01.973Z'
tags:
  - api
  - rpc
  - catalog
  - captured
---

# World Map Rpc Catalog

Captured evidence catalog, audited 2026-11-06. See @doc/api/observed-protocol-index for source IDs, transport envelope, redaction and interpretation rules.

32 distinct method/feature pairs. Fields below are observed type unions through two nesting levels; they are not required-field definitions or complete server schemas. `<key>` means dynamic dictionary key; empty arrays reveal no element contract. Counts include repeated calls and bootstrap batches.

## attackMine:mine

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S13.

Request `args` fields:
```text
$: object
$.battleType: string
$.mapId: string
$.mineId: string
$.squad: object
$.squad.heroes: array
$.squad.units: array
```

Successful `result.response` fields:
```text
$: object
$.route: object
$.route.duration: number
$.route.durationMs: number
$.route.from: object
$.route.routeId: string
$.route.startedAt: number
$.route.to: object
$.squadId: string
```

## attackMob:mob

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S11.

Request `args` fields:
```text
$: object
$.mapId: string
$.mobId: string
$.squad: object
$.squad.heroes: array
$.squad.units: array
```

Successful `result.response` fields:
```text
$: object
$.route: object
$.route.duration: number
$.route.durationMs: number
$.route.from: object
$.route.routeId: string
$.route.startedAt: number
$.route.to: object
$.squadId: string
```

## collectResource:resourceProduction

Occurrences: 5; response present without error: 5; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.collectDate: number
$.collectedAmount: number
$.producerId: number
```

Successful `result.response` fields:
```text
$: object
```

## completeConstruction:building

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.buildingId: number
$.completeDate: number
$.nextLevel: number
```

Successful `result.response` fields:
```text
$: object
```

## createRally:mob

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S12.

Request `args` fields:
```text
$: object
$.mapId: string
$.mobId: string
$.squad: object
$.squad.heroes: array
$.squad.units: array
$.startDelay: number
```

Successful `result.response` fields:
```text
$: object
$.rally: object
$.rally.membersLimit: number
$.rally.plannedStartTime: number
$.rally.rallyId: string
$.rally.unitsLimit: number
$.squadId: string
```

## getChunks:globalMap

Occurrences: 16; response present without error: 16; RPC errors: 0; missing/unmatched response: 0. Sources: S04, S11, S12, S13, S14.

Request `args` fields:
```text
$: object
$.chunkCoordinates: array
$.chunkCoordinates[]: object
$.lod: number
$.mapId: string
```

Successful `result.response` fields:
```text
$: object
$.chunks: array
$.chunks[]: object
$.routes: array
$.routes[]: object
```

## getGarrisonWallSummary:outpost

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.garrisonSquad: object
$.garrisonSquad.heroes: array
$.garrisonSquad.isReserved: boolean
$.garrisonWall: object
$.garrisonWall.health: number
$.garrisonWall.state: string
$.garrisonWall.updatedAt: number
$.garrisonWall.version: number
```

## getHealing:unit

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.healing: object
$.healing.duration: number
$.healing.startDate: number
$.healing.units: array
$.injuredUnits: array
$.injuredUnits[]: object
```

## getIncomingMarches:march

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.attacks: array
$.clans: array
$.scouts: array
```

## getMaps:globalMap

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.maps: array
$.maps[]: object
```

## getMarches:march

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.clans: array
$.marches: object
$.marches.interactionWithTarget: array
$.marches.moveToRallyLeader: array
$.marches.moveToTargetInRally: array
$.marches.moveToTargetInSolo: array
$.marches.returnToOutpost: array
$.marches.waitingForRallyStart: array
$.scoutMarches: object
$.scoutMarches.moveToTargetInSolo: array
$.scoutMarches.returnToOutpost: array
```

## getMineById:mine

Occurrences: 5; response present without error: 5; RPC errors: 0; missing/unmatched response: 0. Sources: S13, S14.

Request `args` fields:
```text
$: object
$.mineId: string
```

Successful `result.response` fields:
```text
$: object
$.mineId: string
$.resourceAmount: number
```

## getMineSummary:mine

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.gatherings: array
$.gatherings[]: object
```

## getMobSummary:mob

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.dailyRallyStatistics: object
$.dailyRallyStatistics.lastResetAt: number
$.dailyRallyStatistics.leaderWins: number
$.dailyRallyStatistics.memberWins: number
$.killedRallyMobsConfigIds: array
$.killedRallyMobsConfigIds[]: number
$.killedSoloMobsConfigIds: array
$.killedSoloMobsConfigIds[]: number
$.maxDefeatedRallyMobLevel: number
$.maxDefeatedSoloMobLevel: number
$.rallyAttempts: object
$.rallyAttempts.lastResetAt: number
$.rallyAttempts.leaderUsedAttempts: number
$.rallyAttempts.memberUsedAttempts: number
```

## getOutpostSummary:outpost

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.coordinates: object
$.coordinates.x: number
$.coordinates.y: number
$.homeMap: object
$.homeMap.coordinates: object
$.homeMap.mapId: string
$.homeMap.mapTemplateId: number
$.mapConfigId: number
$.mapId: string
$.mapTemplateId: number
$.mapType: string
$.outpostId: string
$.version: number
```

## getRallyAttackDefenders:squadBattle

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S12.

Request `args` fields:
```text
$: object
$.PredefinedSquadId: number
```

Successful `result.response` fields:
```text
$: object
$.defenders: array
$.defenders[]: object
```

## getRallyById:rally

Occurrences: 29; response present without error: 29; RPC errors: 0; missing/unmatched response: 0. Sources: S08, S12, S13.

Request `args` fields:
```text
$: object
$.rallyId: string
```

Successful `result.response` fields:
```text
$: object
$.rally: object
$.rally.clanId: number
$.rally.createdAt: number
$.rally.leader: object
$.rally.leaderCoordinates: object
$.rally.mapId: string
$.rally.mapType: string
$.rally.members: array
$.rally.membersCapacityLeft: number
$.rally.mob: object
$.rally.plannedStartTime: number
$.rally.rallyId: string
$.rally.rallyVersion: number
$.rally.route: object
$.rally.target: object
$.rally.unitsCapacityLeft: number
```

## getRallySummary:rally

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.autoJoinSettings: object
$.autoJoinSettings.expiresAt: number
$.autoJoinSettings.maxMarchesCount: number
$.autoJoinSettings.queuePosition: number
$.rallies: array
```

## getResidentSummary:resident

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.residents: array
$.residents[]: object
```

## getRoutesByIds:globalMap

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S04, S11, S13.

Request `args` fields:
```text
$: object
$.routeIds: array
$.routeIds[]: string
```

Successful `result.response` fields:
```text
$: object
$.clans: array
$.clans[]: object
$.routes: array
$.routes[]: object
```

## getSoloAttackDefenders:squadBattle

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S11.

Request `args` fields:
```text
$: object
$.EnemyId: string
$.EnemyLevel: number
$.PredefinedSquadId: number
```

Successful `result.response` fields:
```text
$: object
$.defenders: array
$.defenders[]: object
```

## getSummary:bonus

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.clanBonuses: object
$.clanBonuses.persistentBonuses: array
$.clanBonuses.scheduledBonuses: array
$.clanBonuses.stackableBonuses: array
$.clanBonuses.temporaryBonuses: array
$.persistentBonuses: array
$.persistentBonuses[]: number
$.scheduledBonuses: array
$.stackableBonuses: array
$.temporaryBonuses: array
```

## getSummary:building

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.buildings: array
$.buildings[]: object
$.queues: array
$.queues[]: object
```

## getSummary:personalResearch

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.completedResearches: array
$.completedResearches[]: object
$.queues: array
$.queues[]: object
```

## getSummary:resourceProduction

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.producers: array
$.producers[]: object
```

## getTrainings:unit

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.trainingQueues: array
$.trainingQueues[]: object
$.upgradeQueues: array
```

## getUnitSummary:unit

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.available: array
$.available[]: object
$.reserved: array
$.squads: array
$.squads[]: object
```

## getUserClanMembersOutposts:globalMap

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.outposts: array
$.outposts[]: object
```

## searchMine:mine

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S14.

Request `args` fields:
```text
$: object
$.center: object
$.center.x: number
$.center.y: number
$.fullOnly: boolean
$.mapId: string
$.mineConfigIds: array
$.mineConfigIds[]: number
```

Successful `result.response` fields:
```text
$: object
$.mines: array
$.mines[]: object
```

## searchMob:mob

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S11, S12.

Request `args` fields:
```text
$: object
$.center: object
$.center.x: number
$.center.y: number
$.mapId: string
$.mobConfigIds: array
$.mobConfigIds[]: number
$.mobType: string
```

Successful `result.response` fields:
```text
$: object
$.mobs: array
$.mobs[]: object
```

## startConstruction:building

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.buildingId: number
$.durationMs: number
$.nextLevel: number
$.startDate: number
```

Successful `result.response` fields:
```text
$: object
```

## stopMineGathering:mine

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S13.

Request `args` fields:
```text
$: object
$.squadId: string
```

Successful `result.response` fields:
```text
$: object
$.remainingResourceAmount: number
$.route: object
$.route.duration: number
$.route.durationMs: number
$.route.from: object
$.route.routeId: string
$.route.startedAt: number
$.route.to: object
$.squadId: string
```
