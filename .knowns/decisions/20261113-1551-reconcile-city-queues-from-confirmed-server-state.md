---
id: 20261113-1551-reconcile-city-queues-from-confirmed-server-state
title: Reconcile city queues from confirmed server state
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-1YQ8A1'
  - '@doc/architecture/building-and-research-queue-reconciliation'
  - tests/background.test.mjs
  - tests/city-queue-ui.test.mjs
relatedDocs:
  - architecture/building-and-research-queue-reconciliation
relatedTasks:
  - VHE-1YQ8A1
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-1YQ8A1" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '47c83f64f37010081778782c35d20ed8bed14b5ef362da8dc01dc97ecb18fdfb'
reviewEvaluatedAt: '2026-11-13T08:51:59.079Z'
createdAt: '2026-11-13T08:51:59.079Z'
updatedAt: '2026-11-13T08:51:59.079Z'
---

## Context


## Decision

Background owns Building/Research queue edits and scheduling through one serialized lane per type. Retain saved items until confirmed start, distinguish dispatch from server success in logs, immediately evaluate fresh idle summaries despite old wake times, and verify stale/uncertain state with bounded summary RPCs. Interpret milliseconds without duration-size heuristics. Surface mutation/planning/storage/transport failures in UI and queue logs; preserve shared RPC policy.

## Alternatives Considered


## Consequences
