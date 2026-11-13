---
id: doc-59e19121b0b558e50444c3eca66392b8
title: Brigand camp RPC contract
description: Captured camp victory protocol, hero team, verified energy cost and Dashboard dialog limitations.
createdAt: '2026-11-13T09:14:39.529Z'
updatedAt: '2026-11-13T09:52:33.524Z'
tags:
  - brigand
  - world-map
  - rpc
  - energy
---

# Brigand Camp RPC contract

Implemented by @task-VHE-GVVBMR (settlement) and @task-VHE-DHB6KB (discovery). Evidence: `temp/tracking-data/hwa-game-record-202611131602_brigand.json` and `temp/tracking-data/hwa-game-record-202611131645_brigand_search.json`, game 1.293.1010. Private traces are optional tests; sanitized fixtures are mandatory.

## Discovery

The search capture at 2026-11-13T09:45:24.278Z observes exactly:

```json
{"name":"getCampSummary","feature":"camp","args":{}}
```

The successful response is `response.campsSummary`, containing `nextRespawnDt` (epoch milliseconds) and `camps[]`. Each camp has `id` (UUID), `campConfigId` and `defendersPack[]` with hero IDs, levels, stars and detailed equipment/skills. The trace contains six camps: config IDs [1,2,2,1,1,1], each with five defenders, nextRespawnDt 1794602724064. No map ID, coordinates, search radius or level argument is sent. The UI filters levels locally; config IDs 1–3 map to levels 1–3 in verified globalMapCamp config.

The reducer keeps `brigandCampSummary` only for confirmed array-shaped responses and `brigandCampSearchStatus` for confirmed success/failure. Error receipts retain the previous target list. Confirmed empty arrays replace it with an empty list. Older summaries cannot replace newer data. A successful winCampBattle removes its target from an older/current summary; a stale replay cannot re-add it. `availableCamps` hides targets at or after nextRespawnDt. This timestamp is a validity limit, not a synthetic new spawn event; search again to obtain authoritative replacements.

`getCampSummary` is a read scoped to feature `camp` in the intercept Piggyback allowlist. Search uses `useRpcCache.dispatchRpc` and inherits popupRpcEnabled, Monitor API and Direct/Piggyback/MQTT-assisted Piggyback policy. Search has no energy/resource actions.

## Team and settlement

The native client saves a hero-only team through:

```json
{"name":"battle_teamSet","args":{"key":"globalMapCamp","units":[[79,72,16,54,60]]}}
```

A successful null response is valid. `teamGetAll.globalMapCamp` supplies the canonical saved team; newer successful battle_teamSet updates supply the latest observed team until another snapshot.

The captured victory call is:

```json
{"name":"winCampBattle","feature":"camp","args":{"campId":"<selected target UUID>","userHeroesIds":[79,72,16,54,60]}}
```

The successful response contains `reward[]`. Observed rewards: lootboxChanced #27 ×1, coin #40077 ×135, gold ×15000, experience ×6. Preserve unknown reward types for display; account supported types through existing resource actions.

Client telemetry places winCampBattle after CampBattleThread / BattleScreen and the victory popup. It is a victory settlement endpoint. Attack Camp sends this observed call directly; it does not launch Unity battle simulation or the native animation. Direct live acceptance has not been verified. Neither trace proves a separate battle-start RPC or a camp troop march, so the implementation invents neither.

## World Energy

The captured remote config resolves globalMapCamp to [immutable configuration f45fde890a6683ceef09053f5b636c0b](https://hwmb-remote-config-cdn.nextersglobal.com/config/globalMapCamp/f45fde890a6683ceef09053f5b636c0b.json). Downloaded bytes matched that MD5. All three levels specify attackCost [{amount:10,id:2,type:"refillableResource"}]. World refillable #2 is World Energy, distinct from regular userGetInfo refillable #2 skill points. Popup never fetches the CDN at runtime.

A successful winCampBattle requires reward[] and no result/response error. The reducer retains brigandCampStatus, deducts 10 World Energy once using the request-ident token, and applies supported rewards. Require a known energy snapshot; respect regeneration, newer authoritative data, worldEnergyStatus consistency and the refill clock when spending from full. Failed/incomplete receipts do not spend energy or grant rewards. Native passive victories follow the same path.

Background requests refillableGetAll:refillable and inventoryGet after a confirmed win under the shared RPC policy. Disabled RPC permits passive reduction but sends no follow-up.

## Dialog

Dashboard opens BrigandCampModal beside Solo Monster. Search Camps requests the server summary, displays camps, defender names/levels and next respawn, and permits local level filtering and explicit target selection. The normal flow no longer requires entering UUIDs. Expired targets disappear and require a new search. A selected target missing from the current known list cannot be attacked. Attacking never happens automatically after search.

Team selection supports saved globalMapCamp and account custom teams, or 1–5 unique owned heroes. Show known regenerated World Energy and last server rewards/result. Search acknowledgment means queued/sent, not an empty result. Search errors are visible; after 30 seconds without a receipt a read may be retried. Attack waits for matching server confirmation and does not automatically retry a settlement. Completed targets are removed and changing accounts clears form/pending state.

## Verification

`tests/brigand-camp.test.mjs` covers discovery success/error/empty/stale receipts, expiration, no search energy cost, defeated target removal, actual Vue setup pending/result/error races, target selection/filtering, and optional six-camp trace replay. Existing settlement tests cover exact protocol, deduplication, energy regeneration/full-pool behavior, owned teams and failures. Intercept tests verify feature scoping, Piggyback modes and native-result filtering; background tests cover follow-up policy. Live game interaction has not been exercised.
