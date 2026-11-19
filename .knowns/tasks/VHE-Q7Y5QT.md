---
id: VHE-Q7Y5QT
title: Fix dynamic event and battle pass title mapping in catalog service and quest metadata
status: done
priority: high
labels: []
createdAt: '2026-11-19T12:44:01.641Z'
updatedAt: '2026-11-19T12:48:05.578Z'
completedAt: '2026-11-19T12:48:05.578Z'
timeSpent: 0
assignee: '@me'
---
# Fix dynamic event and battle pass title mapping in catalog service and quest metadata

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix title extraction in eventCatalogService from nameLocaleKey/label, prevent generic Special Event overrides in questData, and add battle pass title mapping
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 parseSpecialQuestEventViews extracts titles from nameLocaleKey and English labels
- [x] #2 Runtime event catalog never overwrites known titles with generic Special Event
- [x] #3 getBattlePassName helper resolves descriptive names for all Battle Passes
- [x] #4 Unit tests verify event and battle pass title mappings
<!-- AC:END -->

