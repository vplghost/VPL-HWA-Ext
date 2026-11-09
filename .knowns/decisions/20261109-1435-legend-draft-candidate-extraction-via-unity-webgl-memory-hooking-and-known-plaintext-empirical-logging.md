---
id: 20261109-1435-legend-draft-candidate-extraction-via-unity-webgl-memory-hooking-and-known-plaintext-empirical-logging
title: Legend Draft Candidate Extraction via Unity WebGL Memory Hooking and Known-Plaintext Empirical Logging
status: draft
supersedes: []
supersededBy: []
tags:
  - draft
  - legend-draft
  - unity
  - reverse-engineering
sources:
  - temp/tracking-data/hwa-game-record-202611091122_legend_draft.json
  - temp/tracking-data/hwa-game-record-202611090106_legends_draft.json
relatedDocs:
  - architecture/legend-draft-system
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '84b4d782db176668001018fad7a0c5aa4f2cf1da944e2a15b2047b3e1c5738c5'
reviewEvaluatedAt: '2026-11-09T07:35:49.166Z'
createdAt: '2026-11-09T07:35:49.166Z'
updatedAt: '2026-11-09T07:35:49.166Z'
---

## Context

In Legend Draft mode, server RPC randomDraft_getInfo returns a 25-byte Base64 draft string. When client submits a lineup via randomDraft_saveDefence or randomDraft_saveAttack with heroes outside the 25 decrypted candidates, the server rejects with ValidationError: Invalid heroes list. The game logic is compiled into WebAssembly (Unity IL2CPP).

## Decision

Adopt Direction 2 (Dynamic Runtime Memory Hooking into Unity WebGL HEAPU8 and Emscripten string bindings in extension/intercept.js) as the primary mechanism to extract candidate hero IDs when the draft UI loads. In parallel, adopt an Empirical Known-Plaintext Cryptanalysis logging protocol where the user and extension log tuples of (draft_raw_base64, visible_heroes) across matches to reverse-engineer the pure mathematical cipher algorithm (XOR/PRNG) as a standalone JavaScript contingency.

## Alternatives Considered

Direction 1 (Full static WebAssembly reversing with Ghidra/Il2CppDumper) was rejected due to high effort and fragility across game binary rebuilds. Direction 3 (View-only HUD without popup picking) was rejected because the user desires popup lineup picking capability once candidate pool validation is restored.

## Consequences

Extension intercept.js will hook into Unity WebGL instance (window.__hwaUnityInstance.Module.HEAPU8 and UTF8 decoding bridges). Popup UI will constrain candidate selections to verified candidates to prevent ValidationError. A logging utility will capture draft tuples to support the cipher analysis workflow.
