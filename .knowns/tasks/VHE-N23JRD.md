---
id: VHE-N23JRD
title: Show gathering resource estimates and progress without internal IDs
status: done
priority: medium
labels: []
createdAt: '2026-11-14T01:27:18.075Z'
updatedAt: '2026-11-14T01:59:06.894Z'
completedAt: '2026-11-14T01:59:06.894Z'
timeSpent: 805
---
# Show gathering resource estimates and progress without internal IDs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Derive collected resource estimates and overall progress from authoritative gathering timers/quantities, share calculations across march tooltips and gathering information cards, and hide technical squad/mine IDs from user-facing gathering UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gathering tooltips/cards show bounded, time-derived resource estimates and overall progress based on server data.
- [x] #2 Travel/return/missing data are handled without invented gathering rates; internal squad/mine IDs are hidden from gathering presentation.
- [x] #3 Relevant regression checks and versioned build pass and changes committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect gathering captures, normalization and UI consumers; establish timer units, phase boundaries and quantity/rate semantics. 2. Add shared guarded estimates/progress and integrate into tooltips/cards while retaining IDs internally for dispatch/recall. 3. Test real-shaped records, stage transitions/missing data and UI, document evidence, version/build and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified that resource type must be visible in each gathering information panel, not just inside tooltips.

Preserved captured interactionWithTarget startedAt/durationMs and mine target/type metadata in normalization, added guarded shared time-progress helper and gathering labels/cards. Numerical estimates remain dependent on a verified squad load/collection rate: capture provides timers but no per-squad target amount. CDN immutable globalMapMine/unit config requests timed out via Node, PowerShell and web tool; user clarification is pending asynchronously. Do not substitute entire mine stock for squad capacity. Other newly requested Log/FAB/Guild work can proceed independently.

User supplied the missing source: getMineSummary returns gathering start time, expected duration and total resources. Use exact elapsed/duration ratio multiplied directly by the returned total; locate and retain this RPC schema rather than relying on unavailable remote config.

Resolved numerical estimate source from captured getMineSummary:mine: startedAt/plannedDurationMs/plannedGatheredResourceAmount (375000 over34829722ms example). Formula clamps elapsed/duration to0..1, multiplies directly and floors quantity. Shared UI shows type, estimate/total/progress on Gathering cards and Dashboard Active Marches, plus Header tooltip; overall Gathering panel uses collected/total weighted progress. Plans retained bounded100by squad for return display; recall freezes at server route.startedAt, no cache resource credit for estimates. Corrected Dashboard tooltip prop from text/position to content/placement. Target/squad IDs retained internally but hidden in gathering cards/targets. Three focused tests pass for captured-shaped amounts, timings, recall freeze, missing data and no ID leakage. Full validation/release pending combined Log/Guild work.

Completed in shared release0.10.75 with @task-VHE-WEDXQP and @task-VHE-6WM927. Final717tests:705pass,0fail,12optional skips; typecheck and production build passed. Formula/phase/recall regression tests use actual-shaped getMineSummary values; existing march/tooltip regressions retained. Header popup initialization refreshes summary once under global settings. Review PASS P1=0/P2=0/P3=0. Docs @doc/api/world-map-rpc-contracts validated. System Decision Impact: none — implements the user's explicit server-timer estimate within established passive cache/UI calculation conventions and does not modify authoritative delivered resource balances.
<!-- SECTION:NOTES:END -->

