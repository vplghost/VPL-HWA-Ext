---
id: VHE-HHPR1K
title: Add confirmed speedup use and synchronize queue timers
status: done
priority: high
labels: []
createdAt: '2026-11-15T03:43:21.195Z'
updatedAt: '2026-11-15T04:00:35.575Z'
completedAt: '2026-11-15T04:00:35.575Z'
timeSpent: 1025
---
# Add confirmed speedup use and synchronize queue timers

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze hwa-game-record-202611151039_user_speedup.json for healing/building/research resource speedups, reduce timers and inventory exactly once from confirmed responses, and expose manual speedup controls with an explicit user confirmation before every spend. Keep shared RPC/account/queue safeguards; record unobserved training/overrun contracts as future capture work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Capture contracts and hash-verified item durations are documented and packaged; native successful speedups update matching timers and known inventory once, preserving stale/newer snapshots and account isolation.
- [x] #2 Building, Research and Hospital expose item/quantity preview and a separate confirmation with target, spend and duration; cancellation or stale target/inventory/account never spends.
- [x] #3 Pending spends are serialized and persist through popup close/restart; queued acknowledgement or timeout does not trigger duplicate/retry or optimistic timer changes.
- [x] #4 Only observed dedicated-item payloads are sent with exact feature/args and no paid/refund guesses; unknown Training and overrun behavior are tracked.
- [x] #5 Replay, reducer, real component confirmation, background and Direct/Piggyback regressions plus full tests/typecheck/build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract sanitized speedup contracts and verify cached config hashes/durations, including queue baselines. 2. Package duration data and shared validation/target/planning helpers. 3. Add confirmed speedup reduction, bounded receipts and post-action authoritative reads; serialize persisted manual spend in background. 4. Add reusable select/preview/confirm control to Building/Research/Hospital, revalidate before dispatch and hold uncertain spends. 5. Test exact native captures, stale/replay/account/inventory guards, confirmation cancellation and bridge modes; run full checks and build. 6. Document contracts, record missing capture tasks and durable decision candidate, then validate and complete.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Analyzed supplied log SHA2567b1bf945ec5e8d4ad2c9e747b9853d9e3b6405f14360895709a3825877222826: healing600000ms/2×5m, construction60000ms/1×1m, research180000ms/3×1m; successful responses{}. Hash-verified dedicated item duration tables packaged. Implemented passive idempotent timer/known-stock reduction with same-batch/newer snapshot guards, account epoch and receipt correlation; unknown acknowledgements cannot release pending. Mandatory review/confirm control in Building/Research/Hospital with stale quote invalidation and explicit refresh. Background serializes persisted token across popups/restarts and revalidates immediately before sending; Direct/Piggyback retain token and never retry uncertain mutations. Training/universal/mixed/overrun capture remains @task-VHE-4MAJ4H. Verification:834 tests total,822 passed,12 optional private-log skips; typecheck/build0.10.93 pass. Actual Chrome Direct/Piggyback local-fixture tests both prove cancel0spend, confirm1request, stock3→2, duration−60000ms, pendingnull and no runtime exceptions. Evidence docs/acceptance/speedup-2026-11-15.json; no live completion claim. Review:PASS, no unresolved P1/P2 after rechecking uncertainty guards. Spec Decision Compliance:N/A, standalone feature. System Decision Impact: candidate @decision/20261115-1100-require-confirmation-and-persisted-ownership-for-manual-speedups (added), kept draft. Canonical @doc/api/speedup-rpc-contract-and-confirmed-use.
<!-- SECTION:NOTES:END -->

