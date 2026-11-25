---
id: VHE-WRWG60
title: "[P2-15] Hero Detail Dialog: Glyphs (rune_getAll + rune_upgradeHeroRune), XP Potion Level Up (inventory_use), Spark of Power (heroTitanGiftLevelUp)"
status: done
priority: medium
labels:
  - backlog
  - p2
  - hero-dialog
createdAt: '2026-11-25T17:58:39.341Z'
updatedAt: '2026-11-25T18:03:11.912Z'
completedAt: '2026-11-25T18:03:11.912Z'
timeSpent: 0
---
# [P2-15] Hero Detail Dialog: Glyphs (rune_getAll + rune_upgradeHeroRune), XP Potion Level Up (inventory_use), Spark of Power (heroTitanGiftLevelUp)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 extractHeroGlyphsAndTalisman reads real 5-tier levels from rune_getAll.heroesRunes and rune_upgradeHeroRune enforces alternatePrice:false
- [x] #2 HERO_XP_POTIONS uses verified libIds 9..12 and HeroDetailModal wires #btn-hero-level-1 and #btn-hero-level-max via inventory_use
- [x] #3 HeroDetailModal displays Spark of Power titanGiftLevel/30 and dispatches heroTitanGiftLevelUp via #btn-hero-spark-up
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
v0.11.322: Verified Glyphs (rune_getAll + rune_upgradeHeroRune with zero-Emerald guard), EXP Potion level-up (libIds 9..12 via inventory_use), and Spark of Power (heroTitanGiftLevelUp); 1310/1310 tests pass, dual-build verified.
<!-- SECTION:NOTES:END -->

