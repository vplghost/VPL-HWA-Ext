---
id: VHE-473JB8
title: Display enemy Titans for each current-floor Dungeon door
status: done
priority: medium
labels: []
createdAt: '2026-11-13T17:02:55.576Z'
updatedAt: '2026-11-13T17:06:39.767Z'
completedAt: '2026-11-13T17:06:39.767Z'
timeSpent: 177
---
# Display enemy Titans for each current-floor Dungeon door

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dungeon floor userData stores enemy Titans in door.team, while the Vue dialog only renders door.enemies. Show the actual enemy roster per current-floor door with names and supplied level/star data, metadata element/avatar and unknown fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every current-floor door displays its enemy Titans from captured team field with supplied level/stars and safe names/metadata fallbacks.
- [x] #2 Missing data and floor changes do not leak other doors, previous floor or player Titan roster; array/object collection shapes render safely.
- [x] #3 Regression checks, typecheck and versioned build pass; changes are committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify captured door.team schema and existing Titan metadata. 2. Normalize door rosters for dialog and render each door's enemies with compact Titan details and missing-data fallback. 3. Test actual Vue computations/rendering and floor changes, validate/typecheck/build, update release and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified recorded dungeonGetInfo floor.userData door schema: team entries contain Titan id/level/star, retained unchanged in currentFloorDoors. Dialog now derives per-door enemy display from team (legacy enemies fallback), resolves metadata/avatars, handles array/object collections and unknown IDs/missing data. Actual SFC computed and door template SSR tests cover each door's details, floor changes and no player/previous-floor leakage. Full suite673:661pass,0fail,12optional skips.

Review PASS:P1=0,P2=0,P3=0. Actual door template and SFC state tests pass; production build0.10.64 and typecheck passed. System Decision Impact: none — this renders already-observed enemy team fields using existing Titan metadata, without changing battle automation, RPC policy or cache ownership.

Completed and committed Dungeon enemy roster UI, actual template regressions, changelog and validated0.10.64 build. Final task state folded into the same commit; staged empty TypeScript LSP log remains excluded. Continue with user's separate item/resource metadata refresh request.
<!-- SECTION:NOTES:END -->

