---
id: 0tzqnp
title: Hero and Titan Evolution Dual Reduction
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-02T06:44:20.415Z'
ttlDays: 90
sources:
  - extension/rpc-cache.js
tags:
  - evolution,cache,fragments
createdAt: '2026-11-02T06:44:20.415Z'
updatedAt: '2026-11-02T06:44:20.415Z'
---

heroEvolve and titanEvolve RPC actions increment unit star and deduct fragments simultaneously from inventoryGet.fragmentHero/fragmentTitan and resource:fragmentHero:*/resource:fragmentTitan:* keys, recording token in resourceActionHistory.
