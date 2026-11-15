---
id: VHE-ZP1CW2
title: Compare selected monster squad power and warn before dispatch
status: done
priority: medium
labels: []
createdAt: '2026-11-14T23:27:15.590Z'
updatedAt: '2026-11-14T23:34:52.742Z'
completedAt: '2026-11-14T23:34:52.742Z'
timeSpent: 440
---
# Compare selected monster squad power and warn before dispatch

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apply verified hero and troop power calculations to solo monsters in the Monster dialog after team selection and level search. Compare both known level variants when target identity is missing, show incomplete data explicitly, and warn without changing attack queue behavior. Reuse @doc/api/world-map-rpc-contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dialog compares selected heroes, allocated troops and total with the selected monster; updates on team, level, target and roster changes.
- [x] #2 Warn immediately for a weaker complete squad and disclose partial or unknown power without claiming victory; stale search levels cannot drive the comparison.
- [x] #3 Power and actual dialog regressions, typecheck and production build pass.
- [x] #4 Verified packaged solo monster presets cover both normal and PvP variants for levels 1-30; unidentifiable search variants are compared separately rather than invented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify solo config, preset hero power and troop composition with existing hash-checked generator. 2. Package solo power and add shared selected-squad comparison using the exact allocated troops. 3. Render a reactive comparison and advisory warning in MonsterModal, guarded by matching searched level and selected target. 4. Add math and actual component regressions; run tests/typecheck/build, update docs and record decision impact.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Capture hwa-game-record-202611051201_attack_monster confirms searchMob returns only mobId/coordinates, no variant/config/predefinedSquadId; getSoloAttackDefenders later identifies preset109 for the selected target. CDN solo config currently unreachable (DNS/connect timeout). Use hash-verified predefinedSquad labels plus heroes preset to package both solo variants per level, compare both when variant is unknown, and resolve an explicitly supplied predefinedSquadId only if level matches. No guessed mapping or rally boss fallback. Plan updated accordingly.

Implemented 60 verified solo presets (normal/PvP levels1-30), allocated-only own squad power, reactive pre-dispatch comparison, weaker and incomplete-data warnings. No numeric variant mapping or rally fallback. Unknown variants display both presets; captured getSoloAttackDefenders demonstrates why hero preset power must not be described as the sum of buffed battle defenders. Exact variant enhancement awaits capture in @task-VHE-E0751C. Verification: full811 tests,799 pass,12 optional private-log skips; typecheck and build passed. Actual Chrome0.10.89 local fixture: weak team warns, selecting stronger team updates, level change hides stale comparison, cache refresh with missing hero marks400k+; zero runtime errors. Evidence docs/acceptance/monster-power-2026-11-15.json. Review: code quality, architecture, security and completeness checked; no unresolved P1/P2. Spec Decision Compliance: N/A, no linked spec. System Decision Impact: candidate @decision/20261115-0633-compare-unidentified-solo-monster-variants-separately-using-packaged-preset-power (added), kept draft.
<!-- SECTION:NOTES:END -->

