---
id: 20261114-1816-display-observed-rally-power-with-explicit-partial-subtotals
title: Display observed rally power with explicit partial subtotals
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - rallyPowerTooltip
  - tests/rally-power.test.mjs
  - '@doc/api/world-map-rpc-contracts'
relatedDocs:
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-G173WD
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-G173WD" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'b7520e5a0d2b1a2eb477afb5ac325029a21f9dd5598e53944705cb0ae6b07bd7'
reviewEvaluatedAt: '2026-11-14T11:16:14.398Z'
createdAt: '2026-11-14T11:16:14.399Z'
updatedAt: '2026-11-14T11:16:14.399Z'
---

## Context

Rally details include squads but omit participant hero power. Local heroGetAll cannot describe foreign players. In-game boss display power comes from verified preset data.

## Decision

Compare raid rally and boss display power using packaged verified boss heroesPower and sum(count × unit.power). Resolve only current-account matching hero profiles. Mark incomplete components and totals with +; use — when no power is known. Keep participant snapshots account-scoped and reject older/lower-version details.

## Alternatives Considered

Do not substitute foreign hero IDs with local hero power or RPC enemy combat power. Do not infer exact totals from the current player alone.

## Consequences

Tooltip gives useful observed lower bounds without claiming full hero knowledge or predicting combat outcome.
