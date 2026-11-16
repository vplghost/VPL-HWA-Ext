---
id: VHE-0YZ1XJ
title: Clean up globalThis.hwaHelper data references across src
status: done
priority: high
labels:
  - refactor
  - typescript
createdAt: '2026-11-16T04:50:22.576Z'
updatedAt: '2026-11-16T04:59:05.917Z'
completedAt: '2026-11-16T04:59:05.917Z'
timeSpent: 0
---
# Clean up globalThis.hwaHelper data references across src

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace all fallback and direct globalThis.hwaHelper calls in Vue components, composables, cache reducers, and utils with direct TypeScript imports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Refactor Vue components and composables in src/ to import typed modules directly
- [x] #2 Refactor cache reducers and utils to eliminate globalThis.hwaHelper access
- [x] #3 Verify typecheck and all tests pass with zero regressions
<!-- AC:END -->

