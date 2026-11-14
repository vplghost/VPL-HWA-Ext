---
id: doc-faf9031aaab728d187e1eebf6ef53dd4
title: Mine incoming attack and timed withdrawal
description: Verified incoming-march RPC/MQTT, hospital capacity and timed recall evidence from Nov14 attack captures
createdAt: '2026-11-14T12:31:09.369Z'
updatedAt: '2026-11-14T12:38:22.346Z'
tags:
  - rpc
  - mqtt
  - gathering
  - defense
---

# Mine incoming attack and timed withdrawal

## Evidence

- `temp/tracking-data/hwa-game-record-202611141920_firstattack.json`, SHA256 `246b5c78313454ffca9964c3455a58ceb19d1513a660dd78b747694e33d2af68`: captures login while an attack is already in flight (12:19:15.715–12:20:02.524Z).
- `temp/tracking-data/hwa-game-record-202611141923_under_attack2.json`, SHA256 `022c45c6c9b01e0b89a6a706fa5fe6788db041400ffc4853757809707a51a49e`: live attacks from detection through result/return (12:20:45.423–12:23:33.573Z).

Related @task-VHE-CB9VBW and @doc/specs/smart-auto-gathering.

## Confirmed incoming contracts

RPC `getIncomingMarches:march`, args `{}`, returns `attacks[]`, `scouts[]`, `clans[]`. Each attack includes `mapId`, target mine identity/type/config/coordinates, route with `routeId`, `type=toTargetPvp`, version, attacker leader, from/to objects, startedAt and durationMs (also duration). `squads[].squad.squadId` belongs to the enemy, not the defending gatherer. MQTT `marchAttackDetected` provides the same attack shape plus `pushUserId` for recipient scoping. Match map + target mine to the current player's own gathering march to select the defending squad.

MQTT `marchAttackEnded` contains the enemy squadId, mapId and pushUserId. `routeCompleted` identifies a terminal route. `gatheringMineCompleted` identifies the own mine/squad, actual return route and battle losses. Bare routeCreated coordinates are insufficient to establish hostility.

## Timings

Predicted impact = route.startedAt + route.durationMs; recall window is [impact−10000, impact), not the remaining gather duration.

- Late-load first attack: route `476a2092-9cd5-4e24-8bfb-e67b9df03f59`, impact1794658795363; recall window starts12:19:45.363Z. Result observed12:19:55.844Z.
- Full attack1: route `83fbcf4f-6806-4bc6-95f4-272b309434da`, detected12:21:02.061Z, impact1794658920613 (12:22:00.613Z); window starts12:21:50.613Z. Enemy squad `92359ac8-4b4a-44d7-9975-f00972a0e34c`; ended12:22:01.505Z.
- Full attack2: route `fc41ce6e-f2f6-4317-a438-36fadd085b4c`, impact1794658999621 (12:23:19.621Z); window starts12:23:09.621Z. Enemy squad `bda02ef3-5e12-4a6d-bf42-3ff3a20676df`; ended12:23:19.934Z.

Observed results lag planned impact by a fraction of a second. Expire queued recall at planned impact; do not rely on that lag as extra time.

## Hospital evidence

Building IDs162/174/175 are Infirmary1/2/3. Sum healingCapacity absolute rewards cumulatively through each completed building level; each level bonus is an increment, not the total. Metadata generator verifies building/buildingLevel/bonus MD5 filenames and packages capacities.

Captured levels:162 L19=11900,174 L18=11200; total23100. `getHealing:unit.injuredUnits` totals11188, so free11912. Healing queue units are already part of injuredUnits; do not add them again or assume elapsed healing timer completed the server mutation. Threatened captured squads have4194 and4065 troops, so the original insufficient-capacity rule correctly does not recall with those captured hospital values. Tests simulate a fuller hospital to prove the positive path.

## Resume and limitations

`getChunks:globalMap` mine rows expose optional `gatheringUser.userId`. The first targeted mine changes from own user1216438103 to attacker1216271427 after impact, then becomes vacant. Resuming must avoid a known hostile occupier; never turn a defensive withdrawal into an automatic PvP attack. Shared RPC settings remain authoritative: Direct can send at wake time; Piggyback needs a natural game RPC before the impact deadline, so no delivery guarantee is claimed.

## Implementation and verification

`incomingMineAttacks` stores normalized account-scoped routes, versions, snapshot times and bounded terminal route/enemy-squad tombstones. Newer snapshots remove absent threats without erasing newer MQTT deltas; terminal attacks cannot revive from replay. Stale mine-completion events cannot retire newer attacks.

`mine-defense.js` uses current building/healing/march/unit snapshots. It compares the actual defending squad's troops with hospital free space. It schedules the wake at impact−10s through the content bridge and an MV3 alarm fallback, rechecks all eligibility at wake, and sends stopMineGathering with expiresAt=impact. Different attacked squads retain independent confirmations and RPC groups. Unknown/stale capacity or troop data causes refresh; no unsafe default is used.

Successful recall acknowledgement feeds the existing confirmed-return and interrupted-mine lifecycle. Defensive resume targets are excluded until after the attack and a fresh getChunks observation confirms vacancy; known hostile or unknown occupancy causes normal gathering to choose another safe candidate. Pausing/disabling RPC cancels queued defense groups without pretending that already-sent recalls did not happen.

Tests: tests/mine-defense.test.mjs uses the checked-in minimal capture fixture tests/fixtures/mine-attacks-20261114.json, the actual reducer, planner and background controller. Covers late-load hydration, captured sufficient capacity, simulated crowded hospital, exact10s/impact bounds, MQTT/end/replay/version/account guards, overlapping attacks, successful recall acknowledgement and Piggyback expiry. Live game validation remains pending user operation after extension reload.
