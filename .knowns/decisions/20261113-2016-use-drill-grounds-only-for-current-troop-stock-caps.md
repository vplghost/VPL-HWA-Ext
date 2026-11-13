---
id: 20261113-2016-use-drill-grounds-only-for-current-troop-stock-caps
title: Use Drill Grounds only for current troop stock caps
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-WH13EE'
  - '@doc/architecture/troop-stock-limits-from-building-levels'
  - User, 2026-11-13, Drill Grounds-only rule and14230 correction
  - 'src/utils/troops.ts:calculateTroopMax'
  - 'src/utils/troops.ts:troopStockProgress'
  - tests/troop-stock-limit.test.mjs
relatedDocs:
  - architecture/troop-stock-limits-from-building-levels
relatedTasks:
  - VHE-WH13EE
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-WH13EE" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '258c777f4b92115f2b346e376c8d29e888633802ee3f3facf3fcb954e63de6e1'
reviewEvaluatedAt: '2026-11-13T13:16:30.622Z'
createdAt: '2026-11-13T13:16:30.622Z'
updatedAt: '2026-11-13T13:16:30.622Z'
---

## Context

The user corrects the prior capacity model: latest game uses only Drill Grounds. They confirmed level19=7400 plus level14=6830 gives14230 per troop type. Older captured configs retain Camp capacity bonuses that are inactive in this game rule.

## Decision

Sum completed Drill Grounds182/183/184 only for the common per-type stock cap. Exclude legacy Camp rewards, queued levels, training batch and march capacity; do not invent an adjustment from the user's corrected typo. Use true cap for progress, show raw occupancy/excess while clipping visual segments to100%, and preserve explicit unknown states and training bounds.

## Alternatives Considered


## Consequences

Replaces the prior draft20261113-1953-use-verified-building-bonuses-for-troop-stock-limits, whose Camp contribution is incorrect for the latest game. The canonical architecture doc and existing memory are rewritten accordingly; old draft is rejected rather than kept as live guidance.
