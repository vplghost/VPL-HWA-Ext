---
id: 20261115-0153-schedule-opt-in-free-alchemy-spins-with-shared-manual-and-automatic-confirmation-state
title: Schedule opt-in free alchemy spins with shared manual and automatic confirmation state
status: draft
supersedes: []
supersededBy: []
tags:
  - free-spin
  - automation
  - rpc
sources:
  - extension/free-alchemy.js
  - 'extension/background.js:runFreeSpin'
  - tests/auto-free-spin.test.mjs
  - docs/acceptance/free-spin-2026-11-15.json
relatedDocs:
  - architecture/rpc-cache-pipeline
relatedTasks:
  - VHE-Q5STB2
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-Q5STB2" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '128d64ed878075e0328b6f6d5612a6bb141051f19597c8519ff155d0911c4371'
reviewEvaluatedAt: '2026-11-14T18:53:45.199Z'
createdAt: '2026-11-14T18:53:45.199Z'
updatedAt: '2026-11-14T18:53:45.199Z'
---

## Context

User requested automatic free spin at timer expiry on2026-11-15; existing manual refillable53 action and8h/day-reset timer were already verified.

## Decision

Provide explicit opt-in automatic free53 spin using shared RPC policy and background/content deadline scheduling. Refresh quota before automatic mutation. Manual and automatic requests share a persisted account-scoped confirmation lock; unknown mutation outcomes never trigger automatic resend or a paid fallback.

## Alternatives Considered


## Consequences

Works while popup is closed when the game bridge/account is available; Settings default off. Existing server receipts/quota define completion and next eligibility. Archived62 UI remains shelved. Candidate is draft pending review.
