---
id: 20261106-2108-first-rally-uses-selected-target-with-optional-late-cancellation
title: First rally uses selected target with optional late cancellation
status: draft
supersedes: []
supersededBy: []
tags:
  - rally
sources:
  - '@task-VHE-992BGT'
  - 'extension/raid-queue.js:start'
  - 'extension/popup.js:renderExperimental'
  - tests/raid-queue.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-992BGT
verification: []
reviewState: ready_for_review
reviewBlockers: []
reviewMatches: []
reviewAllowedResolutions:
  - accept_new
  - reject_new
reviewEvaluatedHash: '50689d8467104c1afa1c8478ab2dd85d157a816f9dec26899707ba7fb83fb04d'
reviewEvaluatedAt: '2026-11-06T14:56:55.283Z'
createdAt: '2026-11-06T14:08:42.996Z'
updatedAt: '2026-11-06T14:56:55.284Z'
---

## Context

The 2026-11-06 capture shows Find boss succeeded, then Start repeated roster refresh and boss search without recording a createRally call. The UI needed a user-controlled cancellation switch.

## Decision

The first Rally raid sends createRally using the selected boss and cached troop snapshot. A queued raid refreshes roster and searches again only after a confirmed win and return. Member-based auto-cancel is an account preference and may issue one cancellation during the final ten seconds before departure when enabled.

## Alternatives Considered


## Consequences

The first dispatch can proceed immediately from observed data; stale roster may still be rejected by the game and is reported. In-game validation remains required.
