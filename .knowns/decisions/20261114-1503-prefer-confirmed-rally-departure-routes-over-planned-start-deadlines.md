---
id: 20261114-1503-prefer-confirmed-rally-departure-routes-over-planned-start-deadlines
title: Prefer confirmed rally departure routes over planned start deadlines
status: draft
supersedes: []
supersededBy: []
tags:
  - rally
  - mqtt
  - timing
sources:
  - '@task-VHE-GN1AQ2'
  - '@doc/api/world-map-rpc-contracts'
  - '@doc/api/mqtt-processing-and-refresh'
  - tests/rally-observed-start.test.mjs
  - tests/raid-queue.test.mjs
  - tests/background.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
  - api/mqtt-processing-and-refresh
relatedTasks:
  - VHE-GN1AQ2
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-GN1AQ2" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'd1f461007edd5efb21e6bd3c9b32a3f3318e8c2f7f2d54c68c2aae64378a626e'
reviewEvaluatedAt: '2026-11-14T08:03:45.174Z'
createdAt: '2026-11-14T08:03:45.174Z'
updatedAt: '2026-11-14T08:03:45.174Z'
---

## Context

The capture correlates rallyStarted version13 MQTT notifications with getRallyById routes departing over four minutes before plannedStartTime.

## Decision

For a correlated own rally, use the authoritative mob-targeted outbound route for departure, duration and arrival; preserve plannedStartTime as provenance. Reject lower-version details. A confirmed departure disables member cancellation based on the obsolete planned deadline. MQTT rallyStarted is an invalidation hint requesting scoped detail/march refresh, not proof of victory or return.

## Alternatives Considered

Continuing to wait on plannedStartTime misreports travel and may trigger cancellation after departure. Treating every Guild rally as owned attaches foreign squads.

## Consequences

Actual outbound timing drives Dashboard and managed raid queue while battle outcomes and return completion still need their existing evidence. Candidate remains draft.
