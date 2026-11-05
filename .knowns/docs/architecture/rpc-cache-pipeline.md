---
id: doc-5977b0645ae33e48fc00a5b8f7c90347
title: RPC Cache Pipeline
description: Passive RPC interception, delta reduction, resource keys, and action deduplication in HWA Helper
createdAt: '2026-11-02T06:43:06.566Z'
updatedAt: '2026-11-05T16:41:14.401Z'
tags:
  - architecture,cache,rpc
---

# RPC Cache Pipeline

## Overview
HWA Helper captures Hero Wars: Alliance RPCs passively using \intercept.js\ and reduces them into a unified in-memory snapshot store without holding locks or blocking game gameplay.

## Core Mechanisms
1. **Extraction (\pcCache.extract\)**:
   - Parses RPC calls matching registered method names (\methods\ mapping).
   - Maps methods into logical feature domains: \heroes\, \	itans\, \events\, \items\, \header\, \other\, \internal\.
   - Generates deduplication tokens using \call.ident\ and entity IDs (e.g. \\:heroEvolve:\\).

2. **Reduction (\pcCache.reduce\ / \merge\)\**:
   - **Snapshots**: Full state objects (\heroGetAll\, \	itanGetAll\, \inventoryGet\, \clanVersusStatus\, \dungeonStatus\, \legendDraftStatus\) overwrite older cached versions based on timestamp.
   - **Action Deltas**: One-time actions (\heroEvolve\, \	itanEvolve\, \heroUpgradeSkill\, \inventory_use\, \claimChest\) mutate specific slices (decrement fragments/potions, increment stars/skills) and track executed tokens in \esourceActionHistory\ to prevent replay.
   - **Resource Normalization**: Keyed resources (\esource:gold\, \esource:consumable:*\, \esource:fragmentHero:*\, \esource:fragmentTitan:*\) mirror inventory quantities for O(1) header/table lookups.

## MQTT live updates (2026-11-05)
`mqtt-capture.js` observes incoming MQTT PUBLISH frames whenever interception is enabled, including when Record is off. `background.js` passes normalized frames into `hwaHelperRpcCache.merge`; `extractSocket` in `rpc-cache.js` maps full `specialQuestEvents`, clan `chatMessage`, `newReport`, and `mobRallyAttackResult` payloads directly into cache, and `returnFromMobCompleted` removes the completed rally march. `randomDraft_statusChanged` is metadata only; background requests `randomDraft_getInfo` when Popup RPC is enabled. Other metadata-only events request the relevant report, quest, or march RPC under the same setting. The game itself may also issue those RPCs. Unix seconds in `stageFinishTs` differ from millisecond route timestamps and durations. Stage 6 is an active battle stage with a timer.
 `rallyUserAutojoined` also starts the local rally march from its squad and route, then requests `getRallyById` for member details when Popup RPC is enabled.

## WSS refresh dispatch mode (2026-11-05)
`socketRefreshMode` in local storage chooses Piggyback (default) or Direct when `popupRpcEnabled` is true. WSS metadata refreshes use `queue-rpc` in Piggyback mode and `refresh-rpc` in Direct mode. Reward claims use the same setting: `claim-rewards` is forwarded as `queue-claim` or `refresh-rpc`. `intercept.js` appends queued calls to the next game `fetch` POST to `/api/rpc`, preserves the game request ID, strips the stale body signature, records all results for cache reduction, and returns only the game's original results to the game. Queued claim actions expire after two minutes without a game RPC; they are not retried automatically after an RPC failure. The bridge records the claim outcome in `claimRpcStatus`, and the popup keeps rewards pending until the RPC completes. Draft submission and manual quick refresh retain their existing direct dispatch. Settings UI: `socket-refresh-mode` in `popup.html` and `popup.js`.

## Piggyback request body compatibility (2026-11-05)
A failed 40-second capture showed 17 successful game RPC batches and zero appended calls, but did not record the popup claim time. The interceptor had a confirmed gap: `preparePiggyback` only accepted a string in `fetch` options. The fetch wrapper now reads JSON from `Request.clone().text()` and `Blob.text()` before dispatch, preserving the original request when no queued call can be attached. While Record is active, helper interaction entries in the exported timeline report `piggyback-queued`, `piggyback-attached`, `piggyback-covered`, claim outcome, and expiry without saving claim arguments.
