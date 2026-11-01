---
id: VHE-MKKGFK
title: Show verified production rates for Realm materials
status: in-progress
priority: medium
labels: []
createdAt: '2026-11-01T13:19:53.190Z'
updatedAt: '2026-11-01T13:30:21.761Z'
timeSpent: 0
---
# Show verified production rates for Realm materials

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Food, wood, stone, iron, and Elarite tooltips show verified per-minute production rates when active
- [ ] #2 Rates update when producer assignments or relevant bonuses change
- [ ] #3 Inventory balance remains based on API collection snapshots
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Capture a production detail screen with displayed rate and corresponding RPCs; identify the authoritative value or validate the game formula; cache required fields; render and test rates
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New log hwa-api-202611012020-resource.json captured; getSummary:bonus contains active IDs and resourceProduction contains assignments, but RPC does not provide a final productivity number.

Tooltip work split into a separate task. Awaiting an in-game displayed rate to validate the bonus formula; new RPC log contains only active bonus IDs and producer assignments.

Sawmill.png received: shows Production 526367.40 +615.74 at Lv.18 but no unit or definition. Asked whether +615.74 is upgrade delta or per-minute rate before deriving a formula.
<!-- SECTION:NOTES:END -->

