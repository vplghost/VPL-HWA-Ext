---
id: VHE-WEDXQP
title: Move Log into a dialog and simplify FAB actions
status: done
priority: medium
labels: []
createdAt: '2026-11-14T01:35:09.130Z'
updatedAt: '2026-11-14T01:59:06.935Z'
completedAt: '2026-11-14T01:59:06.935Z'
timeSpent: 91
---
# Move Log into a dialog and simplify FAB actions

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Log is a dialog opened from FAB with existing filtering/content preserved.
- [x] #2 Tower and Dungeon are removed from FAB while Dashboard launchers continue working.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect current Log tab, modal/FAB routing and persistence; move the existing log view into an explicit-dismissal dialog, replace tab navigation with a FAB launcher and remove Tower/Dungeon FAB entries; verify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented LogModal wrapper over existing Log view, modal routing and Log FAB launcher; removed Tower/Dungeon FAB buttons while retaining Dashboard and global modal routes. TabNav/Settings remove Log and reserve Guild entry. Verification in progress with combined work.

Completed LogModal + Log FAB route, removed Tower/Dungeon FAB entries while retaining Dashboard/global modal launchers. Existing Log viewer provides the same filtering, sorting, payload details, clear and export controls under ModalDialog's explicit-dismissal policy. TabNav/Settings discard legacy Log ID, retain other preferences and include Guild. Tests exercise actual FAB action routing and saved-config normalization. Shared0.10.75 release:705tests pass,12optional skips,typecheck/build pass; Review PASS with no findings. System Decision Impact: none — follows the existing FAB/modal routing and tab normalization design; no new cross-cutting policy.
<!-- SECTION:NOTES:END -->

