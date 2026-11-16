---
id: VHE-V3KHXA
title: Recover smart gathering when a mine no longer exists
status: done
priority: high
labels: []
createdAt: '2026-11-15T02:56:39.610Z'
updatedAt: '2026-11-16T03:39:33.419Z'
completedAt: '2026-11-15T02:59:28.912Z'
timeSpent: 141
spec: specs/smart-auto-gathering
---
# Recover smart gathering when a mine no longer exists

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports getMineById rejected by game: MineNotFound stopping Smart gathering. A confirmed missing target must be skipped without restarting, preserving mutation confirmation and shared RPC gates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MineNotFound from getMineById probes or confirmed attackMine rejection removes the target, clears pending and continues safely without fatal error.
- [x] #2 Interrupted and nearest candidates plus cached searches exclude missing targets; exhausted nearest scans retry with bounded backoff instead of requiring restart.
- [x] #3 Previously persisted exact MineNotFound stop state recovers on the next tick; unrelated and unconfirmed mutation failures retain existing stop behavior.
- [x] #4 Focused and background integration regressions, full tests, typecheck, build and docs validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce MineNotFound for resume/nearest probes using current sync error handling. 2. Route explicit missing-target rejection through existing bounded skipMine; recover only the known persisted legacy MineNotFound error and add exhausted nearest scan backoff. 3. Add unit and actual background regressions covering continuation, fresh scans, legacy errors and unknown failures. 4. Verify checks, build patch release and update canonical contracts/task with D1-D5 compliance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: smart.sync routed every getMineById failure into persistent state.error, and nearestPlan required restart after candidate exhaustion. Reproduced 3 failing regressions before fixing. Exact MineNotFound on mine probe or confirmed attack rejection now invokes skipMine; candidates are excluded60s/bounded50 entries, legacy exact missing-mine stop clears only with no pending request, and nearest scans retry after60s. Actual background test proves another target is attacked with battleType:pve and confirmation waits for game response plus fresh rosters. Review: PASS, no unresolved P1/P2. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — restores existing unavailable-target recovery and bounded read/search backoff without changing product or mutation policy. Canonical: @doc/api/world-map-rpc-contracts.

Final verification0.10.90: 815 tests total,803 passed,12 optional private-log skips; focused smart/background/reload28/28 passed; typecheck and production build passed; git diff --check passed. No new live game capture was supplied, so regression responses are synthetic and no live-account completion is claimed.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

