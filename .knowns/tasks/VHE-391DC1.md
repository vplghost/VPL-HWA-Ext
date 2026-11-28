---
id: VHE-391DC1
title: 'P2-46: Shop Dialog — Real Coin/Item Names via getItemName & Dynamic Active Event Shop Naming'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T05:59:09.424Z'
updatedAt: '2026-11-28T06:00:49.392Z'
completedAt: '2026-11-28T06:00:49.392Z'
timeSpent: 0
---
# P2-46: Shop Dialog — Real Coin/Item Names via getItemName & Dynamic Active Event Shop Naming

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use getItemName() for real coin/gear/scroll/consumable names in shopService.ts, resolve active event shop names dynamically from questEvents or primary event coin (e.g. Eternal Marks Shop, Adventure Shop, Guild Clash Shop), and display primary currency balance on ShopModal selected shop banner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 parseShopCatalog resolves real coin & item names via getItemName (no Coin #1 or consumable #102)
- [x] #2 Dynamic event shops (1000263, 1000266, 1000268) resolve human-readable names & primary currency balance
- [x] #3 Unit tests updated, npm test (0 fail) and npm run build (dist/ + .output/chrome-mv3/) pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P2-46 (v0.11.396): switched shopService.ts to getItemName() for real coin/item names, added 3-tier dynamic event shop naming (SHOP_CATALOG -> active questEvents -> primary coin stem), displayed primary currency pill in ShopModal banner, verified 1384/1384 tests and dual build.
<!-- SECTION:NOTES:END -->

