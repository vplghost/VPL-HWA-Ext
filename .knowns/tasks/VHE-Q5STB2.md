---
id: VHE-Q5STB2
title: Automatically use free alchemy spin when cooldown or daily reset makes it available
status: done
priority: medium
labels: []
createdAt: '2026-11-14T18:43:54.435Z'
updatedAt: '2026-11-14T18:59:45.038Z'
completedAt: '2026-11-14T18:54:11.532Z'
timeSpent: 522
---
# Automatically use free alchemy spin when cooldown or daily reset makes it available

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add explicit Auto free spin toggle and background scheduling that works with popup closed, uses only captured free refillable53 RPC, respects shared mode/enable, and coordinates manual/automatic calls through one persisted confirmation lock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings exposes opt-in Auto free spin; background/alarm/content wakeups trigger after verified cooldown or daily reset even with popup closed, respecting shared RPC settings.
- [x] #2 Refresh quota before automatic attempts; manual/auto share one persisted account-scoped lock, exact free53 RPC only, confirmed receipts/quota settle state, and uncertain mutations are not retried.
- [x] #3 Handle account changes, absent/stale game bridges, disable/mode changes, daily reset and multiple wakeups safely; UI reflects pending/result across popup instances.
- [x] #4 Add meaningful timer/controller/bridge/manual concurrency tests and actual Chrome fixture acceptance; update canonical docs and validate typecheck/build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Share existing availability policy between UI and background. 2. Implement opt-in background scheduler, persisted manual/auto confirmation lock, quota refresh and account-bound bridge checks. 3. Wire Settings and Dashboard pending/action state, content wake and MV3 alarm. 4. Test cooldown/reset, RPC modes, concurrency/failures/account changes with Chrome fixture; document and finish before Teams task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented opt-in Settings Auto Free Spin (defaultoff), shared classic/UI timer policy, background persistent manual/auto mutation lock, quota refresh before automatic dispatch, account-bound content bridge check, MV3 alarm and content wake when popup closed. Exact free53 only; shared RPC mode respected; queued cancellation retains uncertainty and no mutation retry/paid fallback. Browser acceptance exposed reference-aliasing storage bug and verified fix using structured-cloned snapshots; mockget/set now clone like Chrome. Actual Chrome157 local-fixture run0.10.87 with actual Settings click and closed popup: exactly1 free RPC after cooldown,73800gold once, pending cleared, next wake set,8HTTP batches/no loop. Evidence docs/acceptance/free-spin-2026-11-15.json. Unit/controller cases cover timer/reset, manual/auto concurrency, rejection, account switch and disable/mode behavior. Full803tests:791passed/12optional skips; typecheck/build and diff checks PASS. Review:PASS P1/P2=0. Spec Decision Compliance:N/A (standalone). System Decision Impact:candidate @decision/20261115-0153-schedule-opt-in-free-alchemy-spins-with-shared-manual-and-automatic-confirmation-state (added) — explicit opt-in timer automation with persisted shared confirmation state; draft only.

Final integration rerun on combined build 0.10.88 passed: docs/acceptance/free-spin-2026-11-15.json, popup closed, local fixture only, exactly one free spin, no runtime errors. Full combined suite 806 tests: 794 passed and 12 optional private-log skips; typecheck/build passed.
<!-- SECTION:NOTES:END -->

