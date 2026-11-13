---
id: VHE-406XCM
title: Refresh open game tab when city queue stalls after completion
status: done
priority: medium
labels: []
createdAt: '2026-11-13T15:49:39.104Z'
updatedAt: '2026-11-13T15:56:29.633Z'
completedAt: '2026-11-13T15:56:29.633Z'
timeSpent: 364
---
# Refresh open game tab when city queue stalls after completion

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automatically refresh an existing game tab when Building or Research cannot start the next queued upgrade within60seconds of the previous upgrade ending. Preserve RPC confirmation, queue items and shared dispatch settings; bound reloads and log recovery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both queues refresh an open game tab after60seconds stalled following prior completion, with visible recovery/failure logs.
- [x] #2 Progress, disabled/empty queues and absent game tabs never cause unwanted refresh; concurrent queues cannot repeatedly reload the same game tab; pending items are retained until server confirmation.
- [x] #3 Regression tests, typecheck and production build pass; docs and versioned release are committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add persisted completion-to-next-start watchdog to shared city queue runner. Detect known finish/confirmed completion or transition to idle; reload an existing game tab once after60s, coordinating both queues and retaining pending state for authoritative reconciliation. 2. Cover timeout boundaries, no tab, disabled/empty queues and RPC policy, progress, failure and shared reload suppression. 3. Update reconciliation docs, version/changelog/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persisted stalledRefresh completion/start watchdog with one-shot60second alarms, shared serialized reload lane and dedup marker, existing-tab validation and global RPC policy. Pending requests and targets survive reload; confirmed starts and active occupancy clear recovery. Boundary, concurrent queue, restart, failure, empty/disabled/no-tab/settings and later completion tests passed. Full suite652:640pass,0fail,12optional skips. Typecheck passed.

Final verification:653tests,641pass,0fail,12optional skips; typecheck and rebuilt0.10.60 production artifacts passed. Review fixed late-start-ack timestamp ordering; short upgrade completion still arms a later handoff. Review PASS: P1=0,P2=0,P3=0. System Decision Impact: none — this adds task-scoped bounded city queue recovery within the existing background ownership, acknowledgement and shared RPC settings model; it changes no accepted project-wide policy. Live game/browser validation was not performed.

Completed and committed code, regression tests, reconciliation documentation, changelog and validated0.10.60 artifacts. The pre-existing staged TypeScript LSP log is preserved outside this commit. Final task state is folded into the same task commit.
<!-- SECTION:NOTES:END -->

