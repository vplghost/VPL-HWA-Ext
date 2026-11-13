---
id: 20261113-1653-discover-brigand-targets-through-camp-summary
title: Discover Brigand targets through camp summary
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-DHB6KB'
  - '@doc/api/brigand-camp-rpc-contract'
  - 'extension/rpc-cache.js:extract'
  - 'src/utils/brigandCamp.ts:campSearchCalls'
  - tests/brigand-camp.test.mjs
relatedDocs:
  - api/brigand-camp-rpc-contract
relatedTasks:
  - VHE-DHB6KB
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-DHB6KB" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'ca37ca1d73a44d77d9eeab7bacbdc1b0df336b7981fd4f2d5adcb0f610a8ba39'
reviewEvaluatedAt: '2026-11-13T09:53:02.947Z'
createdAt: '2026-11-13T09:53:02.947Z'
updatedAt: '2026-11-13T09:53:02.947Z'
---

## Context

Search capture hwa-game-record-202611131645_brigand_search.json supplies the previously missing getCampSummary:camp protocol. Its six targets include UUID, campConfigId, defendersPack and nextRespawnDt. This replaces the prior manual-ID-only discovery limitation; settlement and energy rules remain applicable.

## Decision

Discover camps with getCampSummary feature camp and empty args. Cache confirmed campsSummary, filter levels locally, select server-provided UUIDs, remove confirmed defeated targets and require a new summary at respawn expiry. Treat search errors and transport acceptance separately from success. Keep search a feature-scoped read under global RPC settings; do not infer coordinate search or native battle start from this trace.

## Alternatives Considered


## Consequences
