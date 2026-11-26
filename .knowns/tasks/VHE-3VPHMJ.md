---
id: VHE-3VPHMJ
title: 'P2-23 Goals Tab Actionability & True Cross-Event Synergy'
status: done
priority: medium
labels:
  - p2
  - goals
  - ux
  - backlog
createdAt: '2026-11-26T08:24:36.063Z'
updatedAt: '2026-11-26T08:29:23.649Z'
completedAt: '2026-11-26T08:29:23.649Z'
timeSpent: 0
---
# P2-23 Goals Tab Actionability & True Cross-Event Synergy

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Separate completed/unavailable daily goals into a bottom section, fix false same-event equip/gather synergy, and detect daily exhaustion for Tower, Arena, Grand Arena, Expedition, Daily Quests, Daily Sign In, Guild War, and Dungeon.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AC1: True cross-event synergy (no false 6x equip item synergy; overlapCount counts distinct events)
- [ ] #2 AC2: Daily availability detection for Tower, Arena, Grand Arena, Expedition, Daily Quests, Daily Sign In, Guild War, and Dungeon
- [ ] #3 AC3: Actionable-first sorting, dedicated #goals-unavailable-section at bottom of GoalsTab.vue, accurate KPIs, and 100% English .vue text
- [ ] #4 AC4: Unit tests in tests/popup-data.test.mjs & tests/wxt-vue-frontend.test.mjs, npm test 0 fail, npm run build green
<!-- AC:END -->

