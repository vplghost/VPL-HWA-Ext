---
id: 20261106-1612-raid-queues-require-confirmed-return-and-verified-capacity
title: Raid queues require confirmed return and verified capacity
status: draft
supersedes: []
supersededBy: []
tags:
  - rally
  - rpc
  - queue
sources:
  - 'extension/raid-queue.js:advance'
  - 'extension/experimental-data.js:squadCapacity'
  - tests/raid-queue.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
  - architecture/shared-rpc-settings
relatedTasks:
  - VHE-1K5J8J
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-1K5J8J" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'b39939764a7b872f1ea568922d9be67f1428d467642f147d82ec7e6824f8050a'
reviewEvaluatedAt: '2026-11-06T09:12:58.059Z'
createdAt: '2026-11-06T09:12:58.059Z'
updatedAt: '2026-11-06T09:12:58.059Z'
---

## Context

Sequential rally automation can consume energy or launch overlapping armies if it trusts ETA or infers troop capacity from unverified coefficients.

## Decision

Persist background intent before RPC dispatch; require matching win and explicit returned-squad evidence before another raid. Allocate only available troops up to explicitly observed per-hero plus extra-base capacity; do not infer a capacity curve without executable evidence. Deadline cancellations inherit the global RPC policy and expire before departure.

## Alternatives Considered


## Consequences

Popup closure is supported; missing result/capacity/member evidence stops or cancels conservatively. Piggyback cancellation is best effort and never forces Direct. Hero stat changes require capacity confirmation.
