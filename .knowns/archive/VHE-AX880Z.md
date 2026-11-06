---
id: VHE-AX880Z
title: Show live march icons and remaining time in header
status: done
priority: medium
labels: []
createdAt: '2026-11-01T14:07:45.558Z'
updatedAt: '2026-11-06T10:31:32.864Z'
completedAt: '2026-11-01T14:10:51.574Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:32.864Z'
---
# Show live march icons and remaining time in header

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each active march from getMarches appears once before Building time in the header
- [x] #2 Gathering marches use resource-specific colored icons; attack, rally, scout, and return marches use distinct suitable icons
- [x] #3 Hover or focus shows stage and remaining time, updated as time passes, with newer API snapshots replacing old state
- [x] #4 Tests, build, docs, and Knowns validation pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect getMarches snapshots and versioned globalMapMine config. 2. Project safe march state from RPC and map mine config IDs to resource types. 3. Render compact colored badges before Building with time tooltips and periodic refresh. 4. Verify mixed march states, update docs, build, and commit locally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
getMarches:march snapshots project stage, mine config ID, and route end time only. Captured logs yield Stone/Wood gathering and Return icons; globalMapMine config 8e714674 maps mine IDs 55/75. Header shows one colored badge per squad before Building with minute-level tooltip updates and hides elapsed stages. npm run check passed 49/49; Knowns validation passed with existing memory metadata warnings.
<!-- SECTION:NOTES:END -->

