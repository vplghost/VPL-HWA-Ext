---
id: a8okpa
title: Persisted RPC matching must ignore object key order
key: persisted-rpc-matching-must-ignore-object-key-order
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-07T02:23:26.270Z'
ttlDays: 90
sources:
  - 'extension/raid-queue.js:sameCall'
  - tests/raid-queue.test.mjs
  - '@task-VHE-5PHK0V'
tags:
  - raid
  - rpc
  - storage
createdAt: '2026-11-07T02:23:26.270Z'
updatedAt: '2026-11-07T02:23:26.270Z'
---

Raid queue advance compared expected RPC args using JSON.stringify. Reordering keys during storage round trips caused successful search/create responses to be ignored until timeout. Compare nested values structurally while retaining array order; regression: tests/raid-queue.test.mjs, persisted calls match responses after storage reorders object keys.
