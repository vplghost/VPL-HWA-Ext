---
id: VHE-TJ12Q2
title: 'P2-44: Shop Favorites, 1-Click Buy All Favorites & Smart Free-Renew'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T05:22:26.587Z'
updatedAt: '2026-11-28T05:29:30.223Z'
completedAt: '2026-11-28T05:29:30.223Z'
timeSpent: 0
---
# P2-44: Shop Favorites, 1-Click Buy All Favorites & Smart Free-Renew

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add persistent cross-shop favorites (useShopFavorites.ts), projected-balance planFavoriteShopPurchases, findFreeRenewableFavoriteShops, and #btn-shop-buy-favorites / #btn-shop-renew-favorites in ShopModal footer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 planFavoriteShopPurchases respects bought=0, blocks starmoney, enforces currencyReserves and projected balance deductions
- [x] #2 findFreeRenewableFavoriteShops selects only shops with bought favorites where nowSec >= refreshTime
- [x] #3 ShopModal supports star favorite toggle, #shop-filter-favorites, #btn-shop-buy-favorites, #btn-shop-renew-favorites; npm test and npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-44 (v0.11.393): useShopFavorites.ts persistent favorites & currency reserves, planFavoriteShopPurchases & findFreeRenewableFavoriteShops in shopService.ts, star toggle + #shop-filter-favorites + #btn-shop-buy-favorites (with auto free-renew) + #btn-shop-renew-favorites in ShopModal.vue. Verified 1,378 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

