---
id: 6jiqu0
title: Mine attack snapshots and MQTT use enemy squad IDs for termination
key: mine-attack-snapshots-and-mqtt-use-enemy-squad-ids-for-termination
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T17:39:51.083Z'
ttlDays: 90
sources:
  - '@doc/api/mine-incoming-attack-and-timed-withdrawal'
  - 'extension/rpc-cache.js:normalizeIncomingAttack'
  - 'extension/mine-defense.js:hospital'
  - 'extension/mine-defense.js:plan'
  - tests/mine-defense.test.mjs
  - '@task-VHE-N7EWFF'
tags:
  - gathering
  - rpc
  - mqtt
  - hospital
createdAt: '2026-11-14T12:42:03.848Z'
updatedAt: '2026-11-15T07:54:19.862Z'
---

getIncomingMarches:march hydrates attacks already in flight; marchAttackDetected supplies equivalent toTargetPvp route/target fields. Compute impactAt as route.startedAt + durationMs and match mapId + mineId to the current account's own gathering march to identify the defending squad. marchAttackEnded.squadId is the ENEMY squad, so invalidate by stored enemySquadIds rather than recalling that ID. Hospital capacity sums healingCapacity increments through every completed Infirmary level; injuredUnits already includes units in the healing queue. Since0.10.83, defense requires wounded strictly >50% of positive total Infirmary capacity, independent of defending squad size; exactly50% does not trigger. Fresh snapshots and final10s impact window remain required. Canonical rule: @doc/specs/smart-auto-gathering and @doc/api/mine-incoming-attack-and-timed-withdrawal.
Since0.10.96, evaluateMineDefense and hwaHelperWorldRead reuse full incoming hydration plus passive deltas, with60s idle and15s active-attack freshness; a lone MQTT delta cannot replace the initial full snapshot. Coalescing preserves the final10s recall window. Optimization provenance: @doc/architecture/passive-first-gathering-march-observations and @task-VHE-F8X6B6.
