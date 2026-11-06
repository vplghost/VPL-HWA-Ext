---
id: doc-efa631bed6e5592db82be3e99ebeef3c
title: MQTT Processing and Refresh
description: Captured versus implemented MQTT events, direct reduction, refresh routing, dispatch gates and remaining evidence gaps
createdAt: '2026-11-06T04:08:00.363Z'
updatedAt: '2026-11-06T04:21:46.457Z'
tags:
  - mqtt
  - api
  - reference
  - rpc
---

# MQTT Processing and Refresh

## Transport and evidence

Endpoint: `wss://emqx-hwmb-wss.nextersglobal.com/mqtt`. The extension observes MQTT PUBLISH frames over WebSocket; it does not establish a general MQTT client or publish arbitrary commands. Source: `extension/mqtt-capture.js`.

Nine event types are directly present in the current capture corpus, with counts/schemas in @doc/api/captured-mqtt-event-catalog. Additional names below have implementation/test evidence only. Source IDs and hashes: @doc/api/observed-protocol-index.

Observed event payload envelope:

```json
{
  "method": "msg",
  "result": {
    "type": "EVENT_TYPE",
    "body": {}
  }
}
```

The recorder's wrapper adds transport, endpoint, direction, topic, QoS, encoding, payload length, timestamp and truncation state. Body keys vary by event; do not require every push metadata field on every message. Topics can carry player-specific identifiers, which are deliberately not copied here.

## Captured events and current behavior

| Event | Raw capture evidence | Payload and meaning established by capture | Current extension handling |
|---|---|---|---|
| `rallyCreated` | S12, S13 | `rallyId`; creation notification | Requests `getMarches:march` when popup RPC is enabled. No direct full rally reduction. |
| `rallyCompleted` | S13 | `rallyId`; completion notification | Requests `getMarches:march`; name alone is not proof of victory or base return. |
| `newReport` | S13 | `reportId`, report `type`, push metadata varies | Adds pending unread/unclaimed report marker; requests report `getPage`. Uses `pushTs * 1000` when present, otherwise record timestamp. |
| `chatMessage` | S14 | Message/user/chat fields and optional push metadata | Only clan messages passing required-field checks merge into `guildChat`; private/other chat messages are not guaranteed handled by this reducer. |
| `routeCreated` | S12, S13, S14 | `routeId`, `from {x,y}`, `to {x,y}` | Captured; no direct cache reducer or automatic RPC refresh in `socketRefreshCalls`. Does not identify the user's squad by itself. |
| `routeCompleted` | S12, S13, S14 | `routeId` | Captured; no direct reducer/refresh. Does not alone tell whether route was outbound or return. |
| `mapChunksUpdated` | S12, S13, S14 | `chunks[] {x,y,updatedAt}` | Captured metadata; not full `getChunks` objects and not automatically fetched by this dispatcher. |
| `routeToMineCompleted` | S13 | `mineId`, `mineConfigId`, `squadId`, `startedAt`, `plannedDuration`, `plannedDurationMs`, `plannedGatheredResourceAmount`, push metadata | Captured; no direct reducer. Can support future authoritative gather-plan tracking. |
| `returnFromMineCompleted` | S13 | `squadId`, `reward[] {type,id,amount}`, push metadata | Captured; no direct reducer/refresh. Do not claim the extension currently credits this reward from this event. |

Exact source occurrence counts are in the captured-event catalog; source IDs above indicate domains, with the generated catalog serving as the authoritative source list.

## Implemented event contracts without a raw sample in this corpus

These are conditional expectations read from `extractSocket` and `socketRefreshCalls`, corroborated by tests. They are not additional observed wire contracts.

| Event | Fields currently required/read | Implemented effect |
|---|---|---|
| `specialQuestEvents` | `body.events` array | Replaces `specialQuestStatus` event snapshot. |
| `mobRallyAttackResult` | String `squadId`, string `rallyId`; reads `mobConfigId`, `battleResult.battleResult`, `routeToOutpost.startedAt` and duration | Transitions own rally squad to returning; stores result and return ETA/history. |
| `rallyUserAutojoined` | String `rallyId`, `squad.squadId`; reads squad heroes/units and route | Starts local auto-join march; refreshes `getRallyById` and `getMarches`. |
| `returnFromMobCompleted` | String `squadId` | Removes completed rally march. |
| `randomDraft_statusChanged` | Type name; body is not treated as full Draft state | Requests `randomDraft_getInfo`. |
| `questUpdateAll` | Type name | Requests `questGetAll` and `questGetEvents`. |
| `rallyMembersUpdated` | String `rallyId` matching an existing local rally march | Requests `getRallyById` for that rally. |
| `returnToOutpostFromMob` | Type name | Requests `getMarches`. |

Do not implement `routeToMineCompleted` by copying the differently named `returnFromMobCompleted` contract. Capture and domain identity matter more than similar names.

## Refresh requests and dispatch gates

All extension-originated RPCs follow @doc/architecture/shared-rpc-settings, including MQTT-triggered refreshes, manual refresh, Experimental commands, Draft, claims and automatic follow-ups. There are no implicit Direct exceptions.

Monitor API controls passive capture independently of Record. RPC dispatch requires `popupRpcEnabled === true`. `socketRefreshMode` defaults to Piggyback and accepts `direct` for separate immediate calls. Piggyback requires monitoring and waits for the next native game fetch RPC; settings changes clear queued calls. Mutating actions expire after two minutes without a carrier and are never retried automatically after dispatch.

Direct state reduction can occur with RPC dispatch disabled. A queued or forwarded request is not a completed server action. The game can issue its own refresh; repeated observations must not duplicate one-time resource effects.

Detailed request-ID and claim behavior: @doc/architecture/rpc-cache-pipeline and @doc/architecture/auto-claim-automation-bridge.

## Decoder and reducer boundaries

The frame decoder observes PUBLISH messages and retains QoS/direction metadata. Current limits in `mqtt-capture.js`: 1 MiB frame and 128 KiB payload. Invalid/incomplete packets cannot establish a contract.

`extractSocket` requires the exact MQTT endpoint, received direction, UTF-8 encoding and a nontruncated payload. Sent or base64/binary payloads do not establish inbound event state. JSON parse failures and unsupported events yield no direct cache updates.

No QoS flag or push counter is currently a complete application-level deduplication guarantee. Reducers should match entity IDs and timestamps and keep one-time resource effects idempotent.

## Time and identity conventions

- Route start/finish/arrival timestamps and durations consumed by world-map code are milliseconds. Prefer explicit `durationMs`.
- Draft `stageFinishTs` and `newReport.pushTs` are Unix seconds in implemented handling. Convert before comparing with `Date.now()`.
- Chat `ctime` can be a numeric string after normalization. Preserve its established units when sorting/unread matching.
- `rallyId`, `squadId`, `routeId`, `mineId`, `reportId`, user IDs and config IDs have distinct roles.
- A route/notification can be guild-wide or map-wide. Do not assign it to the local account without ownership evidence.

## Future capture checklist

For a new event, retain source filename/hash, direction/encoding, exact event name, structural body fields, ID relationships and the associated RPC/report before and after it. Establish timestamp units from surrounding routes, not field names alone. Capture win/loss and cancellation separately. Redact values before adding examples to docs.

Priority evidence gaps: raw win/loss `mobRallyAttackResult`, auto-join and rally base-return events, gather-plan changes, occupied/empty mine errors, expiry, and rejected rally delays. Current code/test coverage cannot replace those wire observations.

Implementation anchors: `extractSocket`, `socketRefreshCalls`, `hwaHelperRpcCache.merge`; tests `tests/mqtt-capture.test.mjs`, `tests/background.test.mjs`, `tests/rpc-cache.test.mjs`. Documentation task: @task-VHE-68C0H0.
