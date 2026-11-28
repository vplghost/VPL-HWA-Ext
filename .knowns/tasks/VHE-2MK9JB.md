---
id: VHE-2MK9JB
title: 'P2-45: Hero Detail Dialog — Real Glyph Stat Labels & Accurate Rune Stone/Sphere Cost Gating'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T05:46:25.581Z'
updatedAt: '2026-11-28T05:49:02.509Z'
completedAt: '2026-11-28T05:49:02.509Z'
timeSpent: 0
---
# P2-45: Hero Detail Dialog — Real Glyph Stat Labels & Accurate Rune Stone/Sphere Cost Gating

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generate src/data/glyphData.ts from splitlib hero_runes.pb, rune_type.pb, rune_level_cost.pb; add computeGlyphUpgradeCost & computeMaxAffordableGlyphSteps in heroUpgradeService.ts; display real stat names/icons/values and gate +1/+5 buttons by exact Rune Stone/Sphere affordability in HeroDetailModal.vue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/data/glyphData.ts contains all 117 heroes, 15 rune types (Lv.0..80), and 80 level costs
- [x] #2 extractHeroGlyphsAndTalisman populates statLabel/statIcon/currentValue/nextValue/cost1/cost5/canUpgrade1/canUpgrade5 accurately
- [x] #3 HeroDetailModal displays real glyph stat labels & disables +1/+5 when Rune Stones/Spheres are insufficient; npm test and npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-45 (v0.11.394): generated src/data/glyphData.ts from splitlib protobufs (117 heroes, 15 stat types, 80 level costs), added computeGlyphUpgradeCost & computeMaxAffordableGlyphSteps in heroUpgradeService.ts, and updated HeroDetailModal.vue Glyphs grid with real stat labels/icons/values and exact Rune Stone affordability gating on +1/+5 buttons. Verified 1,382 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

