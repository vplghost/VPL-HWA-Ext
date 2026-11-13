---
id: doc-311d63103d45d9eea3e8bff46c352e51
title: Tower Floor Count from Splitlib
description: Verified Tower floor count and terminal-template linkage from indexed protobuf static library; regeneration, provenance and completion rules.
createdAt: '2026-11-13T13:53:55.586Z'
updatedAt: '2026-11-13T13:53:55.586Z'
tags:
  - tower
  - splitlib
  - configuration
  - protobuf
---

# Tower floor count from splitlib

## Verified configuration — 2026-11-13

The game static library contains the Tower layout. There is no total-floor field in the inspected `magicTower_rule.json` or Tower entry in the captured `index.configs` remote-config map. Use `indexGet.lib["splitlib.json.zip"]` together with `staticVersionUrl` to locate the versioned library; the strategic `buildingLevel`/`bonus` remote configurations are a different source.

The verified static version is **1.293.0**. This is a pinned library artifact, not a claim that every future game version has the same layout. The 2026-11-03 recorded run in @doc/architecture/tower-rpc-session-and-progress-model independently ends with the boss at floor 23, matching the user's 2026-11-13 in-game observation.

| Source | Verified value |
| --- | --- |
| Archive URL | `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.293.0/v0049/d973530195826f1575a002f97a3f30e9/lib/splitlib.json.zip` |
| Archive size / MD5 | `5572457` bytes / `46e298e9f4305c4264057cbeb7fbf6bd` |
| `magicTower.pb` size / SHA-256 | `649` / `7f5b500ca3a383b75bd6e0034eba1d2c24a465849a40fcd7007d591886362ba0` |
| `magicTowerFloorTemplate.pb` size / SHA-256 | `2268` / `a448286933d49b708db60e04a3abf2dbec2766c90133df7aa8bb5c42874e5b21` |

The CDN archive was downloaded on 2026-11-13, checked against `docs/assets-1.293.0-catalog.json` size/MD5, and read with ZIP CRC verification. Its two Tower tables exactly matched the locally captured splitlib files. Public original table bytes are committed in `tests/fixtures/tower/`; private tracking captures remain excluded.

## Extracted layout and binary format

The following field meanings are inferred from the indexed records and cross-table references, with the terminal title and observed run providing independent confirmation:

- `magicTower.pb`: indexed row IDs are contiguous **1–23**. Row field 1 is its ID; field 2 links to a floor-template ID. Row 23 references **template 12**.
- `magicTowerFloorTemplate.pb`: template 12 has field 6 equal to **`MAGIC_TOWER_FLOORLAST_TITLE`**, with view asset `floor_boss` and icon `magic_tower_floor_icon_boss.png`. Template 13 uses `MAGIC_TOWER_FLOORCHEST_TITLE`; normal templates use `MAGIC_TOWER_FLOOR_TITLE`.
- `magicTower_rule.json` supplies battle mechanics, random-room and skip rules, but does not supply a total floor count. Reward and narrative tables must not be counted as playable floors.

The indexed protobuf container begins with two little-endian uint32 sizes: index bytes and row-data bytes. The protobuf index has repeated field-1 messages containing row ID in field 1 and cumulative row end offset in field 2. Each slice in the row-data region is a protobuf row. `magicTower.pb` has 156 index bytes, 460 row-data bytes and a 25-byte protobuf tail (field 2, packed template IDs). That tail is not additional indexed floors. `magicTowerFloorTemplate.pb` has 98 index bytes and 2162 row-data bytes without a tail.

`indexedRows` validates sizes, wire bounds, unique index IDs and row-ID agreement. `deriveTowerRules` requires contiguous floors, valid template references and exactly one terminal template on the highest floor. Missing, ambiguous or unsupported data fails generation rather than silently retaining a guessed count.

## Runtime use

`scripts/generate-tower-rules.mjs` generates the shared `extension/tower-rules.js` object (`hwaHelperTowerRules`) with `floorCount`, `finalFloor`, `finalTemplateId` and source hashes. The classic background loads it before the cache reducer and planner; Vue imports the same artifact through `src/utils/towerRules.ts` and the metadata entrypoint.

Dashboard progress and the Tower dialog use the generated denominator. A completed brief response without a floor uses the configured final floor, without inventing floor 26. Merely reaching a floor, or receiving a floor higher than the configured maximum, does not prove completion. Server completion/state remains authoritative; the fallback is an accepted win in a boss room on the configured final floor. The planner no longer treats a generic victory at floor >=20 as completion.

## Refresh when the game changes

1. Capture a complete current `indexGet`, obtain its static version and splitlib entry, and update the version-specific asset catalog using the existing asset workflow. See `findIndex`, `assetUrl`, and `verifyAsset` in `scripts/sync-cdn-assets.mjs`. Do not substitute a guessed or unrelated remote-config version.
2. Download the exact archive URL to a temporary file. Generate with `node scripts/generate-tower-rules.mjs <archive.zip> <version-catalog.json>` (or `npm run tower:rules` for the current default archive/catalog). Size and MD5 must match the selected catalog before ZIP parsing.
3. Review the generated floor count, final template and source/hash changes. Refresh both public fixture `.pb` files from that same verified archive; do not mix table versions. If field meanings or layout differ, update the decoder deliberately after inspecting the new data.
4. Run `npm test`, `npm run typecheck`, and the versioned production build. The fixture hashes and terminal linkage must agree with the generated rules. Validate against observed `magicTower_getAll`, next-floor and final-boss responses when available.

No runtime CDN polling or extra RPC is needed for the current total. Regenerate the shared artifact when its source changes; never scatter new numeric floor assumptions across UI or automation.

## Validation

`tests/tower-rules.test.mjs` checks the original versioned tables and hashes, a synthetic future 27-floor layout, malformed/truncated indexes, missing/ambiguous terminal templates, Dashboard progress, planner boss evidence and completed RPC snapshots. Existing Tower session, automation, daily-reset and full-suite regression tests remain in place.

Implemented in @task-VHE-4HPVTP. Related: @doc/architecture/tower-rpc-session-and-progress-model and @doc/architecture/dashboard-live-status-model.
