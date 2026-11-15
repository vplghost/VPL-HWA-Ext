---
id: 0t6z2k
title: 'Archived Wheel #62 remains shelved; Dashboard free video action is active'
key: wheel-feature-is-shelved-until-explicitly-resumed
layer: project
category: preference
status: active
confidence: high
lastVerified: '2026-11-14T18:57:59.595Z'
ttlDays: 90
sources:
  - User instruction on2026-11-06 to shelve Wheel/Free Spin
  - User request on2026-11-14 for free refillable_alchemyUseVideo in Dashboard Quick Actions
  - User request on2026-11-15 to automatically use free spin when timer expires
  - '@task-VHE-8SXKQF'
  - '@task-VHE-Q5STB2'
  - '@doc/architecture/rpc-cache-pipeline'
tags:
  - wheel
  - shelved
  - alchemy
  - user-preference
createdAt: '2026-11-06T04:32:15.061Z'
updatedAt: '2026-11-14T18:57:59.596Z'
---

The user shelved the former Wheel header/tracking on2026-11-06. Following the user's2026-11-14 request, @task-VHE-8SXKQF implements a small Dashboard Quick Actions free alchemy video button using the verified refillable_alchemyUseVideo({type:"alchemy"}) contract. The user's2026-11-15 expiry-auto-use request is implemented by @task-VHE-Q5STB2 as opt-in Settings Auto Free Spin with background scheduling and shared manual/auto confirmation state. The old refillable62 header badge and archived assumptions remain inactive; current library identifies alchemy_video as53. Canonical @doc/architecture/rpc-cache-pipeline; archive @doc/archive/shelved-wheel-of-fortune.

**Why:** The user explicitly requested the scoped Dashboard free53 action and later its timer automation; those completed features do not restore the old62 header UI or unverified cooldown assumptions.
