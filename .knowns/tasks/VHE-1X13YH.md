---
id: VHE-1X13YH
title: 'Phase 1.1: Migrate Building and Research metadata to typed TypeScript modules'
status: done
priority: high
labels:
  - migration,phase1,metadata,clean-code
createdAt: '2026-11-15T10:13:36.669Z'
updatedAt: '2026-11-15T10:24:47.788Z'
completedAt: '2026-11-15T10:24:47.788Z'
timeSpent: 0
assignee: '@me'
---
# Phase 1.1: Migrate Building and Research metadata to typed TypeScript modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract building-data.js and research-data.js into src/data/buildingData.ts and src/data/researchData.ts with strict TypeScript interfaces, typed helpers, and direct typed imports in BuildingModal and ResearchModal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create typed src/data/buildingData.ts with buildingLevel interfaces, duration parsing, and requirements helpers
- [x] #2 Create typed src/data/researchData.ts with researchTech interfaces, costs, and requirements helpers
- [x] #3 Refactor BuildingModal.vue and ResearchModal.vue to use direct typed imports instead of globalThis
- [x] #4 Preserve globalThis backward compatibility for background worker and existing unit tests
- [x] #5 Verify all 867+ unit tests, typecheck, and build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/types/game/building.ts and research.ts. 2. Implement typed src/data/buildingData.ts and src/data/researchData.ts. 3. Refactor BuildingModal.vue and ResearchModal.vue to use direct typed imports. 4. Write tests in tests/building-research-typed-data.test.mjs. 5. Run npm run check, bump version, update CHANGELOG.md, and commit.
<!-- SECTION:PLAN:END -->

