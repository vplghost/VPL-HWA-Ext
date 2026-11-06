---
id: VHE-R2634G
title: Stabilize resource tooltips and display rounded refill time
status: done
priority: high
labels: []
createdAt: '2026-11-01T13:27:28.526Z'
updatedAt: '2026-11-06T10:31:36.425Z'
completedAt: '2026-11-01T13:28:55.349Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:36.425Z'
---
# Stabilize resource tooltips and display rounded refill time

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resource tooltips do not flicker or reset while values refresh each second
- [x] #2 Tooltip refill time uses HH:mm for at least one hour and minutes below one hour
- [x] #3 Second-resolution refill calculations and visible energy countdown remain correct
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace frequently mutated native title tooltips with CSS tooltip content that changes only when rounded text changes; add minute/hour formatter; test and build
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CSS tooltip replaces native title mutation; text attribute changes only when displayed amount/minute changes. Browser headless preview confirmed resource header/list content. 39 tests and build pass. System Decision Impact: none.
<!-- SECTION:NOTES:END -->

