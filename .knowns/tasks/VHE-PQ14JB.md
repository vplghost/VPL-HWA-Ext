---
id: VHE-PQ14JB
title: 'Dungeon: correlate pre-battle stats, enforce healer-only recovery rules, and handle fatal damage in simulation dungeon,simulation'
status: done
priority: high
labels: []
createdAt: '2026-11-20T12:24:16.960Z'
updatedAt: '2026-11-20T12:29:30.997Z'
completedAt: '2026-11-20T12:29:30.997Z'
timeSpent: 0
assignee: '-l'
---
# Dungeon: correlate pre-battle stats, enforce healer-only recovery rules, and handle fatal damage in simulation dungeon,simulation

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Define HEALING_TITAN_IDS and hasHealingTitan helper
- [x] #2 Correlate HP reduction with pre-battle HP and cap non-healer recovery at pre-battle HP
- [x] #3 Auto-detect fatal damage, adjust star rating (2/1 stars), omit dead titans, and add spillover damage
- [x] #4 Add UI toggles for Healer Rule and Auto Death Detection, and show server rejection error banner
- [x] #5 Pass all unit tests and verify build
<!-- AC:END -->

