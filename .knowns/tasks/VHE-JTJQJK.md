---
id: VHE-JTJQJK
title: Audit and refresh assets for live game 1.293
status: done
priority: high
labels: []
createdAt: '2026-11-06T09:18:11.697Z'
updatedAt: '2026-11-06T09:43:27.531Z'
completedAt: '2026-11-06T09:43:27.479Z'
timeSpent: 1497
---
# Audit and refresh assets for live game 1.293

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Discover the live WebGL 1.293 asset structure and manifests, inventory all corresponding repository assets, download/convert stale or missing assets, record provenance and audit coverage, validate and rebuild.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Verify live 1.293 asset roots/manifests and inventory all corresponding bundled categories with explicit coverage.
- [x] #2 Download and validate upstream assets, convert textures, update stale/missing local files and any required metadata references.
- [x] #3 Provide reproducible version-aware audit/update tooling and provenance, including failures and unavailable upstream paths.
- [x] #4 Run relevant tests, full checks and build, update docs and commit reviewed changes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Discover CDN layout from captured indexGet and existing generators; verify live 1.293 public manifests/config sources. 2. Inventory bundled heroes/titans/items and config-derived missing counterparts; build a version-aware bounded-concurrency download/convert audit with hashes and atomic writes. 3. Execute the audit, inspect changed imagery and update metadata references to converted files. 4. Document source versions, category coverage and unresolved assets. 5. Test downloader/conversion/integrity behavior and existing UI references; full tests/build, review, validate and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified public 1.293.0/v0001/extends/icons/hero/hero_0016.img and hero/titan_160_4000.img; _new variant absent. Root directory listings forbidden; old 1.292 assets unavailable. Existing temp/splitlib is absent, so old hero/item generators cannot fully run. Awaiting optional fresh indexGet log/path from user for current splitlib catalog; proceeding with all bundled category inventory and reproducible sync tooling. Current bundle: 83 hero files, 29 titan files, 45 consumables, 47 gear, 9 scrolls. Known metadata still marks supplied hero 78 absent; update references during audit.

Live startup timeline confirms game 1.293.101 / CDN 1.293.0. Verified compressed full index MD5 c40122f2b0fb79fc5e133f9b9f9d5ee3 (17360 entries, 7746 icons) and splitlib MD5 46e298e9f4305c4264057cbeb7fbf6bd plus all archive members. Catalog has 961 IDs; final manifest-based sync verified 959 PNGs, repeat run 959 unchanged. Missing consumable 103 Robbers4_box and 104 BFbox have no standalone entry in the current manifest. Exact metadata filename mapping replaces guesses (gear 1 uses gear_6_new, hero 4/43 use variants). All 83 heroes now PNG, including Wodryn; superseded WebP mirrors removed after verification. Updated locale/names/Tower buffs and local hero/titan metadata. Added sync checksum/mapping/ZIP/retry/coverage tests; adjusted prior UI assertions tied to old avatars. Canonical workflow doc added.

Review and verification: npm run check passed 276 tests, 10 optional private-log skips, 0 failures; build 0.9.75. Source/dist contain exactly 959 matching image files. Repeated sync from committed catalog produced 959 unchanged / 2 missing; audited PNG SHA256 and source manifest MD5 for each available image. Added full manifest group inventory (17360 entries across 44 groups). Locale size/MD5 is retained in generated names and verified again by Tower generator. No private startup export is staged. Remaining upstream omissions: consumable 103/104 only, explicitly recorded in report/docs. System Decision Impact: candidate @decision/20261106-1640-resolve-versioned-icons-through-verified-cdn-manifests (added) — version-aware, metadata/manifest-driven resolution and hash verification; draft only. No linked spec/locked D-IDs apply.

Final quality/architecture/security/completeness review complete with no unresolved P1/P2 findings. Full npm run check: 276 passed, 10 optional fixture skips, 0 failures; generated version 0.9.75. Canonical workflow validation has 0 errors/warnings. Offline repeated-sync catalog and exact source/dist byte equality verified. Final bundle adds 746 previously missing catalog icons, replaces 74 legacy hero WebPs with verified PNGs and updates 4 pre-existing gear PNGs. Two upstream standalone icon omissions remain explicitly documented, with no guessed substitutes.
<!-- SECTION:NOTES:END -->

