---
id: VHE-CMZHNT
title: Fix healed troop completion and unlock next healing
status: done
priority: medium
labels: []
createdAt: '2026-11-13T06:46:36.772Z'
updatedAt: '2026-11-13T06:51:28.114Z'
completedAt: '2026-11-13T06:51:28.114Z'
timeSpent: 257
---
# Fix healed troop completion and unlock next healing

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Captured sync_healed trace proves completeHealing:unit with completeDate must collect finished healing before next startHealing. Vue Sync Healed only requests snapshots; reducer/background lack completion handling. Align five-unit healing duration with observed 40000 ms and show dispatch failures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sync Healed sends verified completeHealing:unit with completeDate and authoritative snapshots; rejected dispatch never clears local cache.
- [x] #2 Confirmed completion releases elapsed healing; duplicate/stale completion cannot erase a newer healing run.
- [x] #3 Next Heal All works after authoritative completion and five injured units request observed 40000 ms duration.
- [x] #4 Failure/queued status visible; shared RPC settings preserved; regression tests, typecheck/build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce against provided completeHealing/startHealing trace and add failing behavior tests for Vue Sync Healed and authoritative reducer.
2. Dispatch completeHealing:unit with completeDate before snapshot reads, keep shared RPC policy, report rejected/queued results and prevent concurrent/busy healing commands.
3. Apply confirmed completion in reducer without fabricating available troops; refresh authoritative unit/healing snapshots through existing background follow-up; protect newer healing from stale completion.
4. Align small-batch duration to observed 8000 ms per unit, verify complete→fresh snapshot→next startHealing lifecycle and rejection/duplicate cases.
5. Run targeted/full tests, typecheck/build, validate task and document captured contract.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: useTroopTraining.syncHealed omitted completeHealing entirely, sending only getUnitSummary/getHealing; no completion reducer or follow-up existed. Reproduced in failing regression tests before fix. Added completeHealing:unit with completeDate, command status/errors and guards against starting over an active/uncollected run; five-unit duration now matches captured 40000ms instead of the old floor. Confirmed completion reducer clears only elapsed runs and subtracts healed injuries; available counts remain authoritative snapshot-owned. Background follow-up respects direct/piggyback/mqtt-piggyback and deduplicates. Replayed the original private trace successfully; tests use sanitized fields only. Validation: 588 total tests, 576 pass, 12 optional-data skips; typecheck/build/artifact validation and diff check pass. Live game click not exercised. Learned @memory/d18z5x; contract documented in @doc/api/world-map-rpc-contracts.
System Decision Impact: candidate @decision/20261113-1351-collect-elapsed-hospital-healing-before-starting-next-run (added) — observed hospital completion lifecycle and freshness constraints.
<!-- SECTION:NOTES:END -->

