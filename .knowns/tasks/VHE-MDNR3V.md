---
id: VHE-MDNR3V
title: Compact resource values and show renewable tooltip rate
status: done
priority: medium
labels: []
createdAt: '2026-11-01T13:05:39.061Z'
updatedAt: '2026-11-01T13:08:07.960Z'
completedAt: '2026-11-01T13:08:07.960Z'
timeSpent: 0
---
# Compact resource values and show renewable tooltip rate

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resource balances at least one million and one billion use compact M and B notation
- [x] #2 Resources with a known refill rate show amount per minute when at least one per minute
- [x] #3 Slower renewable resources show the time until the next refill in the Resources list and header
- [x] #4 Produced materials without API rate data show an explicit unavailable message
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect existing resource data and tooltip rendering; add shared formatting/refill description; apply to list and header; add focused tests and run validation
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented compact formatting and live tooltip descriptions for timed refillables. Produced materials have no rate in captured inventory or resourceProduction summaries, so the UI marks rate unavailable. npm run check passed: 39 tests and build. System Decision Impact: none; this is a local display change.
<!-- SECTION:NOTES:END -->

