---
id: doc-06859327864c4c2a63be47e4bebd0d43
title: Expedition RPC contract and Dashboard automation
description: Captured expedition snapshots/start results, verified slot locks, hero selection and confirmation-driven Dashboard automation.
createdAt: '2026-11-14T07:48:08.339Z'
updatedAt: '2026-11-14T08:03:13.697Z'
tags:
  - expeditions
  - rpc
  - dashboard
  - heroes
---

# Expedition RPC contract and Dashboard automation

Implemented by @task-VHE-03VDQ4.

## Provenance

- `temp/tracking-data/hwa-game-record-202611141432_start_expedition.json`, client1.293.1010, SHA256 `527689ed2808fd77701d33382b94a15ea332a9d3388629578a2c619812202a95`, confirms five successful starts.
- `hwa-game-record-202611100940_dungeon.json` supplies complete `expeditionGet` rows; `hwa-api-202611021137_guild_versus.json` confirms running/completed/locked status shapes.
- Local splitlib `expedition_slot.json`:1523bytes, MD5 `17e4d5b73c4e58f35387785fca03165a`; `level_vip.json`:822bytes, MD5 `746c8d664f383779db14137e5573296e`. Both match their entries in `temp/asset-index-captured.json`. Packaged requirements are in `src/utils/expeditions.ts`; no runtime CDN fetch.

## Observed wire contract

`expeditionGet` has no feature and empty arguments. Its array response includes `id,slotId,status,heroes,endTime,duration,day,reward,power,rarity,storyId,attemptsLeft`. Expedition IDs are server-provided: the observed ID7 corresponds to slot8. Never substitute slotId for expeditionId.

Observed statuses:0locked,1available,2dispatched,3completed/collected. Status2 remains occupied after its timer reaches zero: display Ready to collect until the game supplies a release/collected snapshot. End time and duration are seconds; normalize endTime to epoch milliseconds for timers. Progress is clamped elapsed/duration; do not infer completion/collection from time alone.

`artifact_expeditionStart` has no feature and exactly `{expeditionId,heroes}`, with0..5distinct positive integer hero IDs. Examples: ID4 with heroes15/16/72/2/56 returns endTime1794641843; ID7 with an empty heroes array returns1794663090. An accepted response has `response.endTime`; optional `result.quests` describes quest progression, not claimed rewards. No gold/items are credited by a start. Shared-policy post-confirmation reads refresh expeditionGet and questGetAll. Correlated RPC errors settle rejection without inventing a timer.

## Eligibility and hero selection

Slots1/2/3require teamlevel20, slot4level25, slot5level30. Slot6requires active expedition subscription; slot7requires VIP8(5000VIPpoints); slot8is video and requires no heroes. Display all eight slots, including locked or unknown entries. Subscription status1is authoritative unlock evidence; no purchase/renewal action is issued. VIP points are resolved through the packaged official thresholds when account identity matches.

A current-day account-scoped server snapshot must show status1 and positive attemptsLeft before starting. Unknown/stale entries need refresh. Running/ready entries retain all occupied heroes, including overnight runs. Candidate heroes come only from heroGetAll, with finite positive recorded power. The planner orders eligible expeditions by descending server-required power, fits at most five heroes and substitutes weaker available heroes when they still satisfy that requirement. Teams are distinct across the batch. This deterministic heuristic does not promise a globally optimal assignment.

## UI and lifecycle

Dashboard Activities includes Expeditions progress and opens `ExpeditionsModal.vue`. The dialog shows each timer/progress, finish time, assigned heroes, eligibility and lock reason. Refresh requests userGetInfo/heroGetAll/expeditionGet/user_getNextDayTime under global RPC policy.

“Start available” is an explicit bounded run while the dialog is open. It recomputes each team from current cache and waits for the matching confirmed receipt or authoritative running snapshot before sending the next start. Queued acknowledgements do not prove completion. Stop/closing prevents subsequent starts; an in-flight mutation stays pending until confirmation. A30-second uncertainty message stops the sequence without retrying. Account transitions clear pending UI and prior expedition/hero cache associations. There is no background schedule, purchasing or timer polling RPC. Confirmed collection is supported by the explicit Collect action described below.

## Cache and verification

`expeditionStatus` stores accountId and normalized rows; `expeditionStartStatus` stores the last correlated outcome. Newer snapshot/receipt guards prevent stale starts from erasing current state. The legacy raw expeditionGet entry remains available for existing consumers; only the scoped canonical snapshot drives automation.

Tests: `tests/expeditions.test.mjs` replays capture-shaped starts, checks slot/ID mapping, locks, timer progress, hero power/reservation, pending/error/timeout/account behavior and the actual dialog setup; `tests/intercept.test.mjs` covers exact Direct validation and single-use Piggyback isolation. `tests/dashboard-state.test.mjs` checks the Activities launch route.


## Collect RPC and passive synchronization (2026-11-14)

Implemented by @task-VHE-GN1AQ2. Source `temp/tracking-data/hwa-game-record-202611141452_expedition_collect.json`, client1.293.1010, SHA256 `638211e935dbf800beec4da59a5cf3a3c0586f7388af90cb40d638e94b0f0b0b`.

`expeditionFarm` has no feature and exactly `{expeditionId:number}`. At07:52:23.702Z, ID1 returns `response:{reward:{consumable:{"35":7,"39":12}},newExpedition:null}`; at07:52:26.038Z, ID4 returns consumable36×4/40×7 with null replacement. Optional `result.quests` advances quest439progress252→253; its gold65000/consumable44reward is unclaimed and is not part of the expedition prize.

An accepted reward object with explicit `newExpedition:null` immediately sets the matching scoped row to status3, clears heroes/endTime and retains a collection timestamp. This works for native in-game collection and the helper alike. Receipt-token deduplication(100entries) and shared resource deltas credit only returned rewards once; newer/same-batch authoritative inventory snapshots take precedence. Quest progress supports dictionary/array caches without claiming quest prizes. Post-confirmation reads expeditionGet/inventoryGet/questGetAll follow global RPC settings.

The capture does not show a non-null replacement. Only a complete server-shaped replacement matching the slot is accepted as a new row; unfamiliar replacement shapes become Unknown and require expeditionGet. No replacement/attempt count is invented. Per-row observation dates prevent collecting one overnight run from refreshing unrelated prior-day idle slots. Same-time/stale snapshots cannot restore already-collected state.

The dialog shows Collect only on Ready rows and serializes collection with starts. It sends the exact captured ID payload, waits through queued acknowledgements and keeps uncertain operations pending without automatic retry. A matching receipt or newer collected snapshot settles the UI. RPC failures preserve the run and its hero reservations. Account switching clears collection state/receipts. Tests: `tests/expeditions.test.mjs`, `tests/intercept.test.mjs`.
