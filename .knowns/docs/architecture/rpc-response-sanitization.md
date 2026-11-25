---
id: doc-fd0fa3360df6f3556de833d52fe946b9
title: RPC Response Sanitization
description: Error-only teamGetAll RPC sanitization, Unity login crash recovery, and document_start setting sync pattern
createdAt: '2026-11-25T13:21:35.236Z'
updatedAt: '2026-11-25T13:21:35.236Z'
tags:
  - architecture,rpc,interceptor,sanitizer,recovery
---

# RPC Response Sanitization & Login Crash Recovery

## Context & Provenance

- **Source commit:** `77e2c4a` (`v0.11.303`, 2026-11-25)
- **Implementation:** `src/services/rpcSanitizer.ts`, `src/content/interceptor.ts`, `src/content/bridge.ts`, `src/components/tabs/SettingsTab.vue`, `src/utils/dataBackup.ts`
- **Verification:** `tests/rpc-sanitizer.test.mjs`, `tests/bridge-entrypoint.test.mjs`

## Root Cause (Unity WebGL `OnLoginComplete` Crash)

During `mobileLogin` batch initialization, Unity executes:

```text
GameModel.OnLoginComplete
  -> PlayerHeroManager.init(heroGetAll, teamGetAll)
  -> PlayerTeamData.init(data)
  -> PlayerTeamData.createTeam(rawTeam)
  -> DataObject+ValueObject<T>.get_Keys()
```

Multi-team keys in `teamGetAll` (`grand`, `clan_boss`, `champClanDefence_heroes`) are expected to be 2D arrays of sub-teams (e.g. `[[h1..h5], [h6..h10], [h11..h15]]`). If server state becomes corrupted and returns a flat 1D array of hero IDs (e.g. `grand: [16, 54, 79, 72, 60]`) or a bare scalar/primitive for any team key, Unity invokes `.Keys` on `ValueObject<T>`, throwing:

`System.InvalidOperationException: Operation is not valid due to the current state of the object.`

This aborts `OnLoginComplete` and permanently stalls the game at `preloader_finished` across all browsers and devices until the server slot is overwritten.

## Error-Only Interception Pattern

To avoid interfering with healthy traffic, response sanitization follows strict error-only rules:

1. **Fast-path pre-check (`hasTeamGetAllRequest`)**: Skips any RPC whose request body does not contain `teamGetAll` (zero JSON parse or response clone overhead on ~99.9% of requests).
2. **Pure validation & minimal repair (`sanitizeTeamGetAllRpcPayload`)**:
   - Multi-team keys (`MULTI_TEAM_KEYS`): wraps a flat 1D primitive array into `[val]`; filters out non-object elements from mixed arrays.
   - Any team key with a bare scalar/primitive value: replaces with `[]`.
   - Healthy payloads return `{ mutated: false, fixes: [] }` without modifying the object.
3. **Zero-copy passthrough on valid data**: In `src/content/interceptor.ts`, a new `Response` is constructed and logged ONLY when `sanitizedResult.mutated === true`. Valid `teamGetAll` responses return the original `Response` untouched.

## `document_start` Settings Sync Pattern

Because `mobileLogin` fires very early during page load (potentially before the isolated-world `bridge.ts` finishes async `chrome.storage.local.get`), MAIN-world interceptor toggles require a two-layer sync:

1. **Canonical storage**: `sanitizeTeamEnabled` in `chrome.storage.local` (default `true`), toggled via `#sanitize-team-enabled` in `SettingsTab.vue` and included in `dataBackup.ts` `CONFIG_KEYS`.
2. **Control channel + `localStorage` fallback**: `bridge.ts` propagates `sanitizeTeamEnabled` via `createControlPayload()` (`hwa-helper-config` `postMessage`). `interceptor.ts` caches the latest value in `localStorage` (`hwa_sanitize_team_enabled`) and reads it synchronously at `document_start`.

## Permanent Server-Side Recovery

When a player hits a corrupted `teamGetAll` slot:
1. Keep **Sanitize Team Data** enabled so Unity passes `OnLoginComplete` and loads into the city.
2. Open the affected mode in-game (e.g. **Grand Arena**) and save/update the team formation or fight one battle so the native game client overwrites the corrupted slot on Nexters' server.
3. Once overwritten, the account loads normally on all browsers/devices even with the extension disabled.
