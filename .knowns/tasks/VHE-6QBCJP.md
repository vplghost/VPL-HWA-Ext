---
id: VHE-6QBCJP
title: Render and farm complete nested equipment recipe trees
status: done
priority: medium
labels: []
createdAt: '2026-11-13T07:04:42.571Z'
updatedAt: '2026-11-13T07:11:57.426Z'
completedAt: '2026-11-13T07:11:57.426Z'
timeSpent: 385
---
# Render and farm complete nested equipment recipe trees

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Campaign Raid & Equipment Farm only renders root and direct children, hiding nested components such as World Tremor→Trine→gear94/95/96. Show full recursive tree with per-branch selection and matching farm/progress/craft actions; correct owned-parent traversal and quantity requirements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 World Tremor→Trine→all nested ingredients renders without a fixed depth limit.
- [x] #2 Any nested farmable node selects matching category/missions and tracks requirements/auto-stop; composite-only nodes cannot raid unrelated missions.
- [x] #3 Craft actions work at every depth and inventory/quantities/repeated components are handled without false fulfillment or infinite cycles.
- [x] #4 Regression tests, typecheck and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce World Tremor (131)→Trine (127)→94/95/96 with packaged recipe data and verify current one-level template limit.
2. Build a reusable recursive recipe model with branch/category keys, quantity propagation, inventory allocation and cycle protection; preserve metadata exports.
3. Render recursive RecipeTreeNode rows with propagated select/craft events and per-node actions at any depth.
4. Connect selected branch to matching drop category/missions, target progress, auto-stop and craft; block unrelated fallback raids for nonfarmable composite nodes.
5. Add runtime tree/render/selection/farm regression tests including repeated ingredients, owned parents and deeper recipes; run full tests, typecheck/build and document outcomes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: CampaignRaidModal template rendered root and recipeTree.children only; nested data existed (World Tremor 131→Trine 127→94/95/96), so nested components had no UI/actions. Replaced with recursive RecipeTreeNode and testable recipeTree utility re-exported from metadata. Category/path keys isolate repeated IDs. Propagated quantities for missing copies, reserved shared inventory once, skipped fulfilled parents in automatic selection and protected cycles. Deep selection resolves correct numeric ID/drop category, mission candidates, progress and sequential auto-stop. Nonfarmable composite nodes block unrelated raids; craft events and category payloads propagate at every depth. Tests include actual compiled recursive Vue rendering/events and actual dialog setup/loop auto-stop.
Validation: full suite 594 tests, 582 pass, 12 optional-data skips; typecheck pass; final nested regressions pass; build/artifact validation pass. Live game visual/craft acceptance not run. See @doc/architecture/campaign-recursive-recipe-farming.
System Decision Impact: candidate @decision/20261113-1411-use-branch-identities-and-allocated-stock-for-recursive-recipe-farming (added) — full recursive farming with branch identity and shared inventory allocation.
<!-- SECTION:NOTES:END -->

