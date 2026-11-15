---
id: 20261115-1011-require-five-distinct-heroes-for-hero-based-expedition-starts
title: Require five distinct heroes for hero-based expedition starts
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-89H8FM'
  - src/utils/expeditions.ts
  - extension/intercept.js
  - tests/expeditions.test.mjs
relatedDocs:
  - api/expedition-rpc-contract-and-dashboard-automation
relatedTasks:
  - VHE-89H8FM
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-89H8FM" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'e0a6c5c4141109b79b596b4c98481d4ec4195aa126edd06b71ac04c0698f00e3'
reviewEvaluatedAt: '2026-11-15T03:11:58.138Z'
createdAt: '2026-11-15T03:11:58.139Z'
updatedAt: '2026-11-15T03:11:58.139Z'
---

## Context

The Nov15 capture rejects expeditionId0 with four heroes as NotEnough hero count. The previous greedy planner stopped as soon as required power was reached, which allowed incomplete teams. Nov14 ID7 Video Expedition succeeded with an empty heroes array.

## Decision

Hero-based expedition plans and helper starts require exactly five distinct owned available heroes and enough power. Power sufficiency does not waive hero count. Preserve slot8 Video Expedition as the captured no-hero exception. Helper wire validation accepts only 0 or 5 heroes; planner restricts empty teams to the no-hero slot. Passive reducers retain historical incomplete-team failures as observations, without treating them as successful starts.

## Alternatives Considered


## Consequences
