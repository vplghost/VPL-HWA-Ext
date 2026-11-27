---
id: VHE-ZJ9P37
title: Configurable battle simulation rounds with default 5 and Settings UI (p2-33)
status: done
priority: medium
labels:
  - enhancement,wasm,settings,p2-33
createdAt: '2026-11-27T03:17:05.295Z'
updatedAt: '2026-11-27T03:20:53.089Z'
completedAt: '2026-11-27T03:20:53.089Z'
timeSpent: 0
---
# Configurable battle simulation rounds with default 5 and Settings UI (p2-33)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Default simulation rounds lowered to 5 across Dungeon (SINGLE_DOOR_SIM_ROUNDS), Arena (runArenaMonteCarloSim / ArenaModal), and PvP Optimizer (DEFAULT_PVP_MATCH_ROUNDS)
- [x] #2 executeDungeonAutomationStep & DungeonAutoSettings accept configurable simRounds (clamped 1..20) and display dynamic Best-of-N labels
- [x] #3 SettingsTab (#setting-sim-rounds) persists defaultSimRounds and DungeonModal (#dungeon-sim-rounds-input) & ArenaModal initialize from it
- [x] #4 All unit tests and full build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p2-33: lowered default sim rounds from 10 to 5 across Dungeon, Arena, and PvP Optimizer; added #setting-sim-rounds in SettingsTab and #dungeon-sim-rounds-input in DungeonModal. Verified 1340 pass / 0 fail.
<!-- SECTION:NOTES:END -->

