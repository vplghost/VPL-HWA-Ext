---
id: 5e87ji
title: Wheel free spin requires cooldown and remaining amount
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
updatedAt: '2026-11-04T13:26:34.635Z'
---

Observed 2026-11-04 Tower-era game capture: userGetInfo.refillable ID 62 returned amount 1 and lastRefill 1793797226 while the Wheel screen showed a countdown. In rpc-cache.js userGetInfo extraction, require amount > 0 and expiry of the eight-hour lastRefill cooldown; popup.js refreshTimed keeps the countdown and prompts Check Wheel after expiry until a new snapshot confirms availability. boughtToday === 0 alone does not prove a spin is ready.
