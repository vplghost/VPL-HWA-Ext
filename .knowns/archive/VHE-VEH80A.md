---
id: VHE-VEH80A
title: Record game UI interactions and exposed engine calls alongside API capture
status: done
priority: medium
labels: []
createdAt: '2026-11-04T07:10:51.007Z'
updatedAt: '2026-11-06T10:31:36.898Z'
completedAt: '2026-11-04T07:15:22.775Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:36.898Z'
---
# Record game UI interactions and exposed engine calls alongside API capture

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use the game-window Record control to capture DOM/canvas actions and exposed Unity method calls, persist locally, and export a correlated analysis log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Game-window Record starts and stops UI and engine capture together with API capture
- [x] #2 Interaction records persist in chrome.storage.local with timestamps and bounded payloads
- [x] #3 Game-window export includes correlated interaction and API records
- [x] #4 Capture does not alter game behavior or record typed input values
- [x] #5 Targeted tests and build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse current game-window Record control and background recording queue; store bounded interaction entries in chrome.storage.local.
2. Capture safe DOM/canvas pointer and key metadata in bridge, and observable Unity SendMessage calls in page context.
3. Export a combined timeline from game-window export control while retaining existing API-only popup export.
4. Add targeted tests, run project check/build, and validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented game-window capture: pointer/wheel/non-printable key metadata, exposed Unity SendMessage metadata, persistent bounded local interaction entries, and combined chronological game-window export with API records. No typed values or engine payloads saved. Targeted tests 42/42 pass; build 0.9.48 passes. Full npm run check: 210/220 tests pass; 10 existing replay tests fail because their temp/tracking-data fixtures are absent. System Decision Impact: none; no accepted System Decision matched this bounded feature.

Validation: Knowns entity valid (0 issues). Runtime game-window recording remains to be exercised by user on the live game build; exposed engine calls depend on Unity exports being available.

Follow-up before commit: live record exposed that content scripts could not read chrome.storage.session by default, leaving interaction capture inactive. Bridge now obtains initial state through background record-status and receives local gameRecordingActive changes. Targeted tests 42/42 pass; build 0.9.49 passes.
<!-- SECTION:NOTES:END -->

