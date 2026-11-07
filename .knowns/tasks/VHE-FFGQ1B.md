---
id: VHE-FFGQ1B
title: Move Gathering into a header dialog
status: done
priority: medium
labels: []
createdAt: '2026-11-07T12:00:44.950Z'
updatedAt: '2026-11-07T12:04:20.707Z'
completedAt: '2026-11-07T12:04:20.707Z'
timeSpent: 52
---
# Move Gathering into a header dialog

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move Gathering controls from Experimental into a native dialog opened from the global header, like the Raid dialog; retire the empty Experimental tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gathering opens from a header button on any tab and closes with native dialog controls.
- [x] #2 Gathering search, send, recall, status and live refresh work inside the dialog.
- [x] #3 The empty Experimental tab is removed without breaking saved tab configuration.
- [x] #4 Relevant UI tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Follow Raid dialog structure and map Gathering dependencies. 2. Add global Gathering trigger and dialog, route renderer to dialog, remove Experimental tab. 3. Update UI regression tests for dialog and saved tabs. 4. Run targeted tests, build, and validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added native Gathering dialog and persistent header trigger outside Dashboard; live cache refresh now rerenders an open Gathering dialog. Search, send, recall and action feedback render in that dialog. Retired empty Experimental tab; normalization drops its saved entry. Updated Raid UI regression and added Gathering dialog workflow test. Verification: 19 targeted tests pass; 321 available tests excluding pre-existing quest-data private fixture pass; npm run build passes at 0.9.100; git diff --check passes. System Decision Impact: none — UI placement reuses existing dialog pattern and does not change RPC or storage contracts.
<!-- SECTION:NOTES:END -->

