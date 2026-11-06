---
id: VHE-SC6B8F
title: Table JSON export button for heroes, titans, items, and resources
status: done
priority: high
labels:
  - export,ui
createdAt: '2026-11-02T05:23:30.806Z'
updatedAt: '2026-11-06T10:31:36.608Z'
completedAt: '2026-11-02T05:29:42.210Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:36.608Z'
---
# Table JSON export button for heroes, titans, items, and resources

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Add JSON export button to the left of table row count in status bar
- [x] #2 Export rich JSON data for heroes including level, star, souls, power, sparks, skills, skins, glyphs, artifacts
- [x] #3 Export corresponding JSON data for titans, items, resources, teams, and other snapshots
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified table-export-btn precedes row/status count in popup.html and uses exportTableData/exportTableFilename. Rich hero/titan/item/resource/team/other snapshots covered by popup-data.test.mjs; visibility covered by events-ui.test.mjs. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

