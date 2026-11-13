---
id: VHE-1YQ8A1
title: Reconcile idle building research queues and correct wait timing
status: done
priority: medium
labels: []
createdAt: '2026-11-13T08:39:25.026Z'
updatedAt: '2026-11-13T08:51:59.994Z'
completedAt: '2026-11-13T08:51:59.994Z'
timeSpent: 705
---
# Reconcile idle building research queues and correct wait timing

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix queue duration unit inflation and transport-only completion claims. Serialize per-queue execution, verify stale/uncertain occupancy with bounded summary RPCs, and advance queued work immediately from fresh idle state while retaining items until confirmed starts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Queue wait times do not inflate millisecond durations; stale/uncertain occupancy is verified through bounded summary RPCs.
- [x] #2 Fresh idle Building/Research summaries immediately re-evaluate queued work regardless of an older wakeAt.
- [x] #3 Start/complete logged as successful only after confirmed response; duplicates/concurrent ticks do not repeat commands or lose items.
- [x] #4 Building Add Queue persists reliably and reports logical/storage/dispatch failures in logs/UI; no silent reversion.
- [x] #5 Behavior regressions, full tests, typecheck and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce queue duration inflation, duplicate completion dispatch and Building Add Queue reverting without logs.
2. Correct observed time-unit handling and normalized queue end times.
3. Serialize Building/Research execution, reconcile actual server results, retain queued items until confirmed start, and verify stale occupancy using bounded summary RPCs; fresh idle summaries immediately advance.
4. Route UI queue mutations safely through background ownership or prevent stale state overwrites; report rejected/logic/dispatch failures to queue logs and UI.
5. Test add→persist→verify→start→ack→idle chaining, stale wait recovery, duplicates/concurrency/errors and shared RPC policy. Run tests/typecheck/build and capture contract.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed both timing and ownership/confirmation bugs. Old getQueueEnd guessed seconds from small duration values, inflating 30000ms to 30000000ms; timestamp-unit handling now preserves millis and retains second-based legacy starts. Old background removed items/logged successful complete on transport acknowledgement, so Add Queue appeared then disappeared without a real start. Queue edits now use background commands; per-type lanes serialize edits/ticks/API reactions, pendingRequest retains items until actual response or matching authoritative summary, fresh idle bypasses obsolete wakeAt, stale/estimated occupancy uses throttled getSummary checks. Waits rechecked within60s; missing ack verifies before retry; server/transport/planner/storage/UI errors logged and exposed. Revision-checked UI snapshots prevent old replies reverting new state. Invalid stored item shapes recovered with warning. Shared RPC policy retained. Rejected/older city status records do not fabricate occupancy.
Validation: 602 tests total, 590 pass, 12 optional-data skips, 0 failures; typecheck pass; final build/artifact validation pass; live game not exercised. Regression tests cover add persistence, idle chaining, millis wait, concurrent/duplicate events, rejected starts, timeout reconciliation, actual dialog handlers and visible error logs. See @doc/architecture/building-and-research-queue-reconciliation.
System Decision Impact: candidate @decision/20261113-1551-reconcile-city-queues-from-confirmed-server-state (added) — serialized background ownership and confirmed-state scheduling for city queues.
<!-- SECTION:NOTES:END -->

