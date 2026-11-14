---
id: 20261114-1503-synchronize-expedition-collection-only-from-confirmed-farm-results
title: Synchronize Expedition collection only from confirmed farm results
status: draft
supersedes: []
supersededBy: []
tags:
  - expeditions
  - rpc
  - rewards
sources:
  - '@task-VHE-GN1AQ2'
  - '@doc/api/expedition-rpc-contract-and-dashboard-automation'
  - extension/rpc-cache.js
  - src/components/dialogs/ExpeditionsModal.vue
  - tests/expeditions.test.mjs
relatedDocs:
  - api/expedition-rpc-contract-and-dashboard-automation
relatedTasks:
  - VHE-GN1AQ2
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-GN1AQ2" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'b2f0c868b57829c90f1e594a40d53b3e0b61907de8c1c44e1ed216f3373a2e25'
reviewEvaluatedAt: '2026-11-14T08:03:45.124Z'
createdAt: '2026-11-14T08:03:45.124Z'
updatedAt: '2026-11-14T08:03:45.124Z'
---

## Context

The new capture verifies expeditionFarm returns the actual reward and an explicit null newExpedition. Native collections were not reducing the expedition lifecycle, so ready rows retained heroes until a later snapshot.

## Decision

Accept only the exact expeditionFarm{expeditionId} contract. On confirmed reward plus null replacement, mark the account-scoped row collected and release its heroes; apply only returned rewards once and update quest progress without claiming quest rewards. Preserve snapshot precedence, per-row observation freshness and pending uncertainty. Use an explicit Collect button for ready rows under shared RPC policy.

## Alternatives Considered

Timer expiry is not collection. Crediting quest.reward would award unclaimed prizes. Promoting all rows to today's freshness after one overnight collection could wrongly start yesterday's slots.

## Consequences

In-game and helper collection share one reducer. Unknown replacement shapes need a fresh snapshot; no automatic collect schedule is added. Candidate remains draft.
