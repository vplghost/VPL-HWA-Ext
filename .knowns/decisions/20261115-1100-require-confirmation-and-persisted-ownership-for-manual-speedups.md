---
id: 20261115-1100-require-confirmation-and-persisted-ownership-for-manual-speedups
title: Require confirmation and persisted ownership for manual speedups
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-HHPR1K'
  - src/components/common/SpeedupControl.vue
  - extension/background.js
  - extension/rpc-cache.js
  - docs/acceptance/speedup-2026-11-15.json
relatedDocs:
  - api/speedup-rpc-contract-and-confirmed-use
relatedTasks:
  - VHE-HHPR1K
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-HHPR1K" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'c84f532d6e5d9414362fe5e071837e2662620f96758a95011b9fd98d64fd02ab'
reviewEvaluatedAt: '2026-11-15T04:00:05.771Z'
createdAt: '2026-11-15T04:00:05.771Z'
updatedAt: '2026-11-15T04:00:05.771Z'
---

## Context

User explicitly required confirmation to prevent accidental speedup consumption on2026-11-15. The supplied capture proves three dedicated-item RPCs with empty successful responses and millisecond timing. Implemented with actual Chrome Direct/Piggyback confirmation/cancel evidence in0.10.93.

## Decision

Every helper speedup spend requires a separate user confirmation naming target, item count and time reduction. The background owns a single persisted pending spend, revalidates account/stock/target/shared settings, and correlates the preserved MAIN token with an explicit success or rejection. Acknowledgements, uncertain transport and timeouts never release or retry a spend. Only captured dedicated construction/research/healing payloads are enabled; unknown training/universal/overrun exchange remains capture-gated. Canonical timers and known stock change only after confirmed responses, idempotently and behind newer snapshot precedence.

## Alternatives Considered


## Consequences

Manual spends are protected across dialogs and worker restarts; an uncertain spend stays blocked until a matching game receipt. Unsupported exchange payloads are documented rather than guessed.
