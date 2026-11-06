---
id: VHE-2D129Z
title: Them ten doi hinh, tien do soul stone va nut mo popup trong tab
status: done
priority: medium
labels: []
createdAt: '2026-11-01T10:43:50.030Z'
updatedAt: '2026-11-06T10:31:31.298Z'
completedAt: '2026-11-01T10:46:44.118Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:31.298Z'
---
# Them ten doi hinh, tien do soul stone va nut mo popup trong tab

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Teams hien ten heroes/titans cho doi phang va doi long nhau, giu ID va fallback khi thieu ten
- [x] #2 Heroes hien soul stone hien co / so can cho bac sao tiep theo tu inventory va bang gia game, xu ly thieu snapshot va sao toi da
- [x] #3 Nut canh HWA Helper mo popup trong tab trinh duyet
- [x] #4 Test, tai lieu va build duoc cap nhat
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Xac minh teamGetAll, inventoryGet.fragmentHero va enum_evolutionStar trong asset game. 2. Them ham dinh dang teams va tien do soul stone; cap nhat popup va nut mo tab. 3. Cap nhat tai lieu va test cho doi long nhau, fallback, thieu inventory va sao toi da. 4. Chay npm run check va knowns validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified enum_evolutionStar.json inside splitlib ZIP against indexGet size/MD5; next-star fragment costs 20/50/100/150/300. Added local popup-data helpers for team names and soul progress, browser-tab button, version 0.4.0, docs and tests. npm run check: 27 passed and build succeeded; knowns validate: 0 errors. Manual Chrome UI check remains for user after reload.
<!-- SECTION:NOTES:END -->

