---
id: VHE-03VDQ4
title: Add Dashboard Expeditions progress, timers and automatic hero selection
status: done
priority: medium
labels: []
createdAt: '2026-11-14T07:38:46.549Z'
updatedAt: '2026-11-14T07:49:43.805Z'
completedAt: '2026-11-14T07:49:43.805Z'
timeSpent: 646
---
# Add Dashboard Expeditions progress, timers and automatic hero selection

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze hwa-game-record-202611141432_start_expedition.json and verified config/snapshots. Add Activities card, timer dialog and user-triggered automatic start using available owned heroes. Display VIP/subscription-locked expeditions and block unsupported starts. Afterwards investigate Tower incorrectly remaining Pending after final-floor completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Activities includes Expeditions progress and opens a timer dialog showing every expedition including VIP/subscription locks.
- [x] #2 Auto start assigns owned available heroes meeting recorded power without overlap; skips inaccessible/completed/running expeditions and confirms server outcomes before continuing.
- [x] #3 Tower final completion correctly displays Done with regression coverage; tests/typecheck/build and documentation validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify expeditionGet rows/slot config, exact captured start RPC, hero power/occupancy and VIP/subscription locks. 2. Normalize snapshots and confirmed starts/failures into account-scoped expedition cache; narrowly allow refresh/start through shared RPC settings. 3. Add Activities progress card and dialog with timers/visible locks and opt-in auto hero selection/start, waiting for each server outcome before continuing. 4. Add capture-shaped reducer/planner/UI regressions; then diagnose/fix Tower final completion Pending with regression coverage. 5. Update canonical contracts and draft durable guidance, version/changelog/build, run typecheck/tests and validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research/implementation: capture SHA256527689ed2808fd77701d33382b94a15ea332a9d3388629578a2c619812202a95 confirms artifact_expeditionStart{expeditionId,heroes}; id7 uses heroes[] while slot8 is video (ID differs from slot). expeditionGet captures verify statuses0locked/1idle/2running/3completed and absolute Unix-second endTime; server power/duration remain authoritative. expedition_slot.json1523bytes MD517e4d5b73c4e58f35387785fca03165a and level_vip.json822bytes MD5746c8d664f383779db14137e5573296e match asset-index-captured manifest. Implemented account-scoped expeditionStatus, bounded exact mutation/read allowlisting, partial action receipts, lifecycle-ticked Activities progress and dialog; Start available selects non-overlapping owned teams meeting server power and waits per confirmed outcome. Expired timers retain occupied heroes until server releases them. VIP8/subscription slots stay visible and locked when server says unavailable. Tower root cause verified from20261110capture: getAll final floor23 boss room_completed has no top-level state, resetting previous cleared status. Fixed reducer and legacy cache view completion inference without treating floor number alone as completion.

Completed release0.10.77: Activities card/launch and complete8-slot timer dialog, current-snapshot auto assignment/start with per-result sequential confirmation, strict Direct/Piggyback payload validation, account resets, no duplicate dispatch on queued/timeout, stop-after-current, and visible VIP/subscription exclusions. Post-start shared-policy expedition/quest refreshes added; Dashboard refresh includes full Tower snapshot and expeditions/heroes. Tower snapshot completion and existing-cache recovery verified against final-floor boss room_completed, retaining day/new-run negatives. Tests734total:722pass,0fail,12optional private-data skips; focused57pass; typecheck/build passed; documentation and task references validated. Review found/fixed same-batch idle-snapshot overwrite of an accepted start and retained the legacy raw expeditionGet consumer contract. No remaining material review findings. Canonical contract @doc/api/expedition-rpc-contract-and-dashboard-automation, Dashboard/Tower guidance @doc/architecture/dashboard-live-status-model. System Decision Impact: candidate @decision/20261114-1449-start-expeditions-only-from-scoped-eligible-snapshots-and-confirmed-hero-assignments (added) — records expedition eligibility/hero-reservation/confirmation behavior and remains draft. Tower fix restores existing final-boss completion semantics. No commit requested.
<!-- SECTION:NOTES:END -->

