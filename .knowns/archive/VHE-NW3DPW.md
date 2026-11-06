---
id: VHE-NW3DPW
title: Fix Wheel of Fortune free spin state and commit workspace
status: done
priority: high
labels: []
createdAt: '2026-11-03T06:16:54.495Z'
updatedAt: '2026-11-06T10:31:35.862Z'
completedAt: '2026-11-03T06:24:31.758Z'
timeSpent: 448
archivedAt: '2026-11-06T10:31:35.862Z'
---
# Fix Wheel of Fortune free spin state and commit workspace

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Correct free-spin availability/countdown after alchemyUseFree and stale userGetInfo snapshots; validate UI and cache; build versioned extension; commit all currently outstanding workspace changes as requested.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Zero remaining free spins with boughtToday zero does not display Free Spin
- [x] #2 A used free spin stays used when older userGetInfo data is replayed
- [x] #3 Countdown follows next reset time and avoids claiming a free spin from stale data
- [x] #4 Targeted tests and versioned build pass; outstanding workspace changes are reviewed and committed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce zero-amount and out-of-order snapshot cases in tests. 2. Correct cache extraction/merge and UI state. 3. Verify focused tests and run one versioned build. 4. Review and commit all remaining workspace changes in coherent commits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced three failures: amount=0 with boughtToday=0 falsely showed Free Spin; replaying older userGetInfo restored hasFree; popup trusted a stale hasFree flag despite amount=0. Fixed extraction to use remaining amount, accepted only successful alchemyUseFree responses, preserved boughtToday rather than inventing a value, guarded wheel status by timestamp, and made the popup prefer the newest amount. Countdown now displays HH:MM:SS; after an elapsed reset without a fresh snapshot it shows Check Wheel. Tests: 55 popup/data tests plus 3 wheel RPC tests pass, syntax and git diff checks pass. npm run build bumped 0.9.35 to 0.9.36 and all four version files agree. System Decision Impact: none.

Commit 55a98df contains the validated free-spin fix and version 0.9.36. Reviewed remaining pre-existing workspace changes: only Knowns watcher-startup history checkpoints plus line-ending-only AGENTS/CLAUDE/GEMINI/.knowns ignore changes. Preparing a separate metadata commit to leave the workspace clean as requested.

Backlog disposition 2026-11-06 (@task-VHE-MRH4NM): Historical Wheel work is retired by @task-VHE-8D82V9 and @doc/archive/shelved-wheel-of-fortune. Existing historical completion is preserved; no Wheel development or tracking is restarted.
<!-- SECTION:NOTES:END -->

