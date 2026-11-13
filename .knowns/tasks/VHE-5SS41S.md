---
id: VHE-5SS41S
title: Audit supplied resource inventory exports and add verified missing metadata/icons
status: in-review
priority: medium
labels: []
createdAt: '2026-11-13T17:30:50.975Z'
updatedAt: '2026-11-13T17:57:11.090Z'
timeSpent: 1558
---
# Audit supplied resource inventory exports and add verified missing metadata/icons

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compare the user's150resource and418inventory exports from client1.293.1010 with current labels/icons. Resolve missing names using current locale/library/config evidence, extract verifiable item/resource images from pinned server manifest/library, wire bundled assets into existing UI and document unsupported/ambiguous entries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both supplied exports are audited for missing names and images with checkable per-category coverage and explicit unresolved cases.
- [x] #2 Resolvable metadata/images come from verified current server sources; bundled image lookup works in Items/Resources without guessed mappings or runtime downloads.
- [ ] #3 Regression checks, documentation, typecheck and versioned production build pass and changes are committed.
- [x] #4 Obsolete resources are excluded from resource presentation using verified expiry/current-config evidence, without discarding active currencies, exhausted daily quotas or underlying authoritative cache data.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit exported category/ID coverage and obtain exact current1.293.1010manifest/splitlib with checksums. 2. Derive missing labels and icon mappings from verified metadata, extract supported textures while preserving safe fallbacks and avoiding guessed IDs. 3. Add shared runtime lookup/UI integration, public provenance audit and targeted tests; validate/typecheck/version/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope added by user: remove resources no longer used by the game to avoid excess information. Implement evidence-based presentation filtering for verified retired/expired resources; retain active daily quota rows even at0and preserve raw cache/state. Latest manifest URL returns MD5559e... instead of captured dffc..., so reject it as unpinned and use the cached manifest verified against known catalog MD5c40122... for supported standalone textures; document limitations.

Audited150resource and418inventory rows. Verified currentv0054splitlib5582751bytes MD51357804... and currentlocale. Latest manifest response559e... mismatched recorded dffc...; used cached manifest612695bytes MD5c40122... confirmed against existing catalog, preserving explicit limitation. Added65server-verified PNGs;413already-bundled mappings,36unresolved icon mappings,54inactive skipped. Recovered names for all16previously unnamed inventory rows (frames generic official AvatarFrame,12relic shards,2skin fragments) using current library+locale references. Resources/export/header selection exclude27expired rows and27technical counters while retaining active zero quotas and raw cache. Repeated extraction uses cached images and reproduces metadata/audit bytes. Representative chest/relic/skin icons visually checked.690tests:678pass,0fail,12optional skips; typecheck passed.

Production build0.10.68 passed. Review checks: resource cleanup is presentation-only, does not drop raw balances; world-refillable IDs cannot collide with main refillables; icon paths are local-only, ambiguous matches stay unresolved, and cached per-image provenance survives reruns. Added validation before observed category directory traversal and own-property supplement lookup. System Decision Impact: none — this extends the established build-time verified metadata/image pipeline and task-scoped resource presentation; no accepted runtime/CDN/RPC policy changes.

Final review PASS:P1=0,P2=0,P3=0 after observed identity/path validation and own-property supplement lookup. Final690tests:678pass,0fail,12optional skips. Typecheck and rebuilt0.10.68production artifacts passed. Audit documents older verified manifest limitation, existing-vs-extracted image provenance and unresolved active labels/images. Generator rerun accepted both supplied inputs and retains65extraction records with cached images.
<!-- SECTION:NOTES:END -->

