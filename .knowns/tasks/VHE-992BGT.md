---
id: VHE-992BGT
title: Fix rally start and optional final-ten-second cancellation
status: done
priority: high
labels: []
createdAt: '2026-11-06T14:02:15.492Z'
updatedAt: '2026-11-06T14:15:25.164Z'
completedAt: '2026-11-06T14:15:25.164Z'
timeSpent: 0
---
# Fix rally start and optional final-ten-second cancellation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use observed boss and troop snapshot to start the first rally; preserve sequential queue behavior and make late member cancellation optional.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Start rally dispatches createRally for the selected boss without another roster refresh or search
- [x] #2 Start raid queue launches its first rally and continues sequentially after confirmed return
- [x] #3 Optional member threshold cancels only in the final ten seconds before departure
- [x] #4 Settings persist and relevant tests plus build pass
- [x] #5 Auto-cancel checkbox and minimum-member number input render as one joined input group
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the missing createRally from the supplied capture and trace the queue path. 2. Start the first rally from the selected boss and current squad with strict validation. 3. Add a persisted auto-cancel checkbox beside minimum members and gate final-ten-second cancellation. 4. Add focused regression tests, run full checks, and validate Knowns task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Capture analysis: Find boss returned five targets; Start issued heroGetAll/getUnitSummary and a second searchMob, but no createRally. Replayed captured roster/search into the updated start path and observed immediate createRally. First dispatch now uses selected boss and cached troops; later queue rounds still refresh after confirmed return. Auto-cancel checkbox persists per account and evaluates at ten seconds before departure only when enabled. npm run check passed 298 tests and built v0.9.82; git diff --check passed. Existing world-map RPC doc update was attempted via Knowns CLI but rejected by alternating canonical hash conflicts, so its older unconditional-cancel section remains pending documentation repair. System Decision Impact: candidate @decision/20261106-2108-first-rally-uses-selected-target-with-optional-late-cancellation (changed) — first dispatch and optional cancellation behavior.

Reopened for UI refinement requested on 2026-11-06: combine Auto-cancel checkbox and minimum-member input into one joined control; retain persisted behavior and verify build.

UI refinement complete: Auto-cancel checkbox and minimum-member number input now share one input-group border with a divider, while the accessible member label remains above. npm run check passed 298 tests and built v0.9.83.
<!-- SECTION:NOTES:END -->

