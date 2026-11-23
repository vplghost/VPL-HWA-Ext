---
id: 2ciaoh
title: Unity WebGL IL2CPP symbols.json maps Function Index not Table Index
layer: project
category: failure
status: proposed
tags:
  - unity,wasm,il2cpp,symbols,debug
createdAt: '2026-11-23T03:07:49.278Z'
updatedAt: '2026-11-23T03:07:49.278Z'
---

In Unity WebGL IL2CPP builds, symbols.json maps WASM Function Indices (from code section), whereas WebAssembly.Table requires Table Indices (from element segment). Using function index in table.get causes signature mismatch traps (e.g. func 1763 JSONNode_Parse is at table 133378; table 1763 contains func 1281 Predicate_1_Invoke). Cite: src/content/interceptor.ts
