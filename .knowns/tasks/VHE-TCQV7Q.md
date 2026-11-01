---
id: VHE-TCQV7Q
title: English UI and timed resource eligibility
status: done
priority: high
labels: []
createdAt: '2026-11-01T12:25:09.971Z'
updatedAt: '2026-11-01T12:39:31.307Z'
completedAt: '2026-11-01T12:39:31.307Z'
timeSpent: 0
---
# English UI and timed resource eligibility

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All extension-facing UI text and displayed game asset names use English
- [x] #2 Resource checkboxes appear only for balances that increase over time, including verified skill points and Realm production materials
- [x] #3 Energy uses verified 6-minute refill and team-level cap, with periodic updates and latest API snapshot priority
- [x] #4 Tests, docs, build, and validation pass
- [x] #5 Hero and Titan Star columns show colored star icons with contrast shadow while retaining numeric sort
- [x] #6 Selected header resources show icon, color, and an English tooltip
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify refillable.json and level_teamDelta.json from the game asset archive plus official support rules. 2. Add bounded timing metadata for Energy and skill points, classify producer-backed materials as eligible without inventing stock gains. 3. Convert every extension UI string and asset-name anomaly to English. 4. Test timing/eligibility/localization, update docs and validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User expanded scope to colored star icons and styled selected resource badges with tooltips. Verified refillable.json, level_teamDelta.json, resourceProducer config, and official Hero Wars support. Energy/Skill Points timing metadata, produced material eligibility, English UI and game-name corrections implemented; final verification pending.

Verified game WebGL 1.292.0 splitlib/refillable.json: Energy id1 360s, Skill Points id2 300s; level_teamDelta.json maxStamina=60+level except level1=60. Official HWA support corroborates. ResourceProducer config maps materials 1-5 to autonomous/resident production; collected inventory remains API snapshot. Popup translated to English, locale anomalies normalized, eligible-only checkboxes, header icon/color/tooltips, Energy cap/countdown, star icons. npm run check 34/34; Edge browser proof: 4 eligible checkboxes (skill points/stone/wood/food), no Gold/Energy checkbox, five star colors and shadow. System Decision Impact: candidate @decision/20261101-1936-extension-ui-and-displayed-game-names-use-english (added) — English UI and eligible resource selection.
<!-- SECTION:NOTES:END -->

