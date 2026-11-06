---
id: VHE-8RNWEA
title: Hero evolution tracking and rally return route handling
status: done
priority: high
labels:
  - heroes,rally
createdAt: '2026-11-02T05:23:26.002Z'
updatedAt: '2026-11-06T10:31:32.379Z'
completedAt: '2026-11-02T05:23:44.304Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:32.379Z'
---
# Hero evolution tracking and rally return route handling

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Track heroEvolve RPC to update hero star and deduct fragments
- [x] #2 Handle getRoutesByIds returnToOutpost and getPage:report rallyMobAttackResult
- [x] #3 Hide rally badge on header immediately when returnAt reached
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: heroEvolve star/fragment regression passes; report/return-route handling corrected under @task-VHE-MACK1D to avoid updating unrelated rallies. Only positive identities update a march; anonymous legacy reports still feed mail but cannot supply rally ETA. Expiry verified by isMarchExpired and header march UI regression. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

