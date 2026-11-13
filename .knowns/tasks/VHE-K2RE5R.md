---
id: VHE-K2RE5R
title: Refresh item and resource names for client1.293.1010
status: done
priority: medium
labels: []
createdAt: '2026-11-13T17:07:22.979Z'
updatedAt: '2026-11-13T17:16:05.472Z'
completedAt: '2026-11-13T17:16:05.472Z'
timeSpent: 500
---
# Refresh item and resource names for client1.293.1010

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract verified English names and item/resource definitions for current game client1.293.1010, resolving generic labels such as lootboxChanced#27. Use matching captured indexGet and official pinned locale/config; package metadata for existing UI without runtime downloads.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Current1.293.1010configuration/locale provenance is verified and lootboxChanced#27 plus other resolvable unnamed resources obtain correct names.
- [x] #2 Generated metadata is consumed by existing resource/item views with safe unknown-ID fallbacks and no new runtime CDN/RPC access.
- [x] #3 Regression checks, docs and versioned production build pass; changes are committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Locate current client1.293.1010/indexGet evidence and audit unnamed inventory resource categories. 2. Extend verified generation and name resolution for current categories, preserving verified English labels and unknown-ID fallbacks. 3. Test actual resource labels, document provenance, version/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified client1.293.1010 capture/indexGet and v0054 English locale683124bytes MD5def7ae37ac67df119f41eae76690c092. Replaced bundled v0034, added exact strategic resource key extraction and talisman prefix.236new names; targetlootboxChanced27=Tomes Casket confirmed by locale and hash-verified config.9strategic configs:70/74IDs named; four untranslated/internal IDs retain fallbacks. Shared item lookup now handles generated groups; Items/Resources resolver and resource visibility tests pass. Cached generation reproduces bytes, no stale default capture. Full suite677:665pass,0fail,12optional skips; typecheck passed.

Final verification:678tests,666pass,0fail,12optional skips; typecheck and production build0.10.65 passed. Added public minimal index fixture and negative generation tests: missing explicit capture or wrong cached bytes cannot overwrite bundled names. Review PASS:P1=0,P2=0,P3=0. System Decision Impact: none — this follows accepted packaged/CDN-verified metadata decision20261101-1724 without changing runtime fetch/RPC policy. Locale refresh adds names only; asset image audit is unchanged. Four IDs with no verified English locale title retain fallbacks, including Guild teleporter6 whose resourceView contains no locale reference.

Completed and committed verified1.293.1010name extraction,236additionalnames, shared lookup, regression/negative-generation tests, public fixture, provenance documentation and0.10.65build/changelog. Final task state folded into the same commit; unrelated staged empty TypeScript LSP log remains excluded.
<!-- SECTION:NOTES:END -->

