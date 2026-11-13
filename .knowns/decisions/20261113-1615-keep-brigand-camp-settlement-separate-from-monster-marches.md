---
id: 20261113-1615-keep-brigand-camp-settlement-separate-from-monster-marches
title: Keep Brigand camp settlement separate from monster marches
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-GVVBMR'
  - '@doc/api/brigand-camp-rpc-contract'
  - 'extension/rpc-cache.js:extract'
  - src/components/dialogs/BrigandCampModal.vue
  - tests/brigand-camp.test.mjs
relatedDocs:
  - api/brigand-camp-rpc-contract
relatedTasks:
  - VHE-GVVBMR
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-GVVBMR" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '76e9470ea8182c47da764b4ee075788a2699362122f460a6d3a858622a639da5'
reviewEvaluatedAt: '2026-11-13T09:15:15.082Z'
createdAt: '2026-11-13T09:15:15.082Z'
updatedAt: '2026-11-13T09:15:15.082Z'
---

## Context

The Brigand trace contains a heroes-only team and a victory settlement, with no camp search or returned march. Immutable camp config verifies ten World Energy for every camp level.

## Decision

Use globalMapCamp for saved camp teams and winCampBattle:camp for observed settlement receipts. Deduct ten World Energy once only on confirmed success against a known snapshot, then reconcile through world refillable snapshots under existing RPC policy. Keep camp victory settlement separate from Solo Monster squad/march state. Never invent camp discovery or prefill a completed camp as an available target; label direct settlement behavior until a captured native battle/discovery integration exists.

## Alternatives Considered


## Consequences
