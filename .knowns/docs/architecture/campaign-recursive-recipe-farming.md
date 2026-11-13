---
id: doc-d2ce4b79d854efdf4c5ba3a80cde1221
title: Campaign Recursive Recipe Farming
description: Recursive equipment recipe rendering, branch-specific inventory allocation, mission targeting, crafting and farm auto-stop behavior.
createdAt: '2026-11-13T07:11:00.161Z'
updatedAt: '2026-11-13T07:11:00.161Z'
tags:
  - campaign
  - recipes
  - farm
---

## Model and rendering

Implemented in @task-VHE-6QBCJP.

The packaged data defines World Tremor (gear 131) as gear 94 + Trine (127) + scroll 161. Trine requires gear 94, 95 and 96. The old Vue dialog only rendered root and direct children even though its gear model could descend further.

`src/utils/recipeTree.ts::buildGearRecipeTree` builds gear and scroll dependencies recursively. `RecipeTreeNode.vue` renders every level and forwards select/craft events to CampaignRaidModal. There is no fixed presentation depth. Path/category keys distinguish repeated IDs, such as the direct gear 94 and the gear 94 under Trine, as well as gear versus scroll with the same numeric ID. Ancestor cycles produce an unavailable node and cannot be used to prove craft readiness.

## Requirements and inventory

- Start with one requested root item.
- Reserve owned stock once, in recipe traversal order, so sibling branches cannot both spend the same item/fragments.
- Expand descendant quantities only for missing parent copies. Multiply ingredient and fragment requirements through all levels.
- Keep the complete displayed recipe even when a parent is already owned; its descendants then have zero outstanding requirement and are skipped during automatic missing-item selection.
- A craftable missing node is selected before descending further. Existing gold/craft server validation remains authoritative; the UI model does not promise a successful server craft.
- The Available count on a row is inventory after stock allocated to earlier branches. `inventoryOwned` retains the physical total. Shared ingredients must be acquired for every required occurrence.

## Farming and crafting

`CampaignRaidModal` stores the selected branch key, resolves the node, and uses the node's item ID plus exact drop category (`gear`, `scroll`, `fragmentGear`, `fragmentScroll`) for mission candidates and session drop counts. Do not pass a path key to campaign item lookup and do not sum unrelated categories that share an ID.

Composite nodes without direct drops display guidance to select a component. Their raid controls cannot launch the previous unrelated mission. The sequential loop uses the same selected path to check fresh inventory and stops at its requirement. A fully owned item also satisfies the target even when fragment counts are zero.

Every depth supports Craft, using `inventoryCraftFragments` for fragment-backed nodes and `inventoryCraftRecipe` for component-backed nodes, with the node's category. Selection, crafting and mission changes are restricted during a raid run.

## Verification

`tests/nested-recipe.test.mjs` uses packaged World Tremor/Trine data, repeated ingredients, owned-parent and multiplicity cases, synthetic deeper/cyclic recipes, compiled Vue recursive rendering and event propagation. It executes the actual dialog setup to verify nested mission selection, category-specific progress and sequential farm auto-stop. Existing campaign tests remain in place. Live in-game visual/craft acceptance is separate from automated verification.
