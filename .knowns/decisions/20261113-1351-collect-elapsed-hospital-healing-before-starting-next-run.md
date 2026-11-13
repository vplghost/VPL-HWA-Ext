---
id: 20261113-1351-collect-elapsed-hospital-healing-before-starting-next-run
title: Collect elapsed hospital healing before starting next run
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-CMZHNT'
  - '@doc/api/world-map-rpc-contracts'
  - 'src/composables/useTroopTraining.ts::syncHealed'
  - tests/healing-sync.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-CMZHNT
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-CMZHNT" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '1c162d0ac8feb5d0ea862a6c5a5d447f64a18414e8adc72d38d151c3eb3381fb'
reviewEvaluatedAt: '2026-11-13T06:51:27.937Z'
createdAt: '2026-11-13T06:51:27.937Z'
updatedAt: '2026-11-13T06:51:27.937Z'
---

## Context


## Decision

Sync Healed must issue the observed completeHealing:unit mutation with millisecond completeDate, then reconcile authoritative unit/healing snapshots through shared dispatch settings. Only confirmed elapsed completion releases the prior run; queued/rejected dispatch cannot fabricate cache changes. Preserve newer runs from stale completions. The observed five-unit 40000 ms startHealing contradicts a blanket 60000 ms minimum; the existing per-unit estimate remains evidence-limited.

## Alternatives Considered


## Consequences
