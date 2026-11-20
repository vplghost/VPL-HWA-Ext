---
id: VHE-M1Y8P7
title: 'Dungeon dialog: fix semi-auto checkpoint failure and add outcome tuning settings'
status: done
priority: high
labels:
  - dungeon,semi-auto,settings
createdAt: '2026-11-20T11:43:34.645Z'
updatedAt: '2026-11-20T13:05:22.432Z'
completedAt: '2026-11-20T11:53:36.172Z'
timeSpent: 0
assignee: '@me'
---
# Dungeon dialog: fix semi-auto checkpoint failure and add outcome tuning settings

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Analyze temp/dungeon records and identify cause of failed semi-auto attacks
- [x] #2 Fix milestone checkpoint dungeonSaveProgress batching error
- [x] #3 Add hpBonusPercent and energyBonusPercent options to buildSimulatedEndBattleArgs
- [x] #4 Add simulation tuning settings UI on DungeonModal with persistent storage
- [x] #5 Add unit tests and verify build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Documented in @doc/architecture/dungeon-battle-simulation-and-healer-mechanics.
<!-- SECTION:NOTES:END -->

