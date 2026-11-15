---
id: 20261115-1250-keep-speedup-controls-compact-and-suggest-one-item-short-quantities
title: Keep speedup controls compact and suggest one-item-short quantities
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-YX63BV'
  - src/components/common/SpeedupControl.vue
  - extension/speedup.js
  - docs/acceptance/speedup-compact-2026-11-15.json
relatedDocs:
  - api/speedup-rpc-contract-and-confirmed-use
relatedTasks:
  - VHE-YX63BV
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-YX63BV" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: 'e0909d7063f1a7e4541ab1519d348e6328ac20d3aa0aa8a4c678eb968491545c'
reviewEvaluatedAt: '2026-11-15T05:50:10.572Z'
createdAt: '2026-11-15T05:50:10.572Z'
updatedAt: '2026-11-15T05:50:10.572Z'
---

## Context

User requested a compact default UI and explicitly confirmed on2026-11-15 that minus one refers to one item below the quantity sufficient to finish. Implemented and verified in Chrome Direct/Piggyback0.10.94.

## Decision

Show only a borderless fast-forward icon beside progress percent or an active healing timer. Open the speedup form above the parent on click; opening/selection never spends, and every mutation still requires separate confirmation. Suggest min(stock,max(0,ceil(remainingMs/itemDurationMs)-1)) when opening or changing item; preserve manual quantity and all pending/account/stock guards. Stacked speedup Escape closes only that layer.

## Alternatives Considered


## Consequences
