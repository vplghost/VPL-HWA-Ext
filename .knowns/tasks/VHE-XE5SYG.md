---
id: VHE-XE5SYG
title: Extract popup-data helpers to TypeScript and decouple src/utils/metadata.ts in-progress
status: done
priority: high
labels:
  - typescript,refactor
createdAt: '2026-11-16T04:00:41.834Z'
updatedAt: '2026-11-16T04:05:34.855Z'
completedAt: '2026-11-16T04:05:34.855Z'
timeSpent: 0
assignee: '-s'
---
# Extract popup-data helpers to TypeScript and decouple src/utils/metadata.ts in-progress

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port pure helpers from extension/popup-data.js into a typed TypeScript module, eliminate all 17 legacy JavaScript imports from src/utils/metadata.ts, and verify 0 typecheck errors and 950 passing tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create src/utils/popupData.ts with typed implementations of heroSoulProgress, titanSoulProgress, getHeroEquipmentRank, observedDraftChoices, and getUnreadChatCount
- [x] #2 Remove all 17 legacy import statements from src/utils/metadata.ts and replace with typed modules
- [x] #3 Verify npm run typecheck passes with 0 errors and npm test passes all 950 tests
<!-- AC:END -->

