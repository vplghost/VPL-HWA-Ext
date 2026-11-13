---
id: VHE-BPQPT6
title: Recover stale raid targets and auto raid on natural energy threshold
status: done
priority: medium
labels: []
createdAt: '2026-11-13T11:06:40.665Z'
updatedAt: '2026-11-13T11:16:24.666Z'
completedAt: '2026-11-13T11:16:24.666Z'
timeSpent: 560
---
# Recover stale raid targets and auto raid on natural energy threshold

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raid dialog should automatically search when cached boss information is stale or server rejects a missing target. Add account-bound opt-in natural World Energy threshold automation using dialog options, without firing on game startup, already-at/above threshold or manual energy gains.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Missing/stale boss selection starts a search and continues raid; target-not-found errors trigger a fresh search without decrementing remaining raids or retrying rejected IDs.
- [x] #2 Opt-in auto raid fires once only when naturally regenerated World Energy changes from below threshold to exactly threshold during the same live game/account session.
- [x] #3 Startup/reload, offline catch-up, already equal/above threshold, manual increases, disabled global RPC and active raid/monster queue never auto-start a duplicate raid.
- [x] #4 Automation uses current saved dialog team, boss level, wait, count, troop limit and cancellation settings; settings/errors visible and account-bound.
- [x] #5 Tests, typecheck and production build pass; release version and changelog updated for the new build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix queue startup and stale candidate expiry; refresh search after target-not-found errors while preserving remaining count and exclusions. 2. Add pure threshold detector and background serialized config/tick integration with document session reset and global RPC policy. 3. Add opt-in checkbox/threshold and save latest dialog/team options. 4. Verify startup, exact natural crossing, over-threshold, refill items, stale/missing bosses, queue contention and account/session changes; update docs and release build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed target recovery: absent/mismatched/undated/future/older-than-5-minute search refreshes roster and searches without another Start click. Confirmed missing/expired/unavailable target clears batch and searches with failed/won IDs excluded; preserves remaining count. Added account-bound raidEnergyAuto options and exact natural crossing observer, document heartbeat while popup closed, session-storage continuity and serialized one-shot dispatch. Busy queues/active rally/deployed heroes/global-disabled states consume and skip the crossing, never defer it. Startup/reload/login, manual gains, overshoot and >90s catch-up excluded. Dialog checkbox/threshold uses current team/level/count/wait/troop-cap/cancel options and shows status/errors; saving options no longer silently enables global RPC. Account ID retained in Raid preferences.
Verification: 628 tests total, 616 passed, 12 optional private-data skips, zero failures; typecheck and production build passed. Dedicated pure-model, actual Vue setup, background concurrency/policy and bridge heartbeat tests added. Release 0.10.54 synchronized in package/lock/source+built manifests and CHANGELOG.md. No live game interaction; no commit requested for this implementation.
System Decision Impact: candidate @decision/20261113-1816-recover-stale-raid-targets-and-trigger-on-natural-energy-crossing (added) — stale/invalid batch exceptions extend the accepted fresh-candidate consumption policy; natural energy auto-start uses explicit account/session crossing semantics.
<!-- SECTION:NOTES:END -->

