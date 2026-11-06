---
id: VHE-4ZAVFX
title: Automate Tower route with saved team and prioritized buffs
status: done
priority: high
labels:
  - tower,automation
createdAt: '2026-11-06T15:08:42.471Z'
updatedAt: '2026-11-06T15:20:07.285Z'
completedAt: '2026-11-06T15:20:07.285Z'
timeSpent: 0
---
# Automate Tower route with saved team and prioritized buffs

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Analyze supplied Tower trace and implement an opt-in Tower action controller: saved magicTower team, one free chest choice, ordered buff policy in a draggable pill dialog, and response-driven progression.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tower dialog persists an ordered draggable buff priority list with name-only pills and detail tooltips
- [x] #2 Controller uses the saved magicTower team and selects only a server-listed free chest
- [x] #3 Controller chooses offered buffs by priority and advances only after confirmed RPC transitions
- [x] #4 Controller stops on completion, loss, stale or missing state, RPC error, or user stop
- [x] #5 Focused replay/integration tests and full extension check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect captured Tower RPC sequence and existing cache/dialog/dispatch patterns; implement pure action planner with safe preconditions; connect background state and popup controls; test key trace transitions and safety stops; build and validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Tower planner, popup priority pills and runner; replay/integration tests and npm run check passed (311 tests, build 0.9.88). Native Unity endBattle still requires live game verification; supplied trace has no distinct Skip RPC. System Decision Impact: none.
<!-- SECTION:NOTES:END -->

