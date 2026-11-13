---
id: VHE-A1W68G
title: Remember dialog teams and disable backdrop dismissal
status: done
priority: medium
labels: []
createdAt: '2026-11-13T12:15:07.883Z'
updatedAt: '2026-11-13T12:24:08.087Z'
completedAt: '2026-11-13T12:24:08.087Z'
timeSpent: 469
---
# Remember dialog teams and disable backdrop dismissal

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User requests restoring the last chosen team in every dialog that supports team selection. Also disable dismissal from backdrop clicks in all dialogs, retaining explicit close controls and Escape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Raid, Monster, Gathering, Brigand and Tower restore their last chosen team on reopen and after popup reload.
- [x] #2 Selections are isolated by account and dialog, survive unrelated option saves, and stale asynchronous reads cannot overwrite newer user choices.
- [x] #3 Clicking backdrop does not close any dialog; explicit close buttons and Escape still work.
- [x] #4 Meaningful regression tests, typecheck and production build pass; changelog updated.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add account/dialog-specific remembered selections with guarded async loading. 2. Integrate Raid, Solo Monster, Gathering, Brigand and Tower; preserve selection when preferences or roster refresh. 3. Remove backdrop close handlers from shared and standalone dialogs. 4. Verify persistence/reopen/account races and close behavior, typecheck/build and update release changelog.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented useDialogTeamSelection with independent dialogTeam:<account>:<dialog> keys, account/revision guards and copied hero arrays; integrated shared Raid/Monster/Gathering helper plus Brigand preset/manual heroes and Tower hero slots. Removed competing Raid/Monster restores and preserved legacy automation settings. Removed backdrop close handlers from shared ModalDialog and 10 standalone overlays; retained close buttons and Escape. Added actual composable/squad recreation and race tests and compiled Vue modal interaction test. Verification: 633 tests total, 621 pass, 12 optional private-data skips, 0 failures; typecheck and production build passed. Prepared 0.10.55 with matching package, lock and source/built manifests plus CHANGELOG.md. User explicitly authorized committing after tasks complete. Prepared prior Raid release 0.10.54 as an isolated tree to retain its validated artifacts when splitting commits; log LSP remains outside.
System Decision Impact: candidate @decision/20261113-1923-remember-teams-per-account-and-dialog-with-explicit-dismissal (added) — account/dialog selection ownership and explicit dismissal policy.
<!-- SECTION:NOTES:END -->

