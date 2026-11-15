---
id: VHE-40Y50X
title: Fix Teams tab reduce crash with object-shaped cached teams
status: done
priority: high
labels: []
createdAt: '2026-11-14T18:43:54.482Z'
updatedAt: '2026-11-14T18:59:56.020Z'
completedAt: '2026-11-14T18:59:56.020Z'
timeSpent: 344
---
# Fix Teams tab reduce crash with object-shaped cached teams

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports blank Teams tab and TypeError e.reduce is not a function alongside CACHE_HEROES_UPDATED. Investigate after auto free spin implementation; normalize actual collection shapes and add regression for the rendered Teams tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reproduce the Teams reduce crash using actual object-shaped team/member data and identify the failing call path.
- [x] #2 Normalize hero/titan/server/custom team member collections at boundaries, preserving team membership and power, while invalid/null data remains harmless.
- [x] #3 Render the actual Teams component with object-shaped fixtures and hero cache refresh; pass regression tests, typecheck and build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect Teams getTeamPower call sites and captured teamGetAll/custom team shapes. 2. Reproduce with compiled Vue rendering; normalize the specific faulty member paths. 3. Add actual render/power regression and run checks; document root cause and finish.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: TeamsTab.getTeamPower reduced custom team heroIds directly; object-shaped nested member storage reaches that call although outer teams are normalized. CACHE_HEROES_UPDATED is informational. Reproduced using object-shaped legacy fixtures; the user's exact custom storage was not supplied. Added teamMemberIds/serverTeamGroups normalization at account load/save, server team groups, edit and power boundaries, preserving hero/titan membership and ignoring invalid values. Actual compiled Teams render and actual Chrome storage refresh prove power 3000 -> 9000 with no runtime exceptions. Evidence: docs/acceptance/teams-2026-11-15.json (Chrome, extension 0.10.88, local fixture). Verification: full suite 806 tests, 794 passed, 12 optional private-log skips; typecheck and production build passed at 0.10.88. Review: PASS. SpecDecisionCompliance: N/A, defect repair under existing normalization conventions. SystemDecisionImpact: none. Durable guidance: @doc/architecture/wxt-vue-tailwind-conventions; memory-5uxy0w.
<!-- SECTION:NOTES:END -->

