---
id: doc-0d0028b9e4a3bb19e742de8b5ea769ed
title: Captured MQTT Event Catalog
description: Captured MQTT event schemas and provenance, including rally membership/departure evidence.
createdAt: '2026-11-06T04:06:02.037Z'
updatedAt: '2026-11-14T12:38:23.076Z'
tags:
  - mqtt
  - api
  - catalog
  - captured
---

# Captured MQTT Event Catalog

Observed incoming/event payload structures from available captures. See @doc/api/observed-protocol-index for source IDs and envelope conventions. Fields are type unions through two nesting levels, not required-field definitions.

## chatMessage

Occurrences: 1. Sources: S14.

`result.body` fields:
```text
$: object
$.chatType: string
$.ctime: number
$.data: object
$.data.clanRole: string
$.data.ids: array
$.data.text: string
$.id: number
$.messageType: string
$.pushChannel: string
$.pushId: string
$.pushIndex: number
$.pushTs: number
$.pushUserId: number
$.user: object
$.user.accountId: string
$.user.avatarId: string
$.user.battleIsAllowed: boolean
$.user.borderId: number
$.user.clanIcon: object
$.user.clanId: string
$.user.clanRole: string
$.user.clanTitle: string
$.user.flagId: number
$.user.frameId: number
$.user.id: string
$.user.isChatModerator: boolean
$.user.lastLoginTime: string
$.user.level: string
$.user.name: string
$.user.serverId: string
$.userId: string
```

## mapChunksUpdated

Occurrences: 34. Sources: S12, S13, S14.

`result.body` fields:
```text
$: object
$.chunks: array
$.chunks[]: object
```

## newReport

Occurrences: 2. Sources: S13.

`result.body` fields:
```text
$: object
$.pushUserId: number
$.reportId: string
$.type: string
```

## rallyCompleted

Occurrences: 1. Sources: S13.

`result.body` fields:
```text
$: object
$.rallyId: string
```

## rallyCreated

Occurrences: 3. Sources: S12, S13.

`result.body` fields:
```text
$: object
$.rallyId: string
```

## returnFromMineCompleted

Occurrences: 2. Sources: S13.

`result.body` fields:
```text
$: object
$.pushUserId: number
$.reward: array
$.reward[]: object
$.squadId: string
```

## routeCompleted

Occurrences: 16. Sources: S12, S13, S14.

`result.body` fields:
```text
$: object
$.routeId: string
```

## routeCreated

Occurrences: 25. Sources: S12, S13, S14.

`result.body` fields:
```text
$: object
$.from: object
$.from.x: number
$.from.y: number
$.routeId: string
$.to: object
$.to.x: number
$.to.y: number
```

## routeToMineCompleted

Occurrences: 1. Sources: S13.

`result.body` fields:
```text
$: object
$.mineConfigId: number
$.mineId: string
$.plannedDuration: number
$.plannedDurationMs: number
$.plannedGatheredResourceAmount: number
$.pushUserId: number
$.squadId: string
$.startedAt: number
```


## rallyMembersUpdated

Additional source: `temp/tracking-data/hwa-game-record-202611141452_expedition_collect.json`, SHA256 `638211e935dbf800beec4da59a5cf3a3c0586f7388af90cb40d638e94b0f0b0b`.11occurrences. Received QoS1UTF8PUBLISH on `hwm/pub/clan/305081`; envelope `{method:"msg",result:{type:"rallyMembersUpdated",body:{rallyId:string,rallyVersion:number}}}`. Two rally IDs with versions7..11and6..11. Payload invalidates membership; it does not contain members themselves. Implementation and RPC correlation: @doc/api/mqtt-processing-and-refresh.

## rallyStarted

Same source/hash as rallyMembersUpdated above.2occurrences,07:52:15.773Z and07:52:24.455Z, same transport/topic/envelope with type `rallyStarted`, body `{rallyId:string,rallyVersion:13}`. Correlated getRallyById replies supply the actual outbound route, which starts earlier than plannedStartTime. Notification alone is neither a victory nor base-return confirmation. See @doc/api/world-map-rpc-contracts. Added by @task-VHE-GN1AQ2.

## Mine attack lifecycle (2026-11-14)

Verified from `hwa-game-record-202611141920_firstattack.json` and `hwa-game-record-202611141923_under_attack2.json`; hashes, timing examples and minimal fixtures are documented in @doc/api/mine-incoming-attack-and-timed-withdrawal.

- `marchAttackDetected`: mapId, mine target identity/config/coordinates, toTargetPvp route (id/version/leader/from/to/startedAt/durationMs), enemy squads and pushUserId. This supplies hostility and impact ETA; routeCreated alone still does not.
- `marchAttackEnded`: enemy squadId, mapId, pushUserId. It does not identify the defending gatherer.
- `gatheringMineCompleted`: own mineId/config/squadId, remainingResourceAmount, actual routeToOutpost, battleResult/losses and pushUserId.
- `returnFromMineCompleted`: own squadId, resource reward and pushUserId; use refreshes to confirm march/unit availability.
