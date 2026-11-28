---
id: VHE-4K5Q5H
title: 'P2-43: Unified In-Game Shop Hub, Dashboard Icon Button & 0-Emerald Safety Layer'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T05:22:26.112Z'
updatedAt: '2026-11-28T05:29:29.698Z'
completedAt: '2026-11-28T05:29:29.698Z'
timeSpent: 0
---
# P2-43: Unified In-Game Shop Hub, Dashboard Icon Button & 0-Emerald Safety Layer

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement shopService.ts, rpcCache shopBuy/shopRefresh sync, 0-Emerald safety guards, ShopModal.vue displaying all shops on one UI, Dashboard #open-shop-dialog icon button, and Command Palette entry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 parseShopCatalog, isEmeraldShopSlot, canFreeRefreshShop enforce strict 0-Emerald and scheduled free-refresh rules
- [x] #2 rpcCache updates shopGetMany on shopBuy/shopRefresh; DashboardTab mounts #open-shop-dialog icon button; ShopModal renders all shops with filters
- [x] #3 Unit tests pass (npm test) and dual build (npm run build) succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-43 (v0.11.393): shopService.ts with 0-Emerald & scheduled free-refresh guards, rpcCache shopBuy/shopRefresh merge, ShopModal.vue unified all-shops hub, DashboardTab #open-shop-dialog icon button, and Command Palette entry. Verified 1,378 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

