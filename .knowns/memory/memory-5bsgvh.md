---
id: 5bsgvh
title: Helper RPC actions require registration in helperActionMethods
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-08T10:10:49.392Z'
ttlDays: 90
sources:
  - extension/intercept.js
  - @task-VHE-X2SJ1X
  - @doc/architecture/shared-rpc-settings
  - @doc/architecture/mqtt-assisted-piggyback
tags:
  - rpc
  - piggyback
  - mqtt
createdAt: '2026-11-08T10:10:49.392Z'
updatedAt: '2026-11-08T10:10:49.392Z'
---

Mutating RPC calls queued from popup helper features (e.g. createRally, cancelRally, attackMob, attackMine, stopMineGathering, magicTower_*) must be registered in the helperActionMethods Set in extension/intercept.js. Any unlisted method is dropped before native carrier append and prevents the MQTT nudge trigger from firing. Evidence: @task-VHE-X2SJ1X, @doc/architecture/shared-rpc-settings, @doc/architecture/mqtt-assisted-piggyback.
