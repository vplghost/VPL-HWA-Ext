---
id: 20261113-1953-use-verified-building-bonuses-for-troop-stock-limits
title: Use verified building bonuses for troop stock limits
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-JXMA49'
  - '@doc/architecture/troop-stock-limits-from-building-levels'
  - 'src/utils/troops.ts:calculateTroopMax'
  - scripts/generate-troop-limit-data.mjs
  - tests/troop-stock-limit.test.mjs
relatedDocs:
  - architecture/troop-stock-limits-from-building-levels
relatedTasks:
  - VHE-JXMA49
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-JXMA49" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '093debb3cce55d7f150dde8b8f9b5b6339c802c1d613e6571cc59c794af35031'
reviewEvaluatedAt: '2026-11-13T12:53:30.227Z'
createdAt: '2026-11-13T12:53:30.227Z'
updatedAt: '2026-11-13T12:53:30.227Z'
---

## Context

The troop card and training helper used an unverified linear Camp formula, treated trainingCapacity research as stock capacity and inflated the displayed limit to current troop stock. The immutable configs identify capacity increments for Camps 40/41/42 and Drill Grounds group 182/183/184.

## Decision

Derive per-type stock limits from cumulative permanent absolute unitsCapacity bonuses at confirmed building levels, summing all three Drill Grounds and the matching Camp. Do not use queued levels, per-march hero capacity or per-batch trainingCapacity research to determine stock limits. Missing/unsupported building evidence remains unknown and prevents training; overflowing stock does not redefine the limit. Keep generated tables MD5-verified against captured immutable config URLs.

## Alternatives Considered


## Consequences
