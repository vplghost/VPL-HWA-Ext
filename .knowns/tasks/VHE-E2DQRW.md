---
id: VHE-E2DQRW
title: Fix Energy cap and numeric table alignment
status: done
priority: medium
labels: []
createdAt: '2026-11-01T13:58:20.524Z'
updatedAt: '2026-11-01T14:00:43.099Z'
completedAt: '2026-11-01T14:00:43.099Z'
timeSpent: 0
---
# Fix Energy cap and numeric table alignment

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Energy soft cap uses team level even when RPC sends level as a numeric string and refill defaults to 6 minutes when no API rate is available
- [x] #2 Energy header shows amount and soft cap without a countdown
- [x] #3 Numeric table values and matching headers align right while IDs and ordinals retain their alignment
- [x] #4 Tests, build, and validation pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce cap parsing from captured userGetInfo. 2. Normalize level, preserve 6-minute fallback and remove Energy countdown UI. 3. Align numeric table columns and headers consistently. 4. Add focused verification and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Captured userGetInfo sends level as string 78; parsed level yields Energy cap 138, 360000 ms fallback and valid refill clock. Removed Energy countdown from header and tooltip, aligned numeric table headers/cells consistently, kept IDs and Team ordinal left. npm run check passed 48/48; knowns validate passed with existing memory metadata warnings.
<!-- SECTION:NOTES:END -->

