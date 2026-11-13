---
id: VHE-MRKTAF
title: Unify absolute star display for heroes and titans
status: done
priority: medium
labels: []
createdAt: '2026-11-13T18:09:15.371Z'
updatedAt: '2026-11-13T18:12:19.866Z'
completedAt: '2026-11-13T18:12:19.836Z'
timeSpent: 170
---
# Unify absolute star display for heroes and titans

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use one stylized absolute star for six-star heroes and titans across roster cards/tables, details, hover cards and combat dialogs, matching legacy HTML. Preserve artifact and battle-result star displays.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All hero/titan displays use a single stylized star at six stars, with accessible rating labels and existing lower ratings preserved.
- [x] #2 Relevant checks and versioned build pass and changes committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory unit-star rendering and legacy absolute-star styling. 2. Introduce shared unit-star component and update all hero/titan star displays. 3. Verify relevant UI regressions, typecheck/build, release and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented UnitStars.vue using the exact legacy starIcons justice-star vector and accessible6-star Absolute label. Updated11 unit-rating sites across Heroes/Titans roster tables/cards, both hover cards, HeroDetail,3Draft lineups and Dungeon enemies. Repeated1–5star views and compact prefix/suffix forms preserved; artifacts, battle-result stars, favorite toggles and star glows remain separate. Removed duplicated detail SVG constant. Component SSR tests compare exact legacy path and verify one SVG/no repeated stars at6, lower rating forms, and actual Dungeon6-star integration. Updated old frontend parity assertion to shared component. Final693tests:681pass,0fail,12optional skips; typecheck and version0.10.70 production build passed. Review PASS with no findings; scan found no remaining raw unit-rating star displays. System Decision Impact: none — consolidates the established legacy Absolute-star presentation without changing rating data or gameplay behavior.
<!-- SECTION:NOTES:END -->

