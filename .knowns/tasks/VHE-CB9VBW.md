---
id: VHE-CB9VBW
title: Withdraw threatened gatherers when hospital is full
status: done
priority: medium
labels:
  - from-spec
  - gathering
  - spec:smart-auto-gathering
createdAt: '2026-11-14T11:51:46.577Z'
updatedAt: '2026-11-14T12:44:33.797Z'
completedAt: '2026-11-14T12:43:20.836Z'
timeSpent: 1070
spec: specs/smart-auto-gathering
fulfills:
  - AC-6
order: 60
---
# Withdraw threatened gatherers when hospital is full

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement timed withdrawal for own gathering mines under hostile attack using verified getIncomingMarches RPC and marchAttackDetected/Ended MQTT from the two Nov14 supplied captures. Compare current defending troop count with summed Infirmary capacity minus injured troops; send one deadline-bound recall in final10s and resume safe gathering after confirmed return.

Blocked by @task-VHE-MA5SJK{blocked-by}
Evidence: @doc/api/mine-incoming-attack-and-timed-withdrawal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A verified hostile attack must target the player's current mine and squad.
- [x] #2 Only insufficient hospital space and 0<impactETA<=10s trigger a single recall.
- [x] #3 Missing ETA/ownership/capacity leaves automatic defense inactive and lists the evidence the user must provide.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract and hash both supplied captures; document getIncomingMarches RPC, marchAttackDetected/Ended MQTT, impact timing and hospital inputs. 2. Retain account-scoped incoming threat snapshots with version/time guards and terminal invalidation; package verified Infirmary capacity metadata. 3. Add defense planner gated on own gathering mine/squad, current hospital and troops; schedule at impact-10s with deadline-checked recall and confirmed return/resume. 4. Test replayed full/late attacks, exact timing, sufficient/unknown hospital, duplicate/cancel/stale/account/piggyback cases. 5. Review, update docs/spec/task, validate, typecheck/test/build release.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked on E6 only: user explicitly says they will provide incoming-attack tracking later. Existing MQTT routeCreated gives routeId/from/to but no hostile owner, targeted owned mine/squad or impactAt, so no safe trigger for final10s exists. User clarified hospital free capacity = sum current Infirmary capacities minus wounded count; keep unknown inputs explicit. No defense RPC/timer stub shipped. Unchecked ACs require capture from before attack, route/ETA updates/cancel, impact and corresponding own mine/squad; cross-check hospital UI capacity/wounded when capture arrives. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass. System Decision Impact: none — missing evidence tracked, no new runtime guidance.

Missing E6 is resolved by supplied late-load/full-attack captures (SHA256 and contracts documented). Implemented incoming route cache with account, snapshot, version and terminal/replay guards; cumulative hash-verified Infirmary metadata; own-squad capacity check; impact−10s bridge/alarm wakes; per-attack RPC groups with impact expiry; independent confirmations for overlapping attacks; safe vacancy-gated defensive resume. Actual captured capacity23100 minus wounded11188 leaves11912, so captured squad4194 is correctly retained; simulated crowded hospital proves withdrawal. Review fixes: no storage-triggered timer loop, no unknown/future/stale vacancy assumption, stale mine completion cannot cancel newer attack. Spec Decision Compliance remains D1=pass, D2=pass, D3=pass, D4=pass, D5=pass; System Decision Impact remains none because this implements locked SG-6 using established RPC/lifecycle patterns.

Final review PASS: incoming hydration/terminal handling, own-squad targeting, fresh hospital calculation, exact final10s/deadline, simultaneous attack confirmations, cancellation/account group cleanup and guarded mine resumption all wired. Verified774 tests total:762 passed,12 optional skipped; typecheck and validated0.10.81 WXT build passed. Minimal captured fixture is checked in; positive recall tests deliberately simulate insufficient hospital because the real captured hospital has enough free space. Direct and Piggyback behavior documented without a timing guarantee for absent natural RPC traffic. No live in-game validation.

Final follow-up verification after account/Smart-disable cleanup tests:775 total,763 passed,12 optional skipped. Added regression proving queued per-attack defense groups are canceled when switching account or disabling Smart while basic Auto-Gather stays enabled. Rebuilt and validated0.10.81 artifact; no additional unverified behavior remains within task scope.
<!-- SECTION:NOTES:END -->

