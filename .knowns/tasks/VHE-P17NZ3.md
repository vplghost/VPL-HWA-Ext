---
id: VHE-P17NZ3
title: "[P2-16] Hero Detail Dialog UI: Unified Upgrades Tab & Consistent Icon+Count Resource Bars"
status: done
priority: medium
labels:
  - backlog
  - p2
  - hero-dialog
createdAt: '2026-11-25T18:03:13.214Z'
updatedAt: '2026-11-25T18:05:23.741Z'
completedAt: '2026-11-25T18:05:23.741Z'
timeSpent: 0
---
# [P2-16] Hero Detail Dialog UI: Unified Upgrades Tab & Consistent Icon+Count Resource Bars

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #hero-detail-subtabs consolidated to 2 tabs (Core and Upgrades) showing Artifacts, Skins, and Glyphs/Sparks together with combined upgrade badge
- [x] #2 Artifacts, Skins, and Glyphs/Sparks cards use consistent subtitle-under-title left header and icon+count resource bar right header (#hero-artifacts-resource-bar, #hero-glyphs-resource-bar)
- [x] #3 Individual artifact cards display compact icon+cost/owned instead of verbose material text; all tests and dual-build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
v0.11.324: Consolidated 2-tab Core + Upgrades layout and consistent icon+count resource bars (#hero-artifacts-resource-bar, #hero-glyphs-resource-bar) in HeroDetailModal.vue; 1310/1310 tests pass, dual-build verified.
<!-- SECTION:NOTES:END -->

