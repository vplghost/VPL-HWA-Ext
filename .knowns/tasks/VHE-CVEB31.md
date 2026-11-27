---
id: VHE-CVEB31
title: 'Implement Favorite Heroes Soul-Stone Sweeper (Reserve Energy + Autopilot) & 1-Click Recursive Gear Craft-Equip (p3-10)'
status: done
priority: medium
labels:
  - feature,automation,campaign,hero,p3-10
createdAt: '2026-11-27T03:32:46.538Z'
updatedAt: '2026-11-27T03:38:47.261Z'
completedAt: '2026-11-27T03:38:47.261Z'
timeSpent: 0
---
# Implement Favorite Heroes Soul-Stone Sweeper (Reserve Energy + Autopilot) & 1-Click Recursive Gear Craft-Equip (p3-10)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 planFavoriteSoulStoneSweep skips 6-star & canEvolve heroes, filters 3-star Heroic missions with remaining tries, respects reserveEnergy, and computes exact energy cost
- [x] #2 planRecursiveGearCraftAndEquip computes bottom-up craft order with shared inventory accounting, total Gold cost, and never auto-promotes
- [x] #3 Daily Routine Autopilot integrates optional soul-sweep step that cleanly skips when ineligible or below reserveEnergy
- [x] #4 CampaignRaidModal adds #campaign-soul-sweep-panel, #campaign-soul-reserve-input, #campaign-soul-sweep-btn and HeroDetailModal adds #hero-equip-all-ready-btn (100% English)
- [x] #5 Unit tests and full build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p3-10: Favorite Heroes Soul-Stone Sweeper (reserveEnergy + Daily Autopilot soul-sweep step) and 1-Click Recursive Gear Craft-Equip (bottom-up craft + shared stock + no auto-promote). Verified 1343 pass / 0 fail.
<!-- SECTION:NOTES:END -->

