---
id: VHE-GN1AQ2
title: Sync Expedition collection and add dialog Collect action
status: done
priority: medium
labels: []
createdAt: '2026-11-14T07:54:14.324Z'
updatedAt: '2026-11-14T08:04:11.067Z'
completedAt: '2026-11-14T08:04:11.067Z'
timeSpent: 586
---
# Sync Expedition collection and add dialog Collect action

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze expedition_collect capture, reduce confirmed in-game expeditionFarm outcomes into completed/replacement status with released heroes and exactly-once rewards, and add guarded Collect buttons to Expeditions dialog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Confirmed in-game expeditionFarm immediately synchronizes collected status and frees heroes; failures/stale snapshots cannot falsely collect or restore old state.
- [x] #2 Dialog Collect is available only for ready expeditions, dispatches exact captured payload, serializes with start and waits for confirmation without retrying uncertain mutations.
- [x] #3 Exact returned rewards and quest progress synchronize without double credit; regression tests/typecheck/build and documentation validation pass.
- [x] #4 Rally RPC and MQTT packets in the capture are documented with provenance and concrete supported uses; verified integration gaps are fixed and regression-tested.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify exact expeditionFarm request/result and state transitions from capture. 2. Add bounded correlated action extraction/reduction, exactly-once returned rewards and quest progress, completed status/hero release, and authoritative snapshot precedence. 3. Add guarded per-row Collect in dialog, separate collect confirmation from start and refresh snapshots/inventory through global RPC settings. 4. Add capture-shaped reducer/UI/dispatch regressions, update canonical contract and draft guidance, version/build and run tests/typecheck/validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope added per user: also analyze all rally-related RPC and MQTT packets in the supplied capture, persist verified schema/timeline and apply supported cache/lifecycle improvements where evidence warrants.

Rally/MQTT findings: capture contains14getRallyById calls and13received QoS1UTF8 MQTT publishes on clan topic:11rallyMembersUpdated plus2rallyStarted. Both rally versions advance to13 and include real outbound route before plannedStartTime. Added scoped rallyStarted refresh (tracked own rallies only), retained version/actual route from details, ignored lower-version details, updated actual departure/arrival/phase and queue cancellation timing; early departure no longer waits/cancels at old planned start. No victory/return is inferred from these notifications. Collect implementation/test results: exact expeditionFarm{id}, confirmed null replacement setsstatus3/releases heroes, dedup100receipts, shared exact reward deltas and quest progression, newer snapshot precedence, per-row observation dates prevent overnight collect from activating stale idle slots; strict Direct/Piggyback payload and pending UI protections pass focused tests.

Completed version0.10.78. Full suite743tests:731pass,0fail,12optional private-data skips; typecheck and production build passed. Collect reducer/UI/strict payload, exact rewards/quest progression/idempotence/snapshot precedence, overnight freshness, and early-departure/version/own-rally MQTT routing regressions pass. All4canonical API docs validated. Docs: @doc/api/expedition-rpc-contract-and-dashboard-automation, @doc/api/world-map-rpc-contracts, @doc/api/mqtt-processing-and-refresh, @doc/api/captured-mqtt-event-catalog. Review: no outstanding material findings; uncertainty and in-flight actions remain pending, no automated retries/purchases; no victory/return inferred from departure packets. System Decision Impact: candidate @decision/20261114-1503-synchronize-expedition-collection-only-from-confirmed-farm-results (added), @decision/20261114-1503-prefer-confirmed-rally-departure-routes-over-planned-start-deadlines (added) — both remain draft with task/doc/test provenance. No commit requested.
<!-- SECTION:NOTES:END -->

