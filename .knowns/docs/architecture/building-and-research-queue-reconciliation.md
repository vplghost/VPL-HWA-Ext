---
id: doc-54006de1999a5f5836fbb35dc67d4d62
title: Building and Research Queue Reconciliation
description: Background ownership, queue acknowledgement, idle wake-up, correct wait timing, bounded RPC verification and visible failure logging.
createdAt: '2026-11-13T08:50:14.091Z'
updatedAt: '2026-11-13T15:56:14.276Z'
tags:
  - building
  - research
  - queues
  - rpc
---

## Ownership and Add Queue

Implemented by @task-VHE-1YQ8A1.

BuildingModal and ResearchModal use `useCityQueueActions` to send add/remove/move/clear/enabled intent to the background. They do not persist whole queue snapshots from local Vue state. Background serializes mutations and scheduling per queue type, validates IDs/levels/durations, rejects duplicate target levels, assigns a queue item identity, and saves before attempting dispatch. Replies and storage snapshots use monotonically increasing `updatedAt` revisions so an older response cannot undo newer UI state.

Add Queue writes an `enqueue` log. Logic, storage, unavailable-runtime and dispatch errors are visible in dialog alerts and Execution Logs. A failed background reply already logged there is not logged twice by the UI. When background communication fails, UI attempts to save a `ui_error` log and also reports to console.

## Timing

The old `getQueueEnd` multiplied a legacy `duration` below 100000 by 1000 even when its start was milliseconds. A 30000 ms duration became 30000000 ms; after 25 minutes this falsely implied another 7h55m of occupancy.

Queue helpers now keep millisecond starts/durations in milliseconds, prefer explicit `durationMs`, and convert legacy second-based starts with their second-based duration. Explicit finish/end timestamps remain supported.

## Scheduling and confirmation

`advanceCityQueue` runs Building and Research through independent serialized execution lanes shared with queue edits. Passive API reduction calls it with the recorded RPC result; existing queue ticks, startup and the one-minute watchdog also evaluate it.

- A fresh authoritative `getSummary` (at most 60 seconds old) controls occupancy. An estimated start mutation, missing snapshot or stale observation requests the feature's summary through shared RPC settings.
- Verification is throttled to at most once per 15 seconds per queue. Confirmed waits are rechecked within 60 seconds, even when their estimated finish is many hours away.
- A newly received idle summary immediately re-evaluates queued work. Older `wakeAt` values do not block it.
- Persist `pendingRequest` before sending mutations. Keep a queued target until its start is confirmed by correlated RPC results or a newer authoritative matching summary.
- Transport acknowledgement logs only dispatch. Only confirmed server results produce successful start/complete logs. Repeated ticks cannot redispatch an outstanding request.
- Missing acknowledgement expires after 120 seconds. Reconcile via a fresh summary before retrying. Failed commands retain work, log the server reason and use a 30-second retry cooldown.
- Confirmed completion/idle state clears stale waits and allows the next item to proceed. Older status entries and rejected start/complete responses cannot fabricate new occupancy or overwrite a newer summary.
- Shared RPC enable/dispatch policies remain in force. Disabled RPC or a missing game tab keeps saved work and records a blocked reason.

## Verification

`tests/background.test.mjs` covers saved Add Queue, stale summary verification, idle chaining despite an old future wake, confirmation, duplicate ticks/results, rejection and acknowledgement timeout recovery in both queue domains. `tests/city-queue-ui.test.mjs` exercises the actual dialog handlers and shared action composable, stale response protection, visible/logged errors and the duration regression. Existing queue planner tests remain intact.

Live Chrome/game validation is separate from automated RPC replay and Vue setup tests.


## Invalid saved state

Non-array saved item collections are recovered to arrays with a warning log. Before dispatch, invalid target IDs or levels from a planner produce an error log and retry cooldown rather than an invalid RPC. Rejected summaries and mutations do not fabricate idle/active state in the reducer.


## Stalled handoff game refresh (2026-11-13)

Implemented by @task-VHE-406XCM in `runCityQueue`, `scheduleCityQueueRecovery`, and its local `recoverStalledQueue`.

- When queued targets remain, retain the known previous upgrade end from the server queue row or persisted `waitUntil`. A fresh idle summary can establish an early completion at observation time. Missing/stale occupancy cannot imply early completion of an upgrade whose known end is still in the future.
- Persist `stalledRefresh.completedAt` across summaries and service-worker restarts. If no next start is confirmed after60seconds, reload the existing game tab once. One-shot `hwa-building-queue-recovery` / `hwa-research-queue-recovery` alarms check the deadline, alongside the existing queue ticks and minute watchdog. Chrome may deliver alarms late; recovery never runs before the deadline.
- This check also runs while a start mutation is awaiting its normal120second acknowledgement timeout, after rejection, or during stale-summary verification. Reload does not clear `pendingRequest`, consume a target or redispatch an uncertain mutation. Existing authoritative reconciliation continues after game reload.
- A confirmed start records `lastConfirmedStartAt` and clears the stalled marker. Observed active occupancy also clears it, and a later completed upgrade can arm a new recovery. Already-completed targets, empty/disabled queues, disabled global RPC/monitor settings and absent game tabs do not trigger reload. No tab/window is created.
- Reload decisions share a serialized lane across both queue types. `cityQueueGameRefresh` stores the tab and attempt time before reload: a shared attempt after both completions satisfies both watchdogs, with a minimum60second gap for distinct transitions. Each queue's persisted `attemptedAt` prevents repeated reloads for the same stall, including after worker restart or reload failure.
- Execution Logs use `refresh` for the attempt/shared recovery and `error` for reload failure. Queue items remain saved when recovery fails; repeated ticks do not cause a reload loop.

`tests/background.test.mjs` verifies the59,999/60,000ms boundary, pending acknowledgements, no-tab and policy exclusions, start/occupancy progress, completed targets, shared simultaneous stalls, persisted attempts across restart, reload failures, stale future occupancy and subsequent completion episodes. Real game/browser timing remains a separate live validation.


A delayed successful start acknowledgement stores the request issue time as `lastConfirmedStartAt`, rather than receipt time: a short upgrade may have finished before its acknowledgement arrived. Its later end must still arm recovery for the following target. A regression test covers this ordering.
