---
id: qseqpo
title: Solo monster search does not identify the target power variant
layer: project
category: pattern
status: proposed
tags:
  - monster
createdAt: '2026-11-14T23:35:06.467Z'
updatedAt: '2026-11-14T23:35:06.467Z'
---

Captured solo searchMob replies contain mobId and coordinates but no preset/config identity. MonsterModal therefore compares both verified normal/PvP level presets from MONSTER_POWER and never substitutes rally boss power or guesses numeric mappings. Selected own hero power plus the actual allocated troop counts times UNIT_POWER drives advisory warnings; incomplete totals retain +. Preset hero power differs from buffed getSoloAttackDefenders hero sums. Evidence: @doc/api/world-map-rpc-contracts, @task-VHE-ZP1CW2, tests/monster-power.test.mjs. Exact target identity awaits capture under @task-VHE-E0751C.
