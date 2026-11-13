---
id: VHE-B1K62K
title: Stop bridge queue timers after extension context invalidation
status: done
priority: medium
labels: []
createdAt: '2026-11-13T16:13:31.624Z'
updatedAt: '2026-11-13T16:17:32.029Z'
completedAt: '2026-11-13T16:17:32.029Z'
timeSpent: 191
---
# Stop bridge queue timers after extension context invalidation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix uncaught synchronous Extension context invalidated from building timer at bridge.js395. Safely dispatch all bridge automation wake timers, stop and prevent rescheduling after invalidation, retain normal wake-up behavior and cover synchronous throws and asynchronous rejection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Queue wake callbacks do not throw when Chrome invalidates the context synchronously or asynchronously.
- [x] #2 Invalidated bridge cancels automation timers and cannot reschedule them; normal queue/energy and ordinary failure behavior is preserved.
- [x] #3 Regression tests, typecheck and versioned build pass and changes are committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the exact timer synchronous throw and inspect bridge lifecycle. 2. Add shared guarded automation dispatch with invalidation teardown for all queue/energy wake timers and suppress stale callback rescheduling. 3. Run timer regressions and full checks, capture root cause, update version/changelog/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced uncaught invalidation from queue callback and energy settings callback before fix. Added guarded shared messaging, tracked/gated timers and terminal invalidation state. Catch sync errors and async rejection during message sends and queue storage reads; cancel all wake timers and ignore stale listener/late callback work. Existing manual helper reconnect notice retained. Focused bridge regressions passed.

Validation:661tests,649passed,0failed,12optional skips; typecheck and0.10.62 production build passed. All six queue timers tested for both synchronous invalidation and async rejection; energy heartbeat, storage-read failure, late in-flight read and ordinary receiver failure covered. Review PASS:P1=0,P2=0,P3=0 after indentation cleanup. System Decision Impact: none — the change repairs the existing bridge lifecycle and error boundary without changing RPC policy, automation ownership or queue semantics.

Committed verified bridge lifecycle fix, regression tests, root-cause memory, changelog and0.10.62 production artifacts. Packaged bridge matches source and release versions agree. Final task state is included in the same commit; pre-existing staged empty TypeScript LSP log remains untouched.
<!-- SECTION:NOTES:END -->

