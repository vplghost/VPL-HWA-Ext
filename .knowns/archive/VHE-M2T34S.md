---
id: VHE-M2T34S
title: Legend draft matrix, guild chat tab, titan soul stones, and upgradable row highlights
status: done
priority: high
labels:
  - draft,chat,ui
createdAt: '2026-11-01T18:30:20.589Z'
updatedAt: '2026-11-06T10:31:35.258Z'
completedAt: '2026-11-01T18:30:27.485Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:35.258Z'
---
# Legend draft matrix, guild chat tab, titan soul stones, and upgradable row highlights

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Display 15 heroes in 5 columns by 3 rows for Legend Draft picking and allow locking team
- [x] #2 Add Titan soul stones progress and rename column to Soul stones for both lists
- [x] #3 Highlight rows where soul stones reach the evolution threshold with distinct background and badge
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified 15-hero 5x3 matrix/lock tests, hero/titan soul stone progress and upgradable highlights. Removed original AC #2 navigation-tab requirement as superseded by the Guild Chat FAB/dialog (@task-VHE-GSFVHT, @task-VHE-ARSAFV, @task-VHE-Q1PGF6). Sender roles, search and messages remain implemented/tested inside that dialog; no obsolete tab is reintroduced. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

