---
id: VHE-E9ZX13
title: Build Free Box Opening Feature on Dashboard Next to Spin Wheel
status: done
priority: high
labels:
  - dashboard,rewards,cinema,automation
createdAt: '2026-11-15T11:07:57.549Z'
updatedAt: '2026-11-15T11:23:05.783Z'
completedAt: '2026-11-15T11:23:05.783Z'
timeSpent: 0
---
# Build Free Box Opening Feature on Dashboard Next to Spin Wheel

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Cinema free video box feature (boxNum 0..4, firstPlacement) on Dashboard next to FreeAlchemySpinButton, tracking remaining free boxes and claiming available boxes with clear reward feedback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Implement RPC handling and state tracking for cinemaGetCounters and cinemaGiveReward
- [x] #2 Create FreeBoxButton.vue on Dashboard adjacent to FreeAlchemySpinButton
- [x] #3 Display remaining free boxes count (X/5) and claim all available boxes sequentially on click
- [x] #4 Add unit test suite verifying cinemaGetCounters cache and FreeBoxButton behavior
- [x] #5 Verify all tests pass, typecheck, build, bump version, and update changelog
<!-- AC:END -->

