---
id: VHE-3EN247
title: Hero artifact 5-color breakpoints, capped resource ping highlight, and item assets in inventory
status: done
priority: medium
labels: []
createdAt: '2026-11-02T23:51:48.562Z'
updatedAt: '2026-11-06T10:31:31.488Z'
completedAt: '2026-11-02T23:53:35.762Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:31.488Z'
---
# Hero artifact 5-color breakpoints, capped resource ping highlight, and item assets in inventory

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied 5-tier color scale to Hero artifacts (1-25 gray, 26-50 green, 51-70 blue, 71-85 violet, 86-100 orange) with gray instead of pure white for tier 1 and 1-star starIcons. Highlighted capped and maximum resources with hwa-mail-dot-ping animation on Energy, World Energy, and header resource pills. Extracted 101 item asset PNGs from CDN via generate-item-assets.mjs, and rendered borderless inventory grid with item icons and full in-game names in tooltips. Version bumped to v0.9.33.
<!-- SECTION:NOTES:END -->

