---
id: 4pmjgc
title: CDN item IDs must resolve through metadata and manifest texture names
key: cdn-item-ids-must-resolve-through-metadata-and-manifest-texture-names
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-06T09:42:48.275Z'
ttlDays: 90
sources:
  - 'scripts/sync-cdn-assets.mjs:manifestCandidates'
  - tests/cdn-assets.test.mjs
  - '@doc/workflows/versioned-cdn-asset-synchronization'
tags:
  - assets
  - cdn
  - integrity
createdAt: '2026-11-06T09:42:48.275Z'
updatedAt: '2026-11-06T09:42:48.275Z'
---

In game 1.293, gear item 1 uses `gear_6_new.img`, Astaroth uses `hero_0004_2.img`, and per-file paths/revisions come from the verified index. `manifestCandidates` rejects ambiguous basenames; `runSync` requires a matching startup index or versioned catalog. Do not guess a texture path from an item ID. See @doc/workflows/versioned-cdn-asset-synchronization.
