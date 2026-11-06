---
id: doc-3bb1526b9a3b682954b90038c19b8c0a
title: Versioned CDN Asset Synchronization
description: Verified manifest/splitlib-based asset inventory, conversion, provenance and 1.293 audit results
createdAt: '2026-11-06T09:38:35.328Z'
updatedAt: '2026-11-06T09:38:35.328Z'
tags:
  - assets
  - cdn
  - workflow
---

# Versioned CDN Asset Synchronization

## Verified 1.293 source

@task-VHE-JTJQJK uses the user's startup export `temp/tracking-data/hwa-game-record-202611061625_gamestart.json`. `getGameInfo:WebGL` reports client 1.293.101; `indexGet.staticVersionUrl` is `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.293.0/`. No new game RPC was sent for this audit.

The compressed current index has 612695 bytes and MD5 `c40122f2b0fb79fc5e133f9b9f9d5ee3`, verified against its URL hash. It lists 17360 assets, including 7746 under `extends/icons/`. The splitlib archive has 5572457 bytes and MD5 `46e298e9f4305c4264057cbeb7fbf6bd`; the archive and each indexed member are validated before reading metadata.

The audit inventories all manifest entries and maps all current catalog IDs corresponding to the extension's stored categories. It downloads default hero/titan portraits and consumable/gear/scroll icons; animations, alternate skins, audio, scene bundles and unrelated GUI images are outside those storage categories.

## Commands

First run for a new version:

```powershell
npm run assets:sync -- --version 1.293.0 --index temp/tracking-data/hwa-game-record-202611061625_gamestart.json
npm run names:update -- temp/tracking-data/hwa-game-record-202611061625_gamestart.json
npm run tower:buffs
npm run heroes:metadata
npm run titans:metadata
npm run check
```

Repeat `npm run assets:sync -- --version 1.293.0` using the checked-in verified catalog/manifest subset. Optional `--only heroes|titans|items|items/gear|items/consumable|items/scroll` limits the scan and writes a separate scoped report. The compatibility command `npm run items:assets -- --refresh` delegates to the shared sync. A previously unknown version requires its own complete `indexGet`; do not substitute a stale catalog or guess texture paths.

## Asset resolution and conversion

`scripts/sync-cdn-assets.mjs` accepts raw RPC arrays, `records` wrappers or game `timeline` exports. It pins the requested version, checks compressed manifest MD5, splitlib size/MD5 and each ZIP member's size/MD5/CRC, then resolves exact per-file paths and hashes from the manifest. No fixed `v0001` assumption is used when the index points to another asset revision.

Item ID is **not** the texture ID: gear item 1 maps to `gear_6_new.img`, not `gear_1.img`. Hero icons can also be variants: Astaroth uses `hero_0004_2.img`, Celeste `hero_0043_1.img`. Use `icon.imagePath`/`assetTexture`; reject ambiguous basename matches and never derive an item filename from its ID.

Every texture is checked against manifest size/MD5 before `convertImgBuffer` decodes its ETC data to PNG, with the existing vertical flip. Output updates are atomic and skipped when bytes match. Failed downloads/decodes preserve existing images. Network work has concurrency 4, request timeouts and bounded retries for read-only CDN requests.

Successful hero images use `assets/heroes/ID.png`; metadata points to that PNG and superseded WebP mirrors are removed only after successful verification/conversion. Hero metadata generation now stays local; it does not query Fandom. The extension reads bundled images and generated locale data at runtime; global RPC settings and shelved Wheel behavior are unchanged.

## Coverage and remaining upstream omissions

| Category | Catalog IDs | Verified local icons |
| --- | ---: | ---: |
| Heroes | 83 | 83 |
| Titans | 29 | 29 |
| Consumables | 477 | 475 |
| Gear | 239 | 239 |
| Scrolls | 133 | 133 |
| Total | 961 | 959 |

Wodryn (78) has a standalone 1.293 icon and its metadata now enables the portrait. Consumables 103 (`Robbers4_box`) and 104 (`BFbox`) remain catalog entries without a matching standalone texture in the live manifest, including unique-basename lookup across `extends/`. No substitute or generated image is inserted. Their absence is reported explicitly; normal UI fallbacks remain available.

`docs/assets-1.293.0-catalog.json` contains public icon mappings, verified splitlib/manifest provenance and the relevant manifest entries, retaining ambiguous candidates so repeated resolution cannot silently change meaning. `docs/assets-1.293.0-audit.json` records every catalog ID, source URL/size/MD5/SHA256, PNG hash/dimensions/format and failures. A repeated pass confirmed 959 unchanged PNGs and the same two missing entries.

## Validation

`tests/cdn-assets.test.mjs` verifies export formats, version filtering, exact texture-ID mapping, manifest revision selection, ambiguous/path rejection, download retry/404 behavior, checksum-before-decode, preservation on failure, ZIP CRC and every available bundled image's SHA256 against the audit. Hero/Titan tests validate all referenced images; UI tests cover PNG portraits, Wodryn and missing-avatar fallbacks. Representative hero, gear and consumable images were visually checked for correct orientation.
