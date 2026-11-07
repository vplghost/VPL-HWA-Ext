---
id: VHE-5PHK0V
title: Fix rally queue timing out while first rally waits
status: done
priority: medium
labels: []
createdAt: '2026-11-07T02:22:28.862Z'
updatedAt: '2026-11-07T02:23:33.096Z'
completedAt: '2026-11-07T02:23:33.096Z'
timeSpent: 57
---
# Fix rally queue timing out while first rally waits

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate createRally confirmation matching and timeout while a game rally is already waiting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A successful first rally transitions to active despite dispatch normalization.
- [x] #2 Waiting rallies do not hit the creation RPC timeout.
- [x] #3 Tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce confirmation mismatch through actual dispatch normalization. 2. Correct request matching and timeout state reporting without repeating createRally. 3. Add regression tests, run relevant suites and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced failure by round-tripping state with alphabetically ordered object keys: successful RPC ignored. Fixed sameCall to compare nested JSON values independently of object key order, preserving array ordering and all argument values. Regression proves create confirmation becomes active, 5-minute wait survives 2-minute RPC deadline, and another boss confirmation is ignored. 42 raid/background tests pass; all suites except known missing private quest-data fixture pass; build 0.9.96 passes; git diff --check passes. Memory @memory/a8okpa captured. System Decision Impact: none — correction of RPC matching implementation; queue lifecycle contract unchanged.
<!-- SECTION:NOTES:END -->

