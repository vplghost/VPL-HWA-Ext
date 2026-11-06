---
id: 20261106-1709-estimate-rally-capacity-from-settings-and-identifiable-squad-observations
title: Estimate rally capacity from Settings and identifiable squad observations
status: draft
supersedes: []
supersededBy: []
tags:
  - rally
  - capacity
  - settings
sources:
  - 'extension/experimental-data.js:capacityModel'
  - 'extension/rpc-cache.js:observeSquad'
  - tests/experimental-data.test.mjs
  - tests/experimental-ui.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-NFV32J
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-NFV32J" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'f848f6db43cf2dc12e8f465e8cd83b6427600ca703b09b56ef5d4754378801fa'
reviewEvaluatedAt: '2026-11-06T10:09:54.470Z'
createdAt: '2026-11-06T10:09:54.470Z'
updatedAt: '2026-11-06T10:09:54.470Z'
---

## Context

The user clarified that per-hero/base inputs clutter Rally and requested automatic capacity from hero/squad data with temporary 600/950 Settings defaults. Earlier explicit-only capacity workflow is no longer the requested behavior.

## Decision

Keep capacity inputs only as global defaults in Settings (600 per unknown hero, 950 base). Learn max own-account stat-bound squad loads from successful rally, auto-join and gathering events. Infer only identifiable hero contributions; leave underdetermined or inconsistent contributions at fallback values. Treat observed loads as operational estimates rather than proof of game maximum. Map 1–9 to Marksmen, 11–19 to Spearmen and 21–29 to Infantry.

## Alternatives Considered


## Consequences

Rally UI stays compact with troop counts/tier breakdowns and never waits for manual hero capacity entry. Estimates improve as independent lineup observations accumulate; stat changes discard old profile evidence and use defaults.
