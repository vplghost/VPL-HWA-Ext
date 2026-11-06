---
id: 20261106-1818-daily-dashboard-uses-observed-game-snapshots
title: Daily dashboard uses observed game snapshots
status: draft
supersedes: []
supersededBy: []
tags:
  - dashboard
sources:
  - '@task-VHE-DNMYZY'
relatedDocs:
  - architecture/goals-tracking
relatedTasks:
  - VHE-DNMYZY
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-DNMYZY" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'bcbaf27f2d7364319591d38951482489b7bc5646f302379f90457eaac88084ec'
reviewEvaluatedAt: '2026-11-06T11:18:20.607Z'
createdAt: '2026-11-06T11:18:20.607Z'
updatedAt: '2026-11-06T11:18:20.607Z'
---

## Context

Daily tracking must avoid presenting stale or incomplete game state as completed work. Arena responses expose ranks but no daily battle count.

## Decision

The Dashboard tab opens first and groups daily activities before daily quests and free gifts. It derives status from same-day passive RPC snapshots and shows Unknown or Check when the game data cannot prove completion.

## Alternatives Considered


## Consequences

Dashboard statuses remain informational for activities without a reliable completion counter; future sources may refine them.
