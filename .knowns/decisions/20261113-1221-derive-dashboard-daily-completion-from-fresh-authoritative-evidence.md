---
id: 20261113-1221-derive-dashboard-daily-completion-from-fresh-authoritative-evidence
title: Derive dashboard daily completion from fresh authoritative evidence
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-64GPHS'
  - '@doc/architecture/dashboard-live-status-model'
  - 'src/composables/activityState.ts::dungeonActivityState'
  - 'src/utils/dashboardState.ts::dashboardQueues'
  - tests/dashboard-state.test.mjs
relatedDocs:
  - architecture/dashboard-live-status-model
relatedTasks:
  - VHE-64GPHS
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-64GPHS" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'c1557390679242c22ca4a58d6ba60c07a6fe3c714b3a46fb190031b540761a69'
reviewEvaluatedAt: '2026-11-13T05:21:06.372Z'
createdAt: '2026-11-13T05:21:06.372Z'
updatedAt: '2026-11-13T05:21:06.372Z'
---

## Context

Dashboard previously read incorrect queue/march timing fields and treated exhausted attempts as informational. User requested live queue/march data and accurate daily completion on 2026-11-13.

## Decision

Dashboard must distinguish unknown snapshots from observed idle/completed states. Use canonical normalized queue/march data and shared lifecycle/expiry helpers. Daily completion requires fresh evidence within the observed daily reset window (local-calendar fallback). Arena/Grand Arena zero known attempts are Done. Dungeon Done requires same-day combat and no surviving eligible owned titan across every known next door, rather than merely a dead preferred team. Missing data cannot prove completion.

## Alternatives Considered


## Consequences
