---
id: VHE-0QJGVQ
title: 'Fix Titan Dungeon Invalid battle via real server-seed reroll & strict expectedSeed enforcement (p1-19)'
status: done
priority: high
labels:
  - bugfix,dungeon,wasm,p1-19
createdAt: '2026-11-27T03:38:58.617Z'
updatedAt: '2026-11-27T03:41:54.376Z'
completedAt: '2026-11-27T03:41:54.376Z'
timeSpent: 0
---
# Fix Titan Dungeon Invalid battle via real server-seed reroll & strict expectedSeed enforcement (p1-19)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 executeDungeonAutomationStep always enforces expectedSeed = chosen.startSeed in validateDungeonEndBattleArgs (no bypass for Best-of-N)
- [x] #2 Single-door/depleted Best-of-N rerolls via real dungeonStartBattle calls (never submitting fabricated client-derived seeds) with early exit on first safe flawless win
- [x] #3 Unit tests updated and new tests cover early exit, real server-seed reroll, and strict seed enforcement; npm test & npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p1-19: replaced fabricated client-derived seed rerolls with real dungeonStartBattle server-seed rerolls (with early exit on first safe flawless win) and restored strict expectedSeed enforcement in validateDungeonEndBattleArgs. Verified 1344 pass / 0 fail.
<!-- SECTION:NOTES:END -->

