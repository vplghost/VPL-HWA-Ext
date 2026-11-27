---
id: VHE-WB8WJB
title: Fix Unity sim EXTRACT_BATTLE_RESULT crash on total-wipe empty attackers.heroes array (p1-18)
status: done
priority: high
labels:
  - bugfix,wasm,dungeon,p1-18
createdAt: '2026-11-27T03:02:35.996Z'
updatedAt: '2026-11-27T03:04:06.642Z'
completedAt: '2026-11-27T03:04:06.642Z'
timeSpent: 0
---
# Fix Unity sim EXTRACT_BATTLE_RESULT crash on total-wipe empty attackers.heroes array (p1-18)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 resolveSimulatedProgressHeroes normalizes empty/missing attackers.heroes to {} when win=false instead of throwing
- [x] #2 Preserves P1-14 hard throw with diagnostic snippet when win=true and attackers.heroes is missing/empty/malformed
- [x] #3 interceptor.ts uses the same total-wipe normalization in EXTRACT_BATTLE_RESULT and normalizes defenders.heroes arrays
- [x] #4 Unit tests and full build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p1-18: normalized empty/missing attackers.heroes ([]/null) to {} on defeat (win=false) in interceptor.ts & resolveSimulatedProgressHeroes(), preserving P1-14 hard guard on win=true with diagnostic snippets. Verified 1339 pass / 0 fail.
<!-- SECTION:NOTES:END -->

