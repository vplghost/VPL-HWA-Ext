---
id: VHE-W7EFMN
title: 'P2-48: Dependency-Aware Building & Research Queue Reordering'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T09:00:24.690Z'
updatedAt: '2026-11-28T09:04:12.041Z'
completedAt: '2026-11-28T09:04:12.041Z'
timeSpent: 0
---
# P2-48: Dependency-Aware Building & Research Queue Reordering

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement pure dependency-aware move bounds and constrained queue reordering for buildingQueue and researchQueue (same-entity sequential levels, cross-building/research prerequisites, Hall of Heroes cap, transitive chain, Move-to-First right after last requirement), enforce in backgroundRuntime.ts, and bind disabled states + English tooltips in BuildingModal.vue and ResearchModal.vue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pure engine enforces same-entity level order, cross-building/research prerequisites, Hall of Heroes cap, and transitive dependencies
- [x] #2 Move-to-First stops right after the last requirement (minIndex); Up/Down cannot cross [minIndex, maxIndex]
- [x] #3 runCityQueueMutation enforces constrained moves; BuildingModal & ResearchModal disable blocked buttons with descriptive English tooltips
- [x] #4 Unit tests (tests/city-queue-reorder.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P2-48 (v0.11.399): added pure cityQueueReorder.ts enforcing same-entity level order, cross-building/research prerequisites, Hall of Heroes cap, transitive closure, and smart Move-to-First right after last prerequisite; enforced in backgroundRuntime.ts and bound disabled states + English tooltips in BuildingModal.vue and ResearchModal.vue; 1398/1398 tests and dual build passed.
<!-- SECTION:NOTES:END -->

