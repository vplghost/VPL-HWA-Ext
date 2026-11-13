---
id: m735vx
title: Nested recipe rendering needs branch-specific farming targets
key: nested-recipe-rendering-needs-branch-specific-farming-targets
layer: project
category: failure
status: active
lastVerified: '2026-11-13T07:11:57.152Z'
sources:
  - '@task-VHE-6QBCJP'
  - '@doc/architecture/campaign-recursive-recipe-farming'
  - tests/nested-recipe.test.mjs
tags:
  - campaign
  - recipes
  - debug
createdAt: '2026-11-13T07:11:57.152Z'
updatedAt: '2026-11-13T07:11:57.152Z'
---

CampaignRaidModal previously rendered only root/direct children even when buildGearRecipeTree contained deeper recipes. RecipeTreeNode now renders recursively; recipeTree.ts uses category/path keys so repeated ingredients such as World Tremor's direct gear 94 and Trine's gear 94 stay distinct. Mission lookup must use the resolved item ID/drop category, while progress/auto-stop resolve the selected path. Shared inventory must be reserved once across recipe branches.
