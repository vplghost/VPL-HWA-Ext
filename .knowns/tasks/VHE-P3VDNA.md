---
id: VHE-P3VDNA
title: Skip occupied interrupted mines and handle errorCode-only gathering rejection
status: done
priority: high
labels: []
createdAt: '2026-11-14T18:22:22.827Z'
updatedAt: '2026-11-16T03:39:33.176Z'
completedAt: '2026-11-14T18:27:30.186Z'
timeSpent: 236
spec: specs/smart-auto-gathering
---
# Skip occupied interrupted mines and handle errorCode-only gathering rejection

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Log hwa-game-record-202611150120.json0.10.85 shows getMineById returning a foreign gatherer, followed by automatic attackMine battleType:pve to the same mine and response{errorCode:BattleTypeMismatch}. Fix occupancy validation and errorCode-only rejection so gathering switches safely to a free mine instead of timing out or attempting PvP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Replay captured getMineById occupancy and errorCode-only BattleTypeMismatch; neither is treated as a successful free-mine/dispatch response.
- [x] #2 Drop occupied resume/nearest candidates and exclude rejected mines from subsequent automatic searches; never convert automatic gathering to PvP.
- [x] #3 Handle explicit mutation rejection immediately; allow only confirmed BattleTypeMismatch target recovery, while unknown mutation failures stop with the actual server error.
- [x] #4 Test occupied-mine recovery followed by successful1→3 dispatch, error-code variants, and real Chrome background/bridge/MAIN against hostile/racing fixture responses; pass tests/build/docs validation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract sanitized timeline26/33 responses and reproduce occupancy acceptance/errorCode timeout. 2. Add shared error detection, vacant-probe gating and bounded target exclusions across resume/nearest/normal Smart planning. 3. Add capture-based and Chrome integration regressions using occupied and race-rejected targets before free dispatch. 4. Update contracts/docs, run verification and complete with explicit live limits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source log0.10.85 proves a sent request, not a lost bridge: timeline26 getMineById reports occupied mine with5708965 resources; timeline33 attackMine:pve to same mine returns HTTP200 response{errorCode:BattleTypeMismatch}. Root fixes: probes reject any gathering object; rpcFailure detects errorCode-only failures; confirmed BattleTypeMismatch skips the target across interrupted/resume/nearest/cached Smart search (60s bounded50 exclusions) and continues to another free mine. Unknown mutation errors stop immediately with their code; unconfirmed mutations never retry or escalate to PvP. Capture-based regressions cover occupied resume/nearest, free alternate selection and BattleTypeMismatch/InsufficientUnits. Actual Chrome1570.10.86 Direct occupied-race scenario skips the occupied interrupted mine, handles one simulated errorCode-only race rejection, sends two successful free squads and reaches3/3 with pendingnull. Distinct attacked targets allpve; rejected target neverresent. Evidence docs/acceptance/gather-occupied-2026-11-15.json; fixture backend only, no live outcome claim. Full suite796 tests:784 passed,12 optional private-log skips; typecheck/build/diff checks PASS. Canonical contracts: @doc/api/world-map-rpc-contracts; source and verification: @doc/specs/smart-auto-gathering; extraction @memory/8lf35x. Review:PASS, no P1/P2 remaining. Spec Decision Compliance:D1=pass,D2=pass,D3=pass,D4=pass,D5=pass. System Decision Impact:none — restores existing vacant-mine/no-auto-PvP and server-confirmed lifecycle behavior; short target exclusion is an implementation backoff, not a new product policy.

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass
<!-- SECTION:NOTES:END -->

