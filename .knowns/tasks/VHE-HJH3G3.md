---
id: VHE-HJH3G3
title: 'P2-24 Realm Offline Resources Auto-Claim, Free Gifts Button & Unified Settings'
status: done
priority: medium
labels:
  - p2
  - dashboard
  - settings
  - backlog
createdAt: '2026-11-26T13:07:12.735Z'
updatedAt: '2026-11-26T13:11:49.695Z'
completedAt: '2026-11-26T13:11:49.695Z'
timeSpent: 0
---
# P2-24 Realm Offline Resources Auto-Claim, Free Gifts Button & Unified Settings

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Preserve lastCollectDate in productionStatus, add safe Realm production pending calculator, add #free-gift-chip-realmResources to FreeGiftsStrip, add 60m background auto-collector hwa-auto-realm-resources, and unify Auto Free Spin + Auto Frontier Rewards + Auto Realm Resources into #settings-auto-collectors-section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AC1: rpcCache preserves and updates lastCollectDate in productionStatus
- [ ] #2 AC2: computeRealmProductionPending computes 5 producers safely with 60s min and 8h cap
- [ ] #3 AC3: FreeGiftsStrip #free-gift-chip-realmResources + 60m background alarm hwa-auto-realm-resources
- [ ] #4 AC4: Unified #settings-auto-collectors-section in SettingsTab.vue (100% English)
- [ ] #5 AC5: Unit tests pass (npm test 0 fail) and npm run build succeeds
<!-- AC:END -->

