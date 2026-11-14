---
id: 6jiqu0
title: Mine attack snapshots and MQTT use enemy squad IDs for termination
key: mine-attack-snapshots-and-mqtt-use-enemy-squad-ids-for-termination
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T12:42:03.848Z'
sources:
  - '@doc/api/mine-incoming-attack-and-timed-withdrawal'
  - 'extension/rpc-cache.js:normalizeIncomingAttack'
  - 'extension/mine-defense.js:hospital'
  - tests/mine-defense.test.mjs
tags:
  - gathering
  - rpc
  - mqtt
  - hospital
createdAt: '2026-11-14T12:42:03.848Z'
updatedAt: '2026-11-14T12:42:03.848Z'
---

getIncomingMarches:march hydrates attacks already in flight; marchAttackDetected supplies equivalent toTargetPvp route/target fields. Compute impactAt as route.startedAt + durationMs and match mapId + mineId to the current account's own gathering march to identify the defending squad. marchAttackEnded.squadId is the ENEMY squad, so invalidate by stored enemySquadIds rather than recalling that ID. Hospital capacity sums healingCapacity increments through every completed Infirmary level; injuredUnits already includes units in the healing queue.
