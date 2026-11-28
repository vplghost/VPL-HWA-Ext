---
id: VHE-74QW1N
title: 'P2-51: Titan Dialog UI Polish — Compact +1 & Next-10 Artifact Upgrade Milestone'
status: done
priority: medium
labels: []
createdAt: '2026-11-28T10:51:26.345Z'
updatedAt: '2026-11-28T10:54:51.870Z'
completedAt: '2026-11-28T10:54:51.870Z'
timeSpent: 0
---
# P2-51: Titan Dialog UI Polish — Compact +1 & Next-10 Artifact Upgrade Milestone

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add computeTitanArtifactLevelPlan pure helper in titanArtifactChestHelper.ts, remove redundant Level word from +1 Level buttons, add next-10 milestone upgrade button (+N -> M) with exact Dust/Gold cost gating and MAX badge in TitanDetailModal.vue, and add unit tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 computeTitanArtifactLevelPlan computes exact next-10 milestone (1->10, 10->20, 23->30), clamps to min(120, titanLevel), sums exact Dust+Gold costs, and gates affordability
- [x] #2 TitanDetailModal removes +1 Level wording, renders #btn-titan-art-lvl-* (+1) and #btn-titan-art-lvl-ten-* (+N -> M) + MAX badge with 100% English UI
- [x] #3 Unit tests (tests/titan-artifact-upgrade.test.mjs), full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-51 (v0.11.403): computeTitanArtifactLevelPlan in titanArtifactChestHelper.ts, compact +1 and next-10 milestone artifact upgrade buttons + MAX badge in TitanDetailModal.vue, tests/titan-artifact-upgrade.test.mjs (2/2 pass), full npm test (1406 pass / 0 fail), dual build (dist + .output/chrome-mv3).
<!-- SECTION:NOTES:END -->

