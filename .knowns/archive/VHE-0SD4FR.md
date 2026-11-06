---
id: VHE-0SD4FR
title: Guild Versus modal, Events tab, chest rewards, and header cap glow
status: done
priority: high
labels:
  - events,ui
createdAt: '2026-11-02T05:23:20.764Z'
updatedAt: '2026-11-06T10:31:30.954Z'
completedAt: '2026-11-02T05:23:38.368Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:30.954Z'
---
# Guild Versus modal, Events tab, chest rewards, and header cap glow

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Extract Guild Versus info, battle, rewards, and progress
- [x] #2 Add Events tab and Guild Versus modal in popup
- [x] #3 Award chest 1-6 rewards from claimChest action
- [x] #4 Apply bold glow styling to header resources at or above cap
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified clanVersus extract/merge and claimChest reducers in rpc-cache; Events and Guild Versus modal plus cap styling in popup; regressions: rpc-cache.test.mjs clanVersus/claimChest tests and events-ui.test.mjs renderEvents/openGuildVersusModal/header capped styling. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

