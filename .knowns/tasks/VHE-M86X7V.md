---
id: VHE-M86X7V
title: Refactor test cases from globalThis mocks to direct imports and verify suites
status: done
priority: high
labels:
  - test,refactor
createdAt: '2026-11-21T05:12:47.898Z'
updatedAt: '2026-11-21T05:17:39.941Z'
completedAt: '2026-11-21T05:17:39.941Z'
timeSpent: 0
---
# Refactor test cases from globalThis mocks to direct imports and verify suites

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 modal-dismissal, guild-versus-unknown, monster-power, daily-quest-config tests provide direct useModals imports
- [ ] #2 hero-recipe-farm, nested-recipe, tower-rules, vue-ui-parity-runtime, campaign-picker remove globalThis hacks
- [ ] #3 npm test passes 100% and npm run build succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Refactored tests (modal-dismissal, guild-versus-unknown, monster-power, daily-quest-config, hero-recipe-farm, nested-recipe, tower-rules, vue-ui-parity-runtime, campaign-picker) from globalThis mocks to direct imports; 1084 tests passing, build validated
<!-- SECTION:NOTES:END -->

