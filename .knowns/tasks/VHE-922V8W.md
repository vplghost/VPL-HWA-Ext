---
id: VHE-922V8W
title: 'P2-28 Settings Balanced 2-Column Heights & Draggable Navigation Tab Pills'
status: done
priority: medium
labels:
  - p2
  - ui
  - settings
  - ux
  - backlog
createdAt: '2026-11-26T14:43:47.123Z'
updatedAt: '2026-11-26T14:48:02.087Z'
completedAt: '2026-11-26T14:48:02.087Z'
timeSpent: 0
---
# P2-28 Settings Balanced 2-Column Heights & Draggable Navigation Tab Pills

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add moveItemToIndex helper, convert Navigation Tabs to compact draggable pills (#settings-tab-pills), and balance 2-column heights across all 4 rows of SettingsTab.vue using items-stretch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AC1: Pure moveItemToIndex() helper in src/utils/listReorder.ts with unit tests
- [ ] #2 AC2: Compact draggable Navigation Tab pills (#settings-tab-pills, draggable=true) replacing 3-button list rows
- [ ] #3 AC3: Height-balanced 2-column rows with items-stretch in SettingsTab.vue preserving all essential IDs & 100% English
- [ ] #4 AC4: npm test (0 fail) and npm run build green
<!-- AC:END -->

