---
id: VHE-RQ23W7
title: Show remaining Arena and Grand Arena battles on Dashboard
status: done
priority: medium
labels:
  - dashboard,arena
createdAt: '2026-11-06T15:03:07.370Z'
updatedAt: '2026-11-06T15:03:57.856Z'
completedAt: '2026-11-06T15:03:57.856Z'
timeSpent: 0
---
# Show remaining Arena and Grand Arena battles on Dashboard

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Display today remaining Arena and Grand Arena battle attempts from verified userGetInfo refillable counters 6 and 21, alongside rank when available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard shows valid remaining Arena and Grand Arena battles separately
- [x] #2 Missing or stale counters stay unknown rather than showing zero
- [x] #3 Relevant tests and extension build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use existing resource:refillable:6 and :21 snapshots from userGetInfo; update dashboard row state/details with independent freshness; add focused tests; run check and validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified userGetInfo.refillable IDs 6 (arena_battle) and 21 (grand_arena_battle) against captured response and splitlib/refillable.json. Dashboard reads today-only resource:refillable:6 and :21 independently, shows rank plus exact remaining battles, and leaves missing/stale counters unknown. The similarly numbered world-refillable:6 is Free Teleport and is intentionally excluded. npm run check passed 305 tests and built v0.9.87. System Decision Impact: none — this extends the existing observed-snapshot dashboard rule without changing its guidance.
<!-- SECTION:NOTES:END -->

