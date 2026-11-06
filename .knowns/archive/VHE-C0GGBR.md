---
id: VHE-C0GGBR
title: Add experimental rally and gather tab
status: done
priority: high
labels: []
createdAt: '2026-11-06T03:34:38.773Z'
updatedAt: '2026-11-06T10:31:33.195Z'
completedAt: '2026-11-06T03:50:33.795Z'
timeSpent: 868
archivedAt: '2026-11-06T10:31:33.195Z'
---
# Add experimental rally and gather tab

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an Experimental tab for rally raid and gathering controls, team selection, live march phases, outcome tracking, and recall.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Experimental tab offers rally boss level and wait duration, team preview, search and start controls.
- [x] #2 Rally progress shows waiting, outbound, result, and return phases.
- [x] #3 Gather offers lineup selection with lowest-power-five preference and recall for an active team.
- [x] #4 RPC actions are gated by popup RPC setting and validated against captured contracts.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse tab configuration and popup RPC dispatch patterns in extension/popup.js and background.js.
2. Build rally and gather controls from cached heroes, teams, map targets, and marches.
3. Extend RPC cache with search and action outcomes needed to sequence rally and gather safely.
4. Add focused tests for lineup choice, search results, phase/outcome tracking, and dispatch guards.
5. Run npm check and Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Experimental tab scaffolding, boss search from captured searchMob contract, selectable hero teams, lowest-power gather lineup, gather send and recall controls, rally phase display and recent result history. Start rally remains disabled pending captured createRally request schema supplied by user. Focused tests pass; full npm check is blocked by missing historical trace fixtures.

Completed with captured 2026-11-06 rally and gathering traces: createRally uses startDelay milliseconds; attackMine includes mapId; stopMineGathering uses squadId. Added action-result status, pending-command guard, map context from getChunks, last squad troop defaults, result history, and live rally countdown. Targeted tests and 245/255 project tests pass; 10 existing fixture-replay tests fail solely because referenced historical temp traces are absent. CSS compilation, syntax checks, log replay, and git diff check pass. System Decision Impact: none — experimental controls follow existing RPC and popup patterns without adding a durable project-wide rule.

Backlog disposition 2026-11-06 (@task-VHE-MRH4NM): Initial pending-payload and direct-dispatch notes are historical, not open work: payloads were supplied and the feature completed. Global RPC policy is now @task-VHE-62VVG5; queue/capacity UI is superseded by @task-VHE-1K5J8J and @task-VHE-NFV32J.
<!-- SECTION:NOTES:END -->

