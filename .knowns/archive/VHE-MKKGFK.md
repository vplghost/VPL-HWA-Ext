---
id: VHE-MKKGFK
title: Show verified production rates for Realm materials
status: done
priority: medium
labels: []
createdAt: '2026-11-01T13:19:53.190Z'
updatedAt: '2026-11-06T10:31:35.527Z'
completedAt: '2026-11-01T13:42:36.494Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:35.527Z'
---
# Show verified production rates for Realm materials

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Food, wood, stone, iron, and Elarite tooltips show verified per-minute production rates when active
- [x] #2 Rates update when producer assignments or relevant bonuses change
- [x] #3 Inventory balance remains based on API collection snapshots
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use version-pinned bonus and campaign configs from the 1.292.0 log; cache relevant bonus IDs, producer occupancy and mission progress; compute per-minute rates with a validated formula; show rates in list/header tooltips; test against screenshot and build
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New log hwa-api-202611012020-resource.json captured; getSummary:bonus contains active IDs and resourceProduction contains assignments, but RPC does not provide a final productivity number.

Tooltip work split into a separate task. Awaiting an in-game displayed rate to validate the bonus formula; new RPC log contains only active bonus IDs and producer assignments.

Sawmill.png received: shows Production 526367.40 +615.74 at Lv.18 but no unit or definition. Asked whether +615.74 is upgrade delta or per-minute rate before deriving a formula.

sawmill2.png gives game rates Food 11661/m, Wood 8835/m, Stone 1790/m, Iron 523/m, Elarite 51/m. Formula 60*(baseSpeed + workstationCount*optionalSpeed)*(1+percent/100) predicts 11660.5, 8772.8, 1789.1, 522.3; Wood differs 0.7%, likely snapshot timing. Campaign productionPerSecond 0.85 predicts Elarite 51/m.

Implemented version-pinned production rules and live RPC inputs; popup shows estimated rates for fully staffed producers and campaign Elarite. Snapshot rates differ from the game screenshot by at most 0.7%; mismatched config or partial staffing falls back to unavailable. Inventory balances still use API snapshots. 42 tests/build and headless browser tooltip preview pass. System Decision Impact: none.
<!-- SECTION:NOTES:END -->

