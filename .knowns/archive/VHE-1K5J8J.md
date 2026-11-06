---
id: VHE-1K5J8J
title: Add troop optimization and sequential raid queue
status: done
priority: high
labels: []
createdAt: '2026-11-06T08:47:50.287Z'
updatedAt: '2026-11-06T10:31:31.130Z'
completedAt: '2026-11-06T09:15:14.892Z'
timeSpent: 1470
archivedAt: '2026-11-06T10:31:31.130Z'
---
# Add troop optimization and sequential raid queue

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Persist rally lineup and searched boss level, optimize troops by lineup capacity/available tiers/type balance, remove defeated bosses, add sequential background raid queue with loss stop, verified game wait options, and ten-second minimum-members cancellation under shared RPC settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Last rally lineup and last searched boss level persist across popup sessions.
- [x] #2 Troop allocation recalculates from selected lineup, game capacity rules and available troops, prioritizes high tiers and balances types without exceeding inventory/capacity.
- [x] #3 Won boss IDs are removed from search candidates; background queue runs requested raid count sequentially only after confirmed return and stops on loss.
- [x] #4 Rally waits use verified game options; minimum-member threshold triggers a single cancellation ten seconds before departure.
- [x] #5 All RPC work inherits shared settings, state survives popup closure, and regression/build/doc validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify game wait options, unit tiers, capacity data and rally member/return/result shapes from captures/config.
2. Implement persistent form preferences and deterministic capacity/inventory-bounded balanced high-tier troop allocation.
3. Enrich rally tracking with target identity, member counts and explicit return completion; prune won targets.
4. Add a background-owned sequential raid state machine, explicit stop-on-loss, request correlation, state persistence and watchdogs under global RPC settings.
5. Schedule a ten-second membership check with single deadline-bounded cancel; expose queue controls/progress and member threshold in the form.
6. Add focused allocation/state/replay/deadline regressions and update API/architecture docs with verified assumptions and limitations.
7. Run full tests, build and Knowns validation; commit reviewed changes per the existing requested workflow.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persistent rally preferences, verified 60/300/900/1800-second waits, inventory-bounded high-tier balanced allocator, explicit per-hero/base capacity inputs with five user-provided samples, background serialized queue, correlated result/return transitions, one-shot ten-second cancel with queue deadlines, and won-boss tombstones. Formula remains unverified: do not extrapolate capacity from level/star/power. Focused existing tests 31/31 pass after loading new modules in VM harness. Adding state-machine/expiry/DOM regression coverage.

Review: corrected last-search persistence when other fields are edited before the first search; late result handling no longer resurrects an army with confirmed return; tracked targets survive march deletion. Added UI, pure queue, background all-mode, bridge timer/deadline, interceptor expiry/group, and cache tombstone regressions. npm run check: 267 passed, 10 optional-private-trace skips, 0 failures; build 0.9.74. Docs validation: 0 errors/warnings. Capacity limitation is explicit in form/docs: user-observed values plus configurable additional base; no inferred capacity formula. Live game timing/cancel acknowledgement remains untested. System Decision Impact: candidate @decision/20261106-1612-raid-queues-require-confirmed-return-and-verified-capacity (added) — persisted intent, confirmed returns and observed capacity under shared RPC policy; draft only, not accepted. No linked spec or locked D-IDs apply.

Final review complete from quality/architecture/security/completeness perspectives; no unresolved P1/P2 findings. Verified full npm run check (267 pass, 10 optional trace skips, 0 fail) and generated dist 0.9.74. Exact unknown capacity derivation and live browser cancellation timing are documented limitations, not inferred behavior. User additionally authorized separate commit for extension/assets/heroes/78.png and generated dist counterpart.

Backlog disposition 2026-11-06 (@task-VHE-MRH4NM): Explicit hero/base inputs and missing-capacity blocking in the original notes are superseded by @task-VHE-NFV32J Settings defaults and observed-load inference. Queue identity/return/loss rules remain active; lifecycle identity gap is fixed under @task-VHE-MACK1D.
<!-- SECTION:NOTES:END -->

