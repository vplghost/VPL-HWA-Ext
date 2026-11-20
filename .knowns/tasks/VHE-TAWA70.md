---
id: VHE-TAWA70
title: 'Titan dialog: build full Titan detail modal with level up, artifacts, evolution, and skins'
status: done
priority: high
labels:
  - titan,dialog,power-up
createdAt: '2026-11-20T10:17:52.192Z'
updatedAt: '2026-11-20T11:30:38.932Z'
completedAt: '2026-11-20T11:30:38.932Z'
timeSpent: 0
assignee: '@me'
---
# Titan dialog: build full Titan detail modal with level up, artifacts, evolution, and skins

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create TitanDetailModal component displaying full titan identity, element, role, stats, and soul progress
- [x] #2 Implement Titan level up via inventory_use with Titan Potions (+1, +10, Max)
- [x] #3 Implement Titan star evolution via titanEvolve with fragment and gold validation
- [x] #4 Implement Titan artifact level up via artifact_LevelUpCost and evolve via artifact_evolve
- [x] #5 Implement Titan skin upgrade via skin_upgrade
- [x] #6 Integrate TitanDetailModal into TitansTab on titan card/row click
- [x] #7 Pass all unit tests and verify build
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create titan level and evolve data helpers (xp table, evolve costs, skin stones). 2. Add rpcCache reduction for artifact_LevelUpCost, artifact_evolve, and titan skin_upgrade. 3. Build TitanDetailModal component with header, hero-like layout, level up controls, star evolution, artifact upgrades, and skins. 4. Connect TitansTab grid and table clicks to open TitanDetailModal. 5. Write comprehensive unit tests for all titan upgrade RPCs and modal interactions. 6. Build and verify extension package.
<!-- SECTION:PLAN:END -->

