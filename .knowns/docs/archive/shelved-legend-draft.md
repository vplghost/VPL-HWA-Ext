---
id: doc-e2e0a0934e12f6e0c8094fa14334e3d7
title: Shelved Legend Draft
description: Legend Draft feature suspended by user decision, rationale, findings and removal of all runtime artifacts
createdAt: '2026-11-17T12:37:16.009Z'
updatedAt: '2026-11-17T12:37:42.780Z'
tags:
  - archive,legend-draft,shelved
---

# Shelved Legend Draft

## Summary & User Decision
On 2026-11-17, the user explicitly decided to shelve the entire Legend Draft feature and purge all runtime references, components, decoders, and UI artifacts from the extension codebase.

### Core Rationale:
1. **In-game Experience Superiority**: The native game interface displays the 3 draft cards in real time, with high-fidelity 3D models, skill previews, and visual feedback that cannot be surpassed by a browser extension dialog.
2. **Impracticality of Client-Side Dynamic Cryptanalysis**:
   - The server encrypts the draft payload using per-match ephemeral stream cipher keys with variable-length shift offsets caused by player profile serializations (`enemyUser`).
   - Dynamic decryption of arbitrary new matches cannot be guaranteed without full reverse-engineering of Unity WebAssembly routines.
   - Blind memory scanning in WebAssembly heaps proved unreliable and prone to false-positive array detections (such as internal roster arrays).
   - Hooking stripped Unity WASM binaries is fragile and breaks on every weekly game build update.
3. **Clean Codebase & Lean Bundle**: Purging unused modal components, telemetry hooks, decoder profiles, and state reducers reduces the extension bundle size and eliminates dead code.

## Preserved Historical Evidence
- Verified 5 matches: `#360295686`, `#360504765`, `#362806945`, `#362834396`, `#362841385`.
- All matches verified that drafting strictly offers 5 sequential steps with exactly 3 candidate heroes per step (15 unique offered heroes per phase).
- Server rejects any submission with hero IDs outside the offered candidates (`ValidationError: Invalid heroes list`, code 5).
- Reference analysis preserved in `docs/LEGENDS-DRAFT-ANALYSIS.md` and test fixtures in `temp/tracking-data/`.

## Conditions for Resuming Work
Should the feature ever be revisited in the future, it must be resumed ONLY under the following conditions:
1. Direct extraction of the C# client decoding method via decompiled IL2CPP assemblies, OR
2. Native game client API export providing plaintext draft cards directly, OR
3. Visual recognition (Canvas OCR) at the rendering layer rather than network cipher reverse-engineering.
