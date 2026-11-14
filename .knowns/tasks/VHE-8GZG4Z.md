---
id: VHE-8GZG4Z
title: Add free Wheel cooldown tooltip and daily reset
status: done
priority: medium
labels: []
createdAt: '2026-11-14T06:52:22.471Z'
updatedAt: '2026-11-14T07:03:13.563Z'
completedAt: '2026-11-14T07:03:13.563Z'
timeSpent: 629
---
# Add free Wheel cooldown tooltip and daily reset

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze wheel_timer capture, disable free alchemy button until available, show ticking tooltip timer and default to fresh free availability on a new game day.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Observed refillable53 cooldown drives a live tooltip countdown and disabled free-spin button with no RPC while waiting.
- [x] #2 Daily game reset restores default free availability even when prior-day cache indicates exhausted quota; account changes and newer snapshots are respected.
- [x] #3 Capture-based regressions, typecheck and production build pass; contract/provenance documented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify refillable53 failure timestamp, existing daily-reset/timezone helpers and quota snapshots. 2. Persist observed cooldown from matching top-level errors/success, compute availability from newest quota/receipt and game-day reset, tick tooltip and guard button/action. 3. Add capture-shaped reducer and UI timer/reset tests, update canonical documentation, run typecheck/tests/build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified capture SHA256 a686d9295e81cd81eda2c634e14ac3561ef0704f1575017daef976878e7307d9: top-level NotEnough error for exact free RPC/refillable53, lastRefill1794613856, now1794638961; verified28800-second config leaves3695seconds. Fixed missing top-level error extraction; added persisted cooldown/lastRefill timing, newer quota precedence, shared observedToday reset boundary with local-midnight fallback, account cleanup, lifecycle tick tooltip and both disabled/dispatch guards. Canonical contract @doc/architecture/rpc-cache-pipeline updated. Regression checks:10focused tests passed; full723tests=711pass/0fail/12optional skips; typecheck/build passed. Version0.10.76 and changelog/dist prepared. No commit requested.

System Decision Impact: candidate @decision/20261114-1403-end-free-alchemy-cooldown-at-refill-or-daily-game-reset (added) — records the verified8-hour refill and explicit daily-reset availability behavior; remains draft. Manual diff review and git diff --check passed; focused diagnostics report no errors. Source task and canonical doc validation pass.
<!-- SECTION:NOTES:END -->

