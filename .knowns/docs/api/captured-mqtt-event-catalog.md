---
id: doc-0d0028b9e4a3bb19e742de8b5ea769ed
title: Captured MQTT Event Catalog
description: Nine MQTT event types observed in raw captures, with structural payload schemas and source evidence
createdAt: '2026-11-06T04:06:02.037Z'
updatedAt: '2026-11-06T04:06:02.037Z'
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
