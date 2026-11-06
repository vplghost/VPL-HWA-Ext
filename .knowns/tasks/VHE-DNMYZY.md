---
id: VHE-DNMYZY
title: Add daily activity dashboard
status: done
priority: medium
labels: []
createdAt: '2026-11-06T11:14:13.132Z'
updatedAt: '2026-11-06T11:18:25.805Z'
completedAt: '2026-11-06T11:18:25.805Z'
timeSpent: 0
---
# Add daily activity dashboard

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show a first-tab daily dashboard based on passive game RPC data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard is first and opens by default while existing tab preferences remain usable
- [x] #2 Activities, daily quests, and unclaimed free gifts are shown in priority order with honest unknown states
- [x] #3 Relevant passive RPC snapshots update the dashboard and verification passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map observed RPC fields and current tab/cache behavior. 2. Cache Arena, Expedition, Daily Bonus and Zeppelin gift snapshots. 3. Add a pure daily dashboard model and render a first-tab overview. 4. Test status extraction, tab migration and run project checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented first-tab Dashboard, passive Arena/Expedition/Daily Bonus/Zeppelin snapshots, grouped daily model and UI. Verification: npm run check passed 296 tests and built v0.9.80; git diff --check passed. System Decision Impact: candidate @decision/20261106-1818-daily-dashboard-uses-observed-game-snapshots (added) — daily tracking uses same-day observed snapshots and conservative states.
<!-- SECTION:NOTES:END -->

