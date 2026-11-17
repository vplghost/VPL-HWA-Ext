---
id: qmejgg
title: WASM memory linear scan halts on static font glyph array
layer: project
category: failure
status: proposed
tags:
  - draft
  - wasm
  - unity
createdAt: '2026-11-17T11:37:17.495Z'
updatedAt: '2026-11-17T11:37:17.495Z'
---

Scanning Module.HEAPU32 linearly from address 0 for draft candidates halts on static font glyph tables at low memory (e.g. ptr: 11531296), producing false-positive candidate arrays [16, 17, 20, 24, ...]. Real Unity IL2CPP DraftCard[] objects reside on high dynamic heap (ptr > 2000000000). Direct stream cipher decoding in src/utils/legendDraftDecoder.ts bypasses WASM scanning entirely. Cite: @doc/architecture/legend-draft-system
