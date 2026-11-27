---
id: VHE-XBZ68W
title: 'P2-40: Raid Dialog — 1-Row Boss/Target/Rounds, Detached Auto-Raid Card & Zero-Jump Status Footer'
status: done
priority: medium
labels: []
createdAt: '2026-11-27T18:10:37.023Z'
updatedAt: '2026-11-27T18:12:23.435Z'
completedAt: '2026-11-27T18:12:23.435Z'
timeSpent: 0
---
# P2-40: Raid Dialog — 1-Row Boss/Target/Rounds, Detached Auto-Raid Card & Zero-Jump Status Footer

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compact Boss Level + Find, Target, and Rounds onto 1 row (#raid-params-row) with concise options, detach Auto Raid Energy into sibling #raid-auto-energy-section, and move StatusAlertBanner below pinned #raid-dialog-actions in #raid-dialog-footer with top-anchored backdrop to eliminate button jump.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #raid-params-row puts Level+Find, Target, and #raid-queue-count on one 12-col row with Lv. N and #N · (x, y) options
- [x] #2 #raid-auto-energy-section is a detached sibling section outside Section 2, and #raid-dialog-footer pins #raid-dialog-actions above StatusAlertBanner with zero button jump
- [x] #3 Unit tests updated, npm test (0 fail) and npm run build (dist/ + .output/chrome-mv3/) pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented P2-40 (v0.11.390): compacted Level+Find, Target, and Rounds onto 1 row (#raid-params-row) with concise Lv. N and #N · (x, y) options in RaidModal.vue, detached Auto Raid Energy into sibling #raid-auto-energy-section, and pinned #raid-dialog-footer with #raid-dialog-actions above StatusAlertBanner and top-anchored backdrop for zero button jump. Verified 1,369 pass / 0 fail + dual build.
<!-- SECTION:NOTES:END -->

