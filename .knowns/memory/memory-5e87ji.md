---
id: 5e87ji
title: Wheel free spin availability comes from remaining amount
key: wheel-free-spin-availability-comes-from-remaining-amount
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-03T06:22:30.613Z'
ttlDays: 365
sources:
  - '@task-VHE-NW3DPW'
  - extension/rpc-cache.js
  - extension/popup.js
tags:
  - wheel
  - rpc
  - popup
createdAt: '2026-11-03T06:22:25.104Z'
updatedAt: '2026-11-03T06:22:37.348Z'
---

For `userGetInfo.refillable` ID 62, `boughtToday === 0` does not prove a free spin remains. Derive availability from `amount > 0`; after a successful `alchemyUseFree`, keep the consumed state against older snapshots and show a refresh prompt when the daily reset time passes without new server data.
