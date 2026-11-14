---
id: 20261114-1403-end-free-alchemy-cooldown-at-refill-or-daily-game-reset
title: End free Alchemy cooldown at refill or daily game reset
status: draft
supersedes: []
supersededBy: []
tags:
  - alchemy
  - wheel
  - cooldown
  - daily-reset
sources:
  - '@task-VHE-8GZG4Z'
  - '@doc/architecture/rpc-cache-pipeline'
  - temp/tracking-data/hwa-game-record-202611141349_wheel_timer.json
  - temp/resources-splitlib/refillable.json
  - 'src/utils/freeAlchemySpin.ts:freeAlchemyAvailability'
  - tests/free-alchemy-timer.test.mjs
relatedDocs:
  - architecture/rpc-cache-pipeline
relatedTasks:
  - VHE-8GZG4Z
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-8GZG4Z" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'de269712cb66a8ec7cb04644c70199b4d8ea14f226d1ee22477f567bfd7a0fda'
reviewEvaluatedAt: '2026-11-14T07:03:07.272Z'
createdAt: '2026-11-14T07:03:07.273Z'
updatedAt: '2026-11-14T07:03:07.273Z'
---

## Context

The wheel_timer capture shows a top-level NotEnough error for refillable53, with last-refill/server-now timing. The user explicitly required disabling until available and restoring default free availability on a new day on2026-11-14.

## Decision

For the Dashboard free Alchemy video spin, calculate the waiting deadline from verified refillable53 timing (28800 seconds) and cap it at the observed next daily reset. Ignore prior-day exhausted observations; use the existing local-midnight fallback only without a server reset boundary. A newer authoritative positive quota overrides older cooldown evidence. Timers control UI availability without modifying inventory balances or issuing RPC.

## Alternatives Considered

Using archived refillable62 would apply the wrong resource contract. Retaining an eight-hour wait across daily reset contradicts the requested reset behavior. Repeated speculative spin calls waste RPC and produce avoidable quota errors.

## Consequences

The button uses a live tooltip countdown and guards dispatch during the wait. Unknown availability remains a default free attempt, subject to server validation. This candidate records the implemented contract and remains non-current pending review.
