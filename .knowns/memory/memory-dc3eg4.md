---
id: dc3eg4
title: skin_upgrade has no upgrade cost or updated balances
layer: project
category: failure
status: proposed
tags:
  - hero
  - skin
  - rpc
createdAt: '2026-11-03T16:22:20.565Z'
updatedAt: '2026-11-03T16:22:20.565Z'
---

The 2026-11-03 skin upgrade trace contains successful skin_upgrade(unitId, skinId) calls with response.reward=[] and no skin level, hero power, or stone balance. skinUpgradeAction advances a known cached skin level once, and the background api-record handler refreshes heroGetAll and inventoryGet for authoritative power and skin stone coins. Do not infer stone cost from this response.
