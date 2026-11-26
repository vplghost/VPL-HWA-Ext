---
id: VHE-NHPAYN
title: 'P2-26 Default Open-in-Tab Toolbar Click, Open-in-Popup Setting & Compact Settings UI'
status: done
priority: medium
labels:
  - p2
  - ui
  - settings
  - ux
  - backlog
createdAt: '2026-11-26T14:18:27.757Z'
updatedAt: '2026-11-26T14:22:46.788Z'
completedAt: '2026-11-26T14:22:46.788Z'
timeSpent: 0
---
# P2-26 Default Open-in-Tab Toolbar Click, Open-in-Popup Setting & Compact Settings UI

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make extension toolbar click open/focus full tab (popup.html?view=tab) by default, add #setting-open-in-popup checkbox option, and refactor SettingsTab.vue into a compact multi-column layout with inline header Enable checkboxes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AC1: syncActionLaunchMode sets popup='' by default and chrome.action.onClicked opens/focuses popup.html?view=tab; openInPopup=true restores popup.html
- [ ] #2 AC2: Compact multi-column SettingsTab.vue with #setting-open-in-popup and inline header enable checkboxes preserving all existing IDs
- [ ] #3 AC3: 100% English .vue, unit tests pass (npm test 0 fail), npm run build green
<!-- AC:END -->

