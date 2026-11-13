---
id: 20261113-1816-recover-stale-raid-targets-and-trigger-on-natural-energy-crossing
title: Recover stale raid targets and trigger on natural energy crossing
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-BPQPT6'
  - '@doc/architecture/raid-target-recovery-and-natural-energy-trigger'
  - '@decision/20261106-2154-raid-queue-consumes-searched-bosses-before-searching-again'
  - 'extension/raid-queue.js:advance'
  - 'extension/raid-energy-auto.js:observe'
  - tests/raid-energy-auto.test.mjs
relatedDocs:
  - architecture/raid-target-recovery-and-natural-energy-trigger
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-BPQPT6
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-BPQPT6" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'd8859c5ef00aad4ddf54c4d82ed6c51c74f9517ec08907d7eaa38c17ffaf2d1e'
reviewEvaluatedAt: '2026-11-13T11:16:08.625Z'
createdAt: '2026-11-13T11:16:08.625Z'
updatedAt: '2026-11-13T11:16:08.625Z'
---

## Context

User requested stale/missing boss recovery and an opt-in automatic raid only when naturally regenerated World Energy reaches a threshold, excluding startup and already-above values. This extends the accepted raid candidate consumption policy with stale/invalid batch exceptions; normal fresh batch ordering and confirmed win/return count rules remain unchanged.

## Decision

Expire raid candidate batches after five minutes and search automatically when missing or rejected as nonexistent/expired/unavailable. Keep failed/won exclusions and remaining count. Persist account-bound dialog options for opt-in natural energy automation. A same-document/account heartbeat must observe below-to-exact-threshold progression consistent with known regeneration; suppress startup/reload, late catch-up, manual gains and overshoot. Consume crossings before serialized dispatch, skip busy/disabled/unavailable states rather than defer, and inherit global RPC settings without silently enabling them.

## Alternatives Considered


## Consequences
