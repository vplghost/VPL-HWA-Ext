---
id: VHE-89H8FM
title: Require five heroes for hero-based expeditions
status: done
priority: high
labels: []
createdAt: '2026-11-15T03:09:28.910Z'
updatedAt: '2026-11-15T03:12:18.029Z'
completedAt: '2026-11-15T03:12:18.029Z'
timeSpent: 148
---
# Require five heroes for hero-based expeditions

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Capture hwa-game-record-202611151008_expedition.json rejects a 4-hero artifact_expeditionStart with NotEnough hero count. Fix team selection that stops after reaching required power. Preserve captured hero-free Video Expedition and receipt-driven sequencing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hero-based expeditions always plan exactly five distinct owned, unreserved heroes meeting required power, or no plan if fewer are available.
- [x] #2 The dialog and outgoing RPC validation prevent 1-4 hero teams while preserving the captured empty Video Expedition payload.
- [x] #3 New capture error and prior starts/collect behavior are covered; tests/typecheck/build and canonical docs pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the new failure and trace expeditionTeam plus dispatch validators. 2. Select a full five before power optimization, retain no-hero video exception, tighten outgoing validation and explain eligibility in the dialog. 3. Add team/dispatch/capture regressions, run checks and build patch release. 4. Correct canonical expedition contract and finish task with evidence and decision impact.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: expeditionTeam broke out immediately when total power reached the requirement, so the Nov15 expeditionId0 request carried only4heroes and received top-level NotEnough hero count. The planner now selects exactly5distinct valid owned available heroes before power optimization; fewer than5 cannot plan a hero expedition. Direct/Piggyback reject1-4hero payloads. Captured hero-free slot8 video remains valid. Passive cache still observes historical rejected4hero starts to settle errors. Dialog displays5/5 and count/power eligibility. Focused66 tests passed; full818 tests:806 passed,12 optional private-log skips. Typecheck and production build0.10.91 passed. Canonical source and SHA256: @doc/api/expedition-rpc-contract-and-dashboard-automation. Review:PASS; no unresolved P1/P2. Spec Decision Compliance:N/A, standalone contract correction. System Decision Impact: candidate @decision/20261115-1011-require-five-distinct-heroes-for-hero-based-expedition-starts (changed), kept draft.
<!-- SECTION:NOTES:END -->

