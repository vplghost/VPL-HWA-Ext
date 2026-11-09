---
id: doc-45cb642564ea6f7fbd7553c41c582fe2
title: Legend Draft System
description: Legend Draft state machine, 25-byte cipher protocol, Unity WebGL runtime memory hooking architecture, and empirical cryptanalysis plan
createdAt: '2026-11-02T06:43:38.355Z'
updatedAt: '2026-11-09T07:35:34.732Z'
tags:
  - draft
  - legend-draft
  - pvp
  - unity
  - hooking
  - cryptanalysis
---

# Legend Draft System

## Overview
Legend Draft is a synchronized PvP drafting mode in Hero Wars: Alliance consisting of alternating defense and attack picking phases followed by automated combat.

## Stage Lifecycle (stageId)
- 0: Not in match / Idle
- 1: Matching / Searching for opponent
- 2, 3: Defense Draft (picking 5 heroes from candidate pool)
- 4: Attack Draft (picking 5 counter-heroes while viewing opponent defense)
- 5: Ready for Battle
- 7: Match Completed (battle result delivered)

## Header Dialog & View Isolation
The Draft tab/banner has been replaced by a header dialog. The header icon is visible only for active stages 1–6 and opens the retained dialog modal (`#draft-modal-body`), without replacing `#view` or active tabs. Idle and completed stages hide the icon.

## Candidate Pool & Validation Protocol
Empirical analysis of tracking logs (`hwa-game-record-202611090106_legends_draft.json` and `hwa-game-record-202611091122_legend_draft.json`) reveals:
- When calling `randomDraft_getInfo`, the server delivers encrypted payloads:
  ```json
  {
    "stageId": 1,
    "draft": "ai9IcQFeRzJOdkJPJhpIfV5+XTUFRWp8Xg==",
    "draftEnemy": "f3hGfA=="
  }
  ```
- Base64 decoding of `draft` yields exactly **25 raw bytes** (`[0x6a, 0x2f, 0x48, 0x71, 0x01, ...]`).
- These 25 bytes correspond to 5 draft rounds × 5 offered candidate heroes = **25 hero candidate slots**.
- When submitting defense or attack lineups (`randomDraft_saveDefence` / `randomDraft_saveAttack`), the client submits 5 chosen hero IDs (`heroes: [id1, id2, id3, id4, id5]`).
- **Server Validation Barrier:** The server verifies that all 5 chosen hero IDs strictly belong to the decrypted 25 candidate pool for that match. Submitting arbitrary hero IDs outside this pool results in immediate server rejection: `ValidationError: Invalid heroes list`.

## Core Implementation Strategy: Unity Runtime Memory Hooking (Direction 2)
Because the game engine runs on Unity WebGL with IL2CPP compiled to WebAssembly (`.wasm`), the client application decodes the 25 bytes in memory before rendering the 3D card draft interface.

### Technical Architecture
1. **Context & Execution Boundary:**
   - Extension injection runs in `world: "MAIN"` via [`extension/intercept.js`](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/extension/intercept.js).
   - The Unity WebGL instance is accessible via `window.__hwaUnityInstance` and its WebAssembly memory buffer `Module.HEAPU8`.
2. **Hooking Mechanism:**
   - **Bridge Interception:** Hook Unity engine string decoding exports (`UTF8ToString`, `AsciiToString`, `stringToUTF8`) or Emscripten dynCalls during the transition into Legend Draft UI.
   - **Candidate Pool Extraction:** Capture the array of 25 hero IDs as soon as Unity instantiates or binds the Draft UI components.
   - **State Broadcast:** Forward the extracted candidate IDs to `window.__hwa_legend_draft_candidates` and bridge to Extension Cache (`cache.legendDraft.candidates`).
   - **Popup Selection UI:** Popup only renders hero cards that exist within `cache.legendDraft.candidates`, preventing invalid hero submissions and eliminating `ValidationError`.

## Contingency & Algorithmic Decoding Strategy: Empirical Known-Plaintext Analysis
To prepare for a pure JavaScript decoder that eliminates the requirement for the game tab to remain open on the Draft screen:

### Data Logging Protocol
1. **Capture Pairs:**
   - For every draft match played, log the tuple:
     - `draft_raw_base64`: Raw 25-byte Base64 string from `randomDraft_getInfo`.
     - `visible_heroes`: The 25 hero IDs (or hero names) observed on screen across the 5 selection rounds.
     - Context metadata: `userId`, `ctime`, `stageId`, and any associated seed/salt fields.
2. **Cryptanalysis & Statistical Correlation:**
   - With 5–10 verified `(cipher_25_bytes, plain_25_hero_ids)` pairs:
     - **Linear Key/XOR Check:** Evaluate `K[i] = cipher[i] ^ plain[i]`. If `K[i]` is invariant across matches, the cipher is static XOR.
     - **Modular Arithmetic Check:** Evaluate `(cipher[i] - plain[i]) mod 256` or substitution lookup table.
     - **PRNG / LCG Seed Deduction:** Analyze if byte sequence follows a Linear Congruential Generator `K[i+1] = (A * K[i] + C) mod M` seeded by `userId` or round timestamp.
3. **Pure JS Decoder Integration:**
   - Once the decoding formula is solved, implement `decodeLegendDraft(base64Str) -> number[]` in `extension/rpc-cache.js`.
   - The extension will then decode candidate pools instantly from network packets without waiting for Unity memory hooks.

## Roadmap & Execution Focus
- **Phase 1 (Safe HUD & Logging):** Maintain safe UI (disallow free selection of invalid heroes to prevent errors); log raw `draft` strings alongside captured draft actions.
- **Phase 2 (Unity Memory Hook Prototype):** Intercept Unity Emscripten string/data conversions in `extension/intercept.js` to extract candidate IDs from `HEAPU8`.
- **Phase 3 (Decoder Analysis & Finalization):** Compare logged empirical data against decoded heap values to formalize the mathematical decoding algorithm into pure JS.
