---
id: VHE-YX63BV
title: Compact speedup controls and suggest item quantities
status: done
priority: medium
labels: []
createdAt: '2026-11-15T05:42:30.655Z'
updatedAt: '2026-11-15T05:50:56.389Z'
completedAt: '2026-11-15T05:50:56.389Z'
timeSpent: 460
---
# Compact speedup controls and suggest item quantities

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace default expanded speedup forms with borderless fast-forward icons beside Building/Research progress percentage and Healing timers. Open a stacked dialog only on click, retain mandatory confirmation, and auto-suggest min(stock,max(0,ceil(remaining/itemDuration)-1)) as confirmed by the user on2026-11-15. Reuse @doc/api/speedup-rpc-contract-and-confirmed-use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Building and Research show a borderless fast-forward icon immediately after progress percent; Healing shows it after active timer, with no default form.
- [x] #2 Icon opens a form above its parent dialog; cancel or Escape closes only the speedup layer, and every spend still requires explicit confirmation.
- [x] #3 Selecting a speedup option automatically suggests the agreed just-short-of-completion quantity, capped by owned stock; invalid/zero choices never spend.
- [x] #4 Formula, actual component and real Chrome UI/confirmation regressions, full tests, typecheck/build and docs validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update SpeedupControl to an icon-triggered stacked form; place triggers beside progress/timers and preserve parent dialog on Escape. 2. Implement pure suggested-quantity formula after resolving minus-one meaning, updating on option selection/open while retaining manual quantity and confirmation guards. 3. Adapt component/Chrome tests for default-hidden form, trigger placement, stacked cancellation/Escape, auto count and existing spend lifecycle. 4. Run checks, build patch release and update canonical guidance/task/decision impact.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented compact borderless fast-forward SVG triggers immediately after Building/Research percent and active Hospital timers; default form is not rendered. Click opens stacked form70 and mandatory confirm80; capture-phase Escape stops parent close, Cancel never spends. User confirmed minus-one quantity means ceil(remaining/itemDuration)-1 item, capped by stock and clamped0; auto-fill runs on opening and item selection, manual adjustment remains guarded. Pure formula and actual control tests cover exact/nonexact durations, insufficient stock, zero and option change. Actual Chrome0.10.94 Direct/Piggyback verifies hidden defaults, borderless icon placement for all3 contexts, stacked form and parent-preserving Escape, auto stock3, cancel0spend, one confirmed request for3items, timer−180000ms and stock3→0. Evidence docs/acceptance/speedup-compact-2026-11-15.json (local fixture only). Full836 tests:824 passed,12 optional private-log skips; typecheck/build passed and final template compiled. Review:PASS, no unresolved P1/P2. Spec Decision Compliance:N/A. System Decision Impact: candidate @decision/20261115-1250-keep-speedup-controls-compact-and-suggest-one-item-short-quantities (changed), kept draft. Canonical @doc/api/speedup-rpc-contract-and-confirmed-use.
<!-- SECTION:NOTES:END -->

