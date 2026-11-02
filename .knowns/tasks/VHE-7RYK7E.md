---
id: VHE-7RYK7E
title: Extract and sync resources from openLootboxChanced and inventory_use chest openings
status: done
priority: high
labels: []
createdAt: '2026-11-02T10:04:59.767Z'
updatedAt: '2026-11-02T10:08:41.100Z'
completedAt: '2026-11-02T10:08:41.100Z'
timeSpent: 0
---
# Extract and sync resources from openLootboxChanced and inventory_use chest openings

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Register openLootboxChanced in definitions and extract chest open actions
- [x] #2 Handle inventory_use chest opens with array response format, deducting spent chests and extracting reward items
- [x] #3 Merge chest rewards into inventoryGet categories (fragmentHero, fragmentTitan, coin, consumable, material, gear, scroll, etc.) and update matching resource:* entries
- [x] #4 Deduct spent lootboxChanced and consumable chests from inventoryGet and resource:*
- [x] #5 Verify against tracking data and write unit tests covering both methods
<!-- AC:END -->

