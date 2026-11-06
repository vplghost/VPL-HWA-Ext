---
id: cmpz3m
title: Rally and gathering command payloads from captured game RPCs
key: rally-and-gathering-command-payloads-from-captured-game-rpcs
layer: project
category: pattern
status: active
lastVerified: '2026-11-06T03:50:20.732Z'
sources:
  - buildRallyCall
  - buildGatherCall
  - '@task-VHE-C0GGBR'
tags:
  - rally
  - gather
  - rpc
createdAt: '2026-11-06T03:50:20.732Z'
updatedAt: '2026-11-06T03:50:20.732Z'
---

`createRally:mob` sends `mapId`, `mobId`, a five-hero `squad` with `units`, and `startDelay` in milliseconds. `attackMine:mine` sends `mapId`, `mineId`, `battleType: pve`, and `squad`; `stopMineGathering:mine` sends `squadId`. The Experimental tab builders mirror these contracts and should be updated if later captures differ.
