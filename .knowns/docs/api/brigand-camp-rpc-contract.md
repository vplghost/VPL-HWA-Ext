---
id: doc-59e19121b0b558e50444c3eca66392b8
title: Brigand camp RPC contract
description: Captured camp victory protocol, hero team, verified energy cost and Dashboard dialog limitations.
createdAt: '2026-11-13T09:14:39.529Z'
updatedAt: '2026-11-13T09:15:14.984Z'
tags:
  - brigand
  - world-map
  - rpc
  - energy
---

# Brigand Camp RPC contract

Implemented by @task-VHE-GVVBMR. Evidence: `temp/tracking-data/hwa-game-record-202611131602_brigand.json` (game 1.293.1010, exported 2026-11-13T09:02:18.473Z). Private capture is optional for tests; sanitized fixtures are in `tests/brigand-camp.test.mjs`.

## Observed protocol

The native client saved a hero-only team at 09:01:50.399Z:

```json
{"name":"battle_teamSet","args":{"key":"globalMapCamp","units":[[79,72,16,54,60]]}}
```

Successful response is `null`. `teamGetAll.globalMapCamp` is the canonical saved team; a newer successful `battle_teamSet` supplies the latest observed team until the next snapshot.

At 09:02:02.924Z the client sent:

```json
{"name":"winCampBattle","feature":"camp","args":{"campId":"<target UUID>","userHeroesIds":[79,72,16,54,60]}}
```

The successful response contains `reward`, an array of typed amounts. Captured reward: lootboxChanced #27 ×1, coin #40077 ×135, gold ×15000 and experience ×6. Preserve unknown reward types for display; do not invent resource accounting for unsupported types.

Client telemetry places `winCampBattle` after CampBattleThread / BattleScreen and the victory popup. It is a victory settlement endpoint, not evidence of a separate battle-start or simulation RPC. The extension sends this observed endpoint directly on an explicit Attack Camp click; it does not run Unity battle simulation or show the native animation. Live acceptance of this direct action has not been verified.

## Verified World Energy cost

The captured remote-config index resolves globalMapCamp to [immutable configuration f45fde890a6683ceef09053f5b636c0b](https://hwmb-remote-config-cdn.nextersglobal.com/config/globalMapCamp/f45fde890a6683ceef09053f5b636c0b.json). All three camp levels specify `attackCost: [{"amount":10,"id":2,"type":"refillableResource"}]`. World refillable #2 is World Energy; it is distinct from the regular userGetInfo refillable #2 skill-point resource.

`hwaHelperRpcCache.extract` recognizes a successful `winCampBattle:camp` only when `response.reward` is an array and neither the result nor response has an error. It retains `brigandCampStatus`, applies a -10 World Energy resource action with a request-ident deduplication token, and applies supported rewards through existing resource actions. Energy deduction requires an existing World Energy snapshot, honors regeneration and newer authoritative snapshots, updates worldEnergyStatus consistently, and restarts the refill clock when spending from a full pool. Failure and incomplete receipts never spend energy or grant rewards. A passive native victory is processed identically to a dialog request.

After a successful receipt, the background requests `refillableGetAll:refillable` and `inventoryGet` using the existing popup RPC enablement and Direct/Piggyback policy. Disabled RPC still allows passive cache reduction but sends no follow-up request.

## Dialog behavior and evidence limits

`BrigandCampModal` is mounted globally and opened by the Dashboard button directly beside Solo Monster. It supports explicit camp UUID entry, 1–5 unique owned heroes, the saved globalMapCamp team or account custom teams, known World Energy, and last server result/rewards. It waits for a matching captured server receipt; transport acknowledgment and timeout do not count as success or permit automatic retry. A newer receipt for another camp is ignored. A last-confirmed defeated camp cannot be immediately resubmitted. Changing accounts clears local form/pending state.

The capture contains no camp search RPC, no camp list or camp objects in getChunks, and no march returned by winCampBattle. Consequently there is no fabricated search API, inferred available target, generated camp UUID, or camp march in the dashboard. The user currently supplies an active camp UUID from game tracking. A capture of finding/selecting camps is required to implement automatic discovery. The already-completed camp UUID from this capture is never prefilled as a new target.

`winCampBattle` is explicitly allowed as an action in the intercept Piggyback queue. Queue deduplication, expiry, non-retry after dispatch failure, helper-result filtering, and global RPC policy remain shared with existing actions.

## Verification

`tests/brigand-camp.test.mjs` proves successful/rejected/incomplete receipts, repeated replay, absent/newer energy snapshots, regeneration and full-pool refill timing, saved teams, input constraints, actual dialog setup pending/error/race behavior, and optional private capture replay. Intercept tests prove one-shot Piggyback dispatch and native response filtering; background tests prove follow-up refresh policy. Live game interaction has not been exercised.

Downloaded globalMapCamp JSON was verified with MD5 `f45fde890a6683ceef09053f5b636c0b`, matching its immutable CDN path. Popup code does not fetch this CDN at runtime.

Final verification: full suite 611 tests, 599 passed, 12 optional private-data skips, zero failures; typecheck and production build passed. No live battle has been sent during development.
