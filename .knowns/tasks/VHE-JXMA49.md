---
id: VHE-JXMA49
title: Derive troop stock limits from confirmed Drill Grounds levels
status: done
priority: medium
labels: []
createdAt: '2026-11-13T12:47:26.093Z'
updatedAt: '2026-11-13T12:54:32.898Z'
completedAt: '2026-11-13T12:54:32.898Z'
timeSpent: 354
---
# Derive troop stock limits from confirmed Drill Grounds levels

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace estimated stock limits in troops utilities with verified cumulative unitsCapacity bonuses granted by confirmed Drill Grounds/Camp building levels. Keep unknown data explicit and training bounded; preserve real limits when stock exceeds them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Troop stock limit uses confirmed levels of the corresponding Drill Grounds/Camp and verified config bonus values, never queued target levels.
- [x] #2 No guessed 10,000 fallback, arbitrary linear level formula or forced inflation to current stock remains; unknown limits prevent automatic training.
- [x] #3 Dashboard and training react to confirmed construction completion and supported research/direct snapshots with meaningful regression coverage.
- [x] #4 Tests, typecheck and production build pass; version/changelog updated and completed changes committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract verified building-level capacity bonus tables and relevant research bonuses from captured immutable game configs. 2. Replace estimated max logic with confirmed levels and supported direct limits, update troop overview/training unknown/overflow behavior. 3. Test per-type mappings, upgrades, research, over-limit and missing snapshots; build version/changelog and commit after completion per user instruction.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Generated cumulative stock capacity tables from MD5-verified immutable buildingLevel, bonus and unitsCapacityBonusMap configs. All stock-capacity building IDs are Camps40/41/42 and Drill Grounds182/183/184; summed completed level rewards per type. Removed guessed linear formula, research trainingCapacity mix-up and inflation to current stock. Unknown/unsupported building levels yield null and stop training, overflow retains true cap, troop refresh requests building summary. Three behavioral regressions added including actual training setup; legacy incorrect expectations and rejection fixture corrected. Validation: full suite 636 total / 624 pass / 12 optional private-data skips / 0 failures; typecheck/build passed. Version0.10.56 and changelog ready; explicit standing user instruction authorizes commit after completion.
System Decision Impact: candidate @decision/20261113-1953-use-verified-building-bonuses-for-troop-stock-limits (added) — verified per-building stock bonus model, unknown state and separate capacity concepts.

Committed verified troop stock limits and 0.10.56 release artifacts. Final task closure metadata is included by amending this unpublished commit; unrelated staged LSP log remains excluded.
<!-- SECTION:NOTES:END -->

