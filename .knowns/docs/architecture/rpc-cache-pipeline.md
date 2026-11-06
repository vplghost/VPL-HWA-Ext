---
id: doc-5977b0645ae33e48fc00a5b8f7c90347
title: RPC Cache Pipeline
description: Passive RPC interception, delta reduction, resource keys, and action deduplication in HWA Helper
createdAt: '2026-11-02T06:43:06.566Z'
updatedAt: '2026-11-06T04:21:46.278Z'
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

## Shared RPC dispatch mode (2026-11-06)

The user rule in @doc/architecture/shared-rpc-settings applies to every extension-generated RPC. `popupRpcEnabled` gates dispatch and `socketRefreshMode` chooses Piggyback (default) or Direct for Experimental, Draft, manual refresh, claims, MQTT refreshes and action follow-ups. There are currently no implicit feature exceptions.

Background `rpcMessageForSettings` chooses `queue-rpc`/`queue-claim` or `refresh-rpc`; the interceptor enforces current settings again. Piggyback requires Monitor API, waits for the next native game fetch POST, preserves the native request ID and strips appended results from the game's response. Helper actions expire after two minutes, are consumed once, and do not retry automatically. Settings cancellation clears pending calls. The queue supports existing helper methods with separate read/action classifications.

Reward claims retain claim result status reporting. Experimental and Draft UI distinguish a queued request from a completed action. Settings UI remains `socket-refresh-mode` for storage compatibility, now labeled RPC dispatch method.

## Piggyback request body compatibility (2026-11-05)
A failed 40-second capture showed 17 successful game RPC batches and zero appended calls, but did not record the popup claim time. The interceptor had a confirmed gap: `preparePiggyback` only accepted a string in `fetch` options. The fetch wrapper now reads JSON from `Request.clone().text()` and `Blob.text()` before dispatch, preserving the original request when no queued call can be attached. While Record is active, helper interaction entries in the exported timeline report `piggyback-queued`, `piggyback-attached`, `piggyback-covered`, claim outcome, and expiry without saving claim arguments.


## Protocol reference catalog

The captured API/MQTT evidence index is @doc/api/observed-protocol-index. It links 177 RPC method/feature contracts, nine captured MQTT event types, source hashes, and detailed world-map command workflows. Use @doc/api/mqtt-processing-and-refresh to distinguish events observed in raw logs from additional names currently supported only by implementation/tests. This catalog is descriptive evidence, not a claim that every indexed method is safe to replay.
