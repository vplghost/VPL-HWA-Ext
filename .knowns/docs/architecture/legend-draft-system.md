---
id: doc-45cb642564ea6f7fbd7553c41c582fe2
title: Legend Draft System
description: Legend Draft state machine, 3-choice per step protocol, Unity WebGL hooking architecture, and empirical verification data
createdAt: '2026-11-02T06:43:38.355Z'
updatedAt: '2026-11-13T02:31:58.401Z'
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
- 2, 3: Defense Draft (picking 5 heroes sequentially across 5 steps, 1 from 3 choices per step)
- 4: Attack Draft (picking 5 counter-heroes across 5 steps, 1 from 3 choices per step, viewing opponent defense)
- 5: Ready for Battle
- 7: Match Completed (battle result delivered)

## Header Dialog & View Isolation
The Draft tab/banner has been replaced by a header dialog. The header icon is visible only for active stages 1–6 and opens the retained dialog modal (`#draft-modal-body`), without replacing `#view` or active tabs. Idle and completed stages hide the icon.

## Candidate Pool & Pick Selection Protocol (Empirically Verified)
Live gameplay captures and network RPC tracing (including match #358789279 and match #360504765) establish the exact drafting architecture:
1. **5 Steps × 3 Choices = 15 Offered Candidate Heroes:**
   - In each phase (Defense Draft and Attack Draft), the player is presented with **5 sequential steps (rounds)**.
   - For **each step**, the game UI presents exactly **3 candidate heroes** (e.g., Step 1: 3 heroes, Step 2: 3 heroes, Step 3: 3 heroes, Step 4: 3 heroes, Step 5: 3 heroes).
   - The player selects **1 hero per step**, resulting in a final 5-hero lineup.
   - *Correction of previous hypothesis:* The 25-byte string in idle/matching payloads was previously hypothesized to represent 25 candidate slots (5x5). Live tracking proves the candidate matrix is strictly **5 steps × 3 choices = 15 candidates per phase**.
2. **Server Validation Barrier:**
   - Lineup submission calls (`randomDraft_saveDefence` and `randomDraft_saveAttack`) send `{ "heroes": [id1, id2, id3, id4, id5] }`.
   - The server validates that each selected hero strictly belongs to the offered candidate pool for that match. Submitting any hero ID outside this pool results in immediate server rejection: `ValidationError: Invalid heroes list` (Error code 5).

## Empirical Findings & Live Verification (Match #360504765)
Analysis of live capture `temp/tracking-data/hwa-game-record-202611091943_draft_detail.json` and in-game selection log `temp/tracking-data/hwa-game-record-202611091943_draft_ingame.md`:

### 1. Defense Draft Phase (stageId = 2)
- **Server Payload:**
  - `draft`: 3112 base64 characters (2333 raw bytes). Prefix: `ezlWfTwlVCtyLh8sAQpRPkhmYE5JGAM9Tz58MHE/`
  - `draftEnemy`: 2236 base64 characters (1677 raw bytes). Prefix: `ezkALm16DTNgaAwnFwIGPk1nNBEUCxUuEWsmd35y`
- **In-Game Candidate Choices (3 per step) & Player Pick:**
  - **Step 1:** Chabba (11), Galahad (2), Phobos (6) → **Pick: 11 (Chabba)**
  - **Step 2:** Peech (75), Iris (54), Krista (25) → **Pick: 54 (Iris)**
  - **Step 3:** Oya (71), Eva (77), Peppy (18) → **Pick: 77 (Eva)**
  - **Step 4:** Julius (66), Cascade (67), Maya (36) → **Pick: 36 (Maya)**
  - **Step 5:** Daredevil (16), Aurora (1), Wodryn (78) → **Pick: 78 (Wodryn)**
- **Client RPC Submission:**
  - `randomDraft_saveDefence {"heroes": [11, 54, 77, 36, 78]}`
  - **Verification:** 100% exact match between in-game picks and submitted RPC payload. Server accepted without error and transitioned match to stageId 4.

### 2. Attack Draft Phase (stageId = 4)
- **Server Payload:**
  - `draft`: 2272 base64 characters (1702 raw bytes). Prefix: `ezlWfTwlVCtyLhsoAQpRPkhmYE5NHAM9Tz58MHE/`
  - `draftEnemy`: 748 base64 characters (561 raw bytes). Prefix: `ezkGLW16DTNgaAwnEQEGPk1nNBEUCxUuEWsmd35y`
  - Opponent profile: `Sabuco(JAPAN,)` (Lv.52, Clan: Legend, Rating: 1660).
- **In-Game Candidate Choices (3 per step) & Player Pick:**
  - **Step 1:** Mushy and Shroom (55), Ginger (14), Amira (62) → **Pick: 55 (Mushy and Shroom)**
  - **Step 2:** Xe'sha (61), Maya (36), Daredevil (16) → **Pick: 36 (Maya)**
  - **Step 3:** Kai (5), Corvus (501), Andvari (37) → **Pick: 5 (Kai)**
  - **Step 4:** Dante (15), Alvanor (503), Folio (64) → **Pick: 64 (Folio)**
  - **Step 5:** Byrna (72), Cleaver (8), Yasmine (45) → **Pick: 72 (Byrna)**
- **Client RPC Submission:**
  - `randomDraft_saveAttack {"heroes": [55, 36, 5, 64, 72]}`
  - **Verification:** 100% exact match between in-game picks and submitted RPC payload. Server transitioned match to stageId 5.

### 3. Battle Execution & Result Verification (stageId = 7)
- Battle RPC: `randomDraft_result {"matchId": 360504765}`
- Replay Attackers (`attackReplay.attackers`): `['5', '36', '55', '64', '72']` (Kai, Maya, Mushy and Shroom, Folio, Byrna).
- Defending team in defence replay: `['5', '23', '42', '44', '47']` (Kai, Astrid & Lucas, Markus, Morrigan, Martha).
- Outcome: Victory (`result: 0`).

### 4. Payload Size & Header Signature Comparison
| Stage | Stage ID | `draft` Base64 Length | `draft` Raw Bytes | `draftEnemy` Base64 Length | `draftEnemy` Raw Bytes |
|---|---|---|---|---|---|
| Idle / Searching | 1 | 36 chars | 25 bytes | 8 chars | 4 bytes |
| Active Defense Draft | 2 | 3112 chars | 2333 bytes | 2236 chars | 1677 bytes |
| Active Attack Draft | 4 | 2272 chars | 1702 bytes | 748 chars | 561 bytes |
| Battle / Completed | 7, 0 | 36 chars | 25 bytes | 8 chars | 4 bytes |

- **Header Signature:** Every `draft` payload across all stages begins with the exact same 8-byte prefix: `0x7B, 0x39, 0x56, 0x7D, 0x3C, 0x25, 0x54, 0x2B` (ASCII `"{9V}<%T+"`).
- Active draft payloads are full serialized state buffers (~1.7KB - 2.3KB) that include the hero pool, stars, artifacts, and opponent status.

## UI Selection Workflow
In the Extension UI:
1. When candidates are known for the current match (from `observedChoices` or Unity memory hook), the UI displays the **3 candidate hero cards** for the active step (`Step 1` to `Step 5`).
2. The user clicks 1 of the 3 cards to pick that hero for that step.
3. The UI automatically marks that step as picked and advances `activeDraftStep` to the next step, requiring only 5 clicks to complete the lineup.
4. If candidate choices are unprobed for a new match, the UI falls back to the searchable hero list with a clear advisory notice.

## Core Implementation Strategy: Unity Runtime Memory Hooking (Direction 2)
Because the game engine runs on Unity WebGL with IL2CPP compiled to WebAssembly (`.wasm`), the client application decodes the encrypted draft buffer in memory before rendering the 3D card draft interface.

### Technical Architecture
1. **Context & Execution Boundary:**
   - Extension injection runs in `world: "MAIN"` via [`extension/intercept.js`](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/extension/intercept.js).
   - The Unity WebGL instance is accessible via `window.__hwaUnityInstance` and its WebAssembly memory buffer `Module.HEAPU8`.
2. **Hooking Mechanism:**
   - **Bridge Interception:** Hook Unity engine string decoding exports (`UTF8ToString`, `AsciiToString`, `stringToUTF8`) or Emscripten dynCalls during the transition into Legend Draft UI.
   - **Candidate Pool Extraction:** Capture the array of candidate hero IDs as soon as Unity instantiates or binds the Draft UI components.
   - **State Broadcast:** Forward the extracted candidate IDs to `window.__hwa_legend_draft_candidates` and bridge to Extension Cache (`cache.legendDraft.candidates`).
   - **Popup Selection UI:** Popup only renders hero cards that exist within `cache.legendDraft.candidates`, preventing invalid hero submissions and eliminating `ValidationError`.

## Roadmap & Execution Focus
- **Phase 1 (Safe HUD & 3-Choice Step Picker):** Deliver clean 3-choice-per-step UI; disallow free selection of invalid heroes when candidates are known; log raw `draft` strings alongside captured draft actions.
- **Phase 2 (Unity Memory Hook Prototype):** Intercept Unity Emscripten string/data conversions in `extension/intercept.js` to extract candidate IDs from `HEAPU8`.
- **Phase 3 (Decoder Analysis & Finalization):** Compare logged empirical data against decoded heap values to formalize the mathematical decoding algorithm into pure JS.

## Vue 3 Dialog Implementation and RPC Tracking Scope
In the WXT + Vue 3 architecture, src/components/dialogs/DraftModal.vue provides retained dialog parity for the Legend Draft system.
- **Scope**: Implements strict 1:1 read/record parity for all observed RPC information without auto-pick, automated drafting, or client-side recommendation algorithms.
- **Tracked Information**:
  - Live stage status, stage description, and live countdown timer (stageFinishTs).
  - Opponent profile card: Name, level, guild/clan (enemyUser.clanTitle), avatar, and rating comparison (draftStatus.rating).
  - Match outcome card: Victory/Defeat, user rating delta (userDifRating), and BP EXP rewards (draftBpExp).
  - Team mode switcher: Interactive toggle between Defense Draft and Attack Draft.
  - Lineups: Displays player's 5-slot defense lineup (defenceHeroes) and attack lineup (ttackHeroes) with confirmed star ratings (★x), hero avatars, and role/faction badges.
  - Opponent counter lineup: Displays opponent's revealed defense lineup (enemyDefenceHeroes) during Attack Draft and opponent's attack lineup (enemyAttackHeroes) during Defense Draft.
  - Candidate pool: Displays candidate hero pool (legendDraft.candidates) when populated by game RPC or Unity memory hooks.
  - Error and status reporting: Surfaces server rejection errors (lastError, lastErrorCode, lastErrorAction).
- Provenance: src/components/dialogs/DraftModal.vue, 	ests/legend-draft-ui.test.mjs.
