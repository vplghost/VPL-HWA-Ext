---
id: VHE-PATKBH
title: Migrate metadata and utility unit tests to TypeScript data modules
status: done
priority: high
labels:
  - typescript
  - tests
  - metadata
createdAt: '2026-11-16T04:34:01.741Z'
updatedAt: '2026-11-16T04:36:11.071Z'
completedAt: '2026-11-16T04:36:11.071Z'
timeSpent: 0
---
# Migrate metadata and utility unit tests to TypeScript data modules

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate core metadata and rules tests (hero-metadata, titan-metadata, experimental-data) to directly test TypeScript data modules in src/data and src/utils.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Migrate tests/hero-metadata.test.mjs to test src/data/heroMetadata.ts
- [x] #2 Migrate tests/titan-metadata.test.mjs to test src/data/titanMetadata.ts
- [x] #3 Migrate tests/experimental-data.test.mjs to test src/utils/experimentalData.ts
- [x] #4 Verify all 958+ unit tests and type checks pass
<!-- AC:END -->

