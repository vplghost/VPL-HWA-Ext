---
id: doc-e92ce692df3a8bc20b9dab7f52d32124
title: Observed Resource Inventory Metadata and Retirement
description: Coverage audit for the supplied resource/inventory exports, verified icon extraction, missing label resolution and evidence-based inactive resource filtering.
createdAt: '2026-11-13T17:52:45.302Z'
updatedAt: '2026-11-13T17:55:35.645Z'
tags:
  - resources
  - inventory
  - assets
  - cdn
  - retirement
---

# Observed resource/inventory metadata and retirement

## Inputs and scope — 2026-11-14

@task-VHE-5SS41S audits the user's `temp/tracking-data/hwa-resources.json` (150 rows) and `temp/tracking-data/hwa-inventory.json` (418 rows) for client 1.293.1010. These are exported display rows, not complete library catalogs. Raw files and quantities remain private in temp. The public `docs/observed-item-assets-1.293.1010-audit.json` records input SHA-256, category/ID coverage, label source, image outcome and per-image provenance without stock quantities or account identifiers.

## Verified sources and manifest limitation

The matching complete indexGet is in `hwa-game-record-202611100940_dungeon.json`. It selects static version 1.293.0, English locale v0054 (683124 bytes, MD5 `def7ae37ac67df119f41eae76690c092`) and splitlib v0054 (5582751 bytes, MD5 `1357804ab5ab599e3522f8cbdeb75802`). The splitlib archive, each consumed table and ZIP CRCs are checked before deriving metadata.

The captured currentVersionIndex expects manifest MD5 `dffc6e1e901230a6e303f6dcf03c8254`. Fetching that mutable index.latest URL now returns 615268 bytes with MD5 `559e939efba9a2e6a92022ee0bb095ae`. It is rejected as a match for that captured metadata. Extraction instead uses the cached 1.293.0 manifest (612695 bytes, MD5 `c40122f2b0fb79fc5e133f9b9f9d5ee3`), verified against the existing checked-in asset catalog. This is explicitly a verified older manifest snapshot, not a claim that the current latest manifest was validated.

Only paths present unambiguously in that verified snapshot are eligible. Every downloaded texture must still match its manifest size/MD5 before ETC-to-PNG conversion. Unsupported/newer mappings stay unresolved. See @doc/workflows/versioned-cdn-asset-synchronization for the existing source/integrity workflow.

## Missing inventory labels

All 16 previously unnamed inventory entries have a supported label:

- Twelve patron entries use `inventoryItem_patron.ident`: universal maps to `PATRON_UNIVERSAL_ITEM_NAME`; `hero_N` maps through the verified hero name and `LIB_PATRON_NAME` (`%param1% Relic Shard`). For example patron 2 is Somna Relic Shard. Never equate the patron ID to the hero ID.
- fragmentSkin 327 is Cascade Mythical Skin fragment; fragmentSkin 1004 is Sebastian Dark Depths Skin fragment. Indexed skin.pb rows link field 2 to hero ID, field 5 to the title locale key and field 7 to texture. The parser reads only the header-declared row region; skin.pb has additional non-row indexes after it.
- border 1 and border 127493 use the official generic `LIB_BORDER_NAME` (Avatar Frame). No individual localized frame title is invented; their original IDs and distinct portraits identify them.

The supplemental `extension/item-resources.js` adds these names through shared NameMap lookup without overwriting existing verified base names. Active refillables use exact `LIB_PSEUDO_*` title keys when available. Provided export labels are recorded separately in the audit and are not promoted into verified library names. Remaining unsupported title IDs retain existing type/ID fallbacks.

## Images and coverage

| Outcome | Observed identities |
| --- | ---: |
| Newly extracted server images | 65 |
| Already bundled image references | 413 |
| Inactive rows skipped for extraction | 54 |
| No sufficiently verified image mapping | 36 |

The 65 new images include two frames, two skin portraits, twelve relic shard icons and 49 resource icons (lootboxes, materials, speedups, teleporters and selected currencies/refillables). Existing bundled references retain that status; this audit does not retroactively claim server verification for older images outside its extraction scope.

Metadata icon/imagePath/resourceIcon/texture values take priority. Strategic icons are selected from explicit manifest paths encoding the resource type and ID within the strategic namespace. Basic material names may use an exact named material path (Wood/Food/Stone/Iron/Elarite/Blueprints); unrelated numeric IDs are never substituted. Ambiguous matches are rejected. The report records whether a mapping came from metadata, a typed manifest entry or an exact resource name.

`getItemIcon` and `getResourceIcon` expose only indexed local PNG paths. Items supports fragment aliases; Resources shows extracted icons where available. Image loading failures return to the existing category symbol. No runtime CDN downloads or new game RPC are introduced. Chest 27, universal relic shard and skin 327 images were visually inspected for orientation/content.

## Removing obsolete and non-resource counters

For the supplied 150 resource rows, 27 have a verified expiresAt in the past, including positive cached balances from old events. Another 27 are technical reset/cooldown counters identified by library purpose (`shopReset_*`, `_cooldown`/`Cooldown`). They are excluded from Resources and its filtered export; header selection also excludes them. The 96 remaining rows are not automatically deemed obsolete just because stock is zero or a title/image is missing.

`isInactiveResource` respects the resource category: world-refillable 6 is not main refillable 6. Active daily battle quotas such as Arena 6/Grand Arena 21 remain visible at zero. Current event refillable 512 remains until its configured expiry (`2026-11-23T02:00:00Z`). Unknown future IDs stay visible until reliable retirement metadata exists. Raw cache and saved header pin preferences are retained; only presentation/selectability changes.

## Regeneration

Prepare the verified local inputs referenced by the script, then run:

```powershell
npm run items:observed -- temp/tracking-data/hwa-resources.json temp/tracking-data/hwa-inventory.json temp/tracking-data/hwa-game-record-202611100940_dungeon.json
```

The script verifies the cached locale, splitlib and manifest, then writes images, `extension/item-resources.js` and the public audit report. It reuses existing images and retains extraction hashes/provenance when their bytes still match. Canonical serialization makes repeated generation with unchanged sources and visibility date reproduce the same metadata/audit bytes. A new library/manifest version requires deliberately refreshed evidence; this version-specific command does not guess a new client version.

`tests/observed-item-assets.test.mjs` covers name/texture mappings, ambiguity rejection, expiry/purpose/category boundaries, actual Items image fallback, PNG signatures/dimensions and SHA-256 for all 65 extracted images. `tests/resources-view.test.mjs` covers actual Resources rendering, inactive filtering/export, retained raw data, active zero quotas and failed-image fallback.
