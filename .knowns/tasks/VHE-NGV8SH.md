---
id: VHE-NGV8SH
title: Migrate remaining test references and remove decoupled legacy JS files
status: done
priority: high
labels:
  - refactor
  - cleanup
  - tests
createdAt: '2026-11-16T04:50:27.588Z'
updatedAt: '2026-11-16T05:53:56.504Z'
completedAt: '2026-11-16T05:53:56.504Z'
timeSpent: 0
---
# Migrate remaining test references and remove decoupled legacy JS files

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate tests relying on legacy extension/*.js modules to their TypeScript equivalents, tree shake unreferenced JS files, and delete them from extension/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Migrate legacy tests to import from src/ data and service modules
- [x] #2 Remove legacy .js files that have zero remaining references
- [x] #3 Verify npm run build, typecheck, and all tests pass cleanly
<!-- AC:END -->

