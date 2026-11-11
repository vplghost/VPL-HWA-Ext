---
id: VHE-ZHH4XN
title: 'Synchronize Extension 1:1 with Legacy HTML Layout and Dialogs'
status: in-progress
priority: high
labels:
  - wxt,vue,parity,ui
createdAt: '2026-11-11T04:17:44.986Z'
updatedAt: '2026-11-11T04:19:19.484Z'
timeSpent: 0
assignee: '@me'
---
# Synchronize Extension 1:1 with Legacy HTML Layout and Dialogs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sync Header layout: open-tab, marches, building, research, draft, mail, energy, world-energy badges and header-resources bar. 2. Restructure tabs: remove gathering, dungeon, tower from nav; add Teams tab; keep 10 canonical tabs matching HTML. 3. Sync Dashboard: add Gathering quick action; triggers for Tower, Dungeon, Quests, GVS; FAB dial with chat/tower/dungeon. 4. Sync Gathering dialog: convert Gathering to modal matching gather-dialog with mine rotation, teams, and auto-gather controls; test and commit. 5. Sync Tower dialog: convert Tower to modal matching tower-modal with route traversal, buff priority, chests, and auto-run; test and commit. 6. Sync Titan Dungeon dialog: convert Dungeon to modal matching dungeon-modal with floor badge, auto runner, and refresh; test and commit. 7. Sync Quest and Campaign dialogs: refine Quest Details modal and Campaign Raid modal; test and commit. 8. Sync Draft, GVS, and Chat modals: implement Legend Draft, Guild Versus, and floating Guild Chat panel; test and commit.
<!-- SECTION:PLAN:END -->

