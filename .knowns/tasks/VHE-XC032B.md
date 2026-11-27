---
id: VHE-XC032B
title: 'P2-39: Monster Attack Dialog — World Energy Attack Cap, Compact 1-Row UI & PvP Monster Power'
status: done
priority: medium
labels: []
createdAt: '2026-11-27T16:57:18.481Z'
updatedAt: '2026-11-27T16:59:56.100Z'
completedAt: '2026-11-27T16:59:56.100Z'
timeSpent: 0
---
# P2-39: Monster Attack Dialog — World Energy Attack Cap, Compact 1-Row UI & PvP Monster Power

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cap and default MonsterModal attack count to available World Energy (10 energy/attack), compact Level+Find/Target/Count into 1 row with concise option labels, and default monsterPowerComparison to PvP monster presets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 computeMaxMonsterAttacks caps attacks to Math.floor(worldEnergy / 10) and MonsterModal defaults/clamps mobCount accordingly
- [x] #2 MonsterModal #monster-params-row places Level+Find, Target, and Count on one row without redundant 'Monster' text in options
- [x] #3 monsterPowerComparison defaults to PvP monster preset (e.g. Lv.20: 147.2k heroes, 102.2k troops); npm test and npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-39 (v0.11.389): added computeMaxMonsterAttacks() bound to getWorldEnergy (10/attack) with default-to-max and clamping in MonsterModal.vue, compacted Level+Find/Target/Count into 1-row #monster-params-row with concise option labels, and defaulted monsterPowerComparison() to PvP monster presets across all 30 levels (Lv.20: 147.2k heroes / 102.2k troops). Verified 1,369 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

