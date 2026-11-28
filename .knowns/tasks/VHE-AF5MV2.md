---
id: VHE-AF5MV2
title: 'P3-11: Auto Shop Routine & Grand Arena Coin Auto-Claim (grandFarmCoins)'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T08:35:58.799Z'
updatedAt: '2026-11-28T08:42:52.377Z'
completedAt: '2026-11-28T08:42:52.377Z'
timeSpent: 0
---
# P3-11: Auto Shop Routine & Grand Arena Coin Auto-Claim (grandFarmCoins)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement verified grandFarmCoins RPC cache merge, shouldClaimGrandArenaCoins on-demand & anti-cap helper, zero-polling hwa-auto-shop-favorites background alarm, ShopModal Collect GA Coins button + auto-claim before Buy All Favorites, SettingsTab #setting-auto-shop-favorites, and Daily Autopilot shopFavorites step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rpcCache merges grandFarmCoins reward.coin[2] into inventoryGet and stores grandCoin/grandCoinTime; shouldClaimGrandArenaCoins handles on-demand, anti-cap, and 15m cooldown
- [x] #2 Zero-polling hwa-auto-shop-favorites alarm runs shopGetMany -> grandFarmCoins -> free-only shopRefresh -> strict 0-Emerald shopBuy and schedules earliest wake
- [x] #3 SettingsTab #setting-auto-shop-favorites, ShopModal #shop-collect-ga-coins-btn, Daily Autopilot shopFavorites step, and CONFIG_KEYS backup wiring (100% English Vue UI)
- [x] #4 Unit tests (tests/shop-service.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P3-11 (v0.11.398): verified grandFarmCoins RPC cache merge, shouldClaimGrandArenaCoins on-demand + 6h anti-cap + 15m cooldown, zero-polling hwa-auto-shop-favorites background alarm, ShopModal #shop-collect-ga-coins-btn, SettingsTab #setting-auto-shop-favorites, Daily Autopilot shop-favorites step, 1394/1394 tests and dual build passed.
<!-- SECTION:NOTES:END -->

