---
id: VHE-D1FCMT
title: 'Fix dashboard UI bugs: troop heal sync, server teams, item names, tab consistency, and dungeon cleanup bug'
status: done
priority: high
labels:
  - ui
  - parity
createdAt: '2026-11-11T09:24:26.430Z'
updatedAt: '2026-11-11T09:38:11.560Z'
completedAt: '2026-11-11T09:37:58.996Z'
timeSpent: 0
assignee: '-l'
---
# Fix dashboard UI bugs: troop heal sync, server teams, item names, tab consistency, and dungeon cleanup bug

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 useTroopTraining handles associative object payloads without reduce or iterator crash
- [x] #2 Troops overview maintains smooth loading states during sync and heal without UI jumping
- [x] #3 TeamsTab displays server-saved teams from teamGetAll cache with clone-to-custom action
- [x] #4 resourceData and inventory items resolve human-readable in-game names instead of raw IDs
- [x] #5 ItemsTab groups items into categorized sections and unifies view switcher and export across tabs
- [x] #6 DungeonModal retains clean combat log and casualty view with automated attack triggers removed
<!-- AC:END -->

