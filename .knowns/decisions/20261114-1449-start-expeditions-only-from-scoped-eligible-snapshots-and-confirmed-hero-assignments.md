---
id: 20261114-1449-start-expeditions-only-from-scoped-eligible-snapshots-and-confirmed-hero-assignments
title: Start expeditions only from scoped eligible snapshots and confirmed hero assignments
status: draft
supersedes: []
supersededBy: []
tags:
  - expeditions
  - heroes
  - rpc
  - dashboard
sources:
  - '@task-VHE-03VDQ4'
  - '@doc/api/expedition-rpc-contract-and-dashboard-automation'
  - 'src/utils/expeditions.ts:expeditionPlan'
  - src/components/dialogs/ExpeditionsModal.vue
  - tests/expeditions.test.mjs
  - temp/tracking-data/hwa-game-record-202611141432_start_expedition.json
relatedDocs:
  - api/expedition-rpc-contract-and-dashboard-automation
  - architecture/dashboard-live-status-model
relatedTasks:
  - VHE-03VDQ4
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-03VDQ4" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '81e748445bf9604cc89a8409f62ab89b335174bbce24696336805fc2081df0bb'
reviewEvaluatedAt: '2026-11-14T07:49:16.184Z'
createdAt: '2026-11-14T07:49:16.184Z'
updatedAt: '2026-11-14T07:49:16.184Z'
---

## Context

The captured expedition starts use server expedition IDs, heroes arrays and accepted endTime; snapshots distinguish locked, idle, running and completed slots. VIP8 and subscription slots must stay visible without attempting unavailable starts.

## Decision

Keep every configured expedition slot visible. Start only a current-day, active-account server row with available attempts; use its expedition ID and required power. Assign distinct owned heroes excluding running and ready-to-collect expeditions; video slots use no heroes. Wait for an accepted receipt or authoritative running snapshot before progressing the bounded user-triggered batch. Do not release heroes, claim rewards or infer a successful start from timer expiration or transport acknowledgement.

## Alternatives Considered

Hiding locked slots obscures VIP/subscription requirements. Using slotId as expeditionId addresses the wrong expedition. Sending a parallel batch can re-use heroes and treats queued transport as completed work.

## Consequences

The Dashboard dialog supports an explicit Start available run while open; stop/close prevents subsequent starts, unknown outcomes remain pending without automatic retry. No purchases or background schedule are introduced. This is a draft until human review.
