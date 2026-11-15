---
id: VHE-E0751C
title: Capture exact solo monster target variant identity for power comparison
status: on-hold
priority: medium
labels: []
createdAt: '2026-11-14T23:34:25.071Z'
updatedAt: '2026-11-14T23:34:25.071Z'
timeSpent: 0
---
# Capture exact solo monster target variant identity for power comparison

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Future enhancement to @task-VHE-ZP1CW2: solo search replies in the available capture omit variant/config/preset identity, so the dialog intentionally shows both level presets. Needs a game capture connecting target mobId to authoritative mobConfigId/predefinedSquadId for normal/PvP targets, and a verified config mapping if only config ID is supplied. CDN globalMapMobSolo was unreachable during implementation. Do not infer numeric mapping or send guessed detail RPCs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Capture identifies a target mobId and its exact normal/PvP predefined squad at supported levels.
- [ ] #2 Account/map-scoped detail extraction and dialog select the exact preset while preserving dual-preset fallback for unknown targets.
<!-- AC:END -->

