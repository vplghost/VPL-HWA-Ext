---
id: h5cvlk
title: Mutable CDN latest manifest can mismatch a captured indexGet hash
key: mutable-cdn-latest-manifest-can-mismatch-a-captured-indexget-hash
layer: project
category: failure
status: active
lastVerified: '2026-11-13T17:55:35.718Z'
sources:
  - '@doc/architecture/observed-resource-inventory-metadata-and-retirement'
  - 'scripts/sync-cdn-assets.mjs:verifyAsset'
  - '@task-VHE-5SS41S'
tags:
  - cdn
  - assets
  - integrity
  - debug
createdAt: '2026-11-13T17:55:35.718Z'
updatedAt: '2026-11-13T17:55:35.718Z'
---

On2026-11-14, client1.293.1010's captured index.latest URL expecting dffc6e1e901230a6e303f6dcf03c8254 returned newer bytes with MD5559e939efba9a2e6a92022ee0bb095ae. Do not accept these as matching the old indexGet. Observed item icon extraction used the cached manifest verified against the existing catalog MD5c40122f2b0fb79fc5e133f9b9f9d5ee3, current verified splitlib metadata and per-texture size/MD5 checks. Unsupported mappings stayed unresolved; a true latest sync needs fresh matching indexGet evidence. See @doc/architecture/observed-resource-inventory-metadata-and-retirement.
