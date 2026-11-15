---
id: VHE-DKXBYR
title: Compact Dashboard march cards into two columns
status: done
priority: medium
labels: []
createdAt: '2026-11-15T06:35:34.276Z'
updatedAt: '2026-11-15T07:01:21.787Z'
completedAt: '2026-11-15T07:01:21.787Z'
timeSpent: 129
---
# Compact Dashboard march cards into two columns

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow the Mail dialog task, per user sequencing. Render Dashboard march cards in two columns; use existing compact thousands/millions formatting for gathered/target amounts and omit repeated resource unit names on progress because the mine card already identifies the resource.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard march cards use a compact two-column layout with readable content.
- [x] #2 Gather progress values use the shared compact number formatter and do not repeat food/wood/etc already shown by the card.
- [x] #3 Relevant rendering checks, typecheck/build and docs/task validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse shared compact formatter for progress with Dashboard-only compact presentation. 2. Convert march list to two columns with wrapping titles and full-width progress. 3. Typecheck/build and verify rendered card geometry and formatting in Chrome; record completion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two-column Dashboard march grid uses full-width compact progress with shared formatCompact (k from 1000), omits repeated resource units while keeping accessible progress label. Full 847 tests pass (12 optional skips), typecheck/build 0.10.95 pass; actual Chrome Direct/Piggyback checks card geometry, no horizontal overflow and compact values. Spec Decision Compliance: N/A (standalone). System Decision Impact: none — presentation adjustment reuses existing progress and formatter contracts.
<!-- SECTION:NOTES:END -->

