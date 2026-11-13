---
id: 20261113-1411-use-branch-identities-and-allocated-stock-for-recursive-recipe-farming
title: Use branch identities and allocated stock for recursive recipe farming
status: draft
supersedes: []
supersededBy: []
tags: []
sources:
  - '@task-VHE-6QBCJP'
  - '@doc/architecture/campaign-recursive-recipe-farming'
  - 'src/utils/recipeTree.ts::buildGearRecipeTree'
  - tests/nested-recipe.test.mjs
relatedDocs:
  - architecture/campaign-recursive-recipe-farming
relatedTasks:
  - VHE-6QBCJP
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-6QBCJP" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '73af7668c7c3aa36bd16b20f4328c716ca51aaf53a99be1f803202fe48ba6a73'
reviewEvaluatedAt: '2026-11-13T07:11:57.053Z'
createdAt: '2026-11-13T07:11:57.053Z'
updatedAt: '2026-11-13T07:11:57.053Z'
---

## Context

Fixes missing World Tremor→Trine descendants and their farm/craft controls in CampaignRaidModal.

## Decision

Render complete gear/scroll recipe dependencies recursively. Identify selected nodes by category-qualified path, resolve numeric item/category for mission and craft RPCs, and reserve shared owned stock once across branches. Only missing parent copies create descendant requirements. Farm progress and auto-stop must use the selected branch and exact drop category; composite nodes without campaign drops must not raid an unrelated previous mission.

## Alternatives Considered


## Consequences
