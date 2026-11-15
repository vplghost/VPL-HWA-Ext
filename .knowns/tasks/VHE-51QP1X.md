---
id: VHE-51QP1X
title: 'Phase 1.2: Migrate Hero and Titan metadata to typed TypeScript modules in-progress'
status: done
priority: high
labels:
  - migration
  - phase1
  - metadata
  - clean-code
createdAt: '2026-11-15T10:25:19.565Z'
updatedAt: '2026-11-15T10:36:35.181Z'
completedAt: '2026-11-15T10:36:35.181Z'
timeSpent: 0
assignee: '-s'
---
# Phase 1.2: Migrate Hero and Titan metadata to typed TypeScript modules in-progress

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract hero-metadata.js, hero-stat-data.js, and titan-metadata.js into src/data/heroMetadata.ts and src/data/titanMetadata.ts with strict TypeScript interfaces, typed helpers, and direct typed imports in metadata utilities and components.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create typed src/types/game/hero.ts and src/types/game/titan.ts
- [x] #2 Create typed src/data/heroMetadata.ts and src/data/titanMetadata.ts with stats and role helpers
- [x] #3 Refactor metadata.ts and marchTooltip.ts to use direct typed imports
- [x] #4 Preserve globalThis backward compatibility for background worker and tests
- [x] #5 Verify all unit tests, typecheck, and build pass
<!-- AC:END -->

