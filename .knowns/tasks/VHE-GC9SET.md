---
id: VHE-GC9SET
title: Keep healing feedback from shifting the Dashboard layout
status: done
priority: medium
labels: []
createdAt: '2026-11-13T17:23:21.596Z'
updatedAt: '2026-11-13T17:25:15.205Z'
completedAt: '2026-11-13T17:25:15.205Z'
timeSpent: 33
---
# Keep healing feedback from shifting the Dashboard layout

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The conditional Healing completion requested status paragraph pushes Dashboard troop UI when inserted. Place feedback beside the healing action area in an always-sized status region, readable on narrow screens and accessible, without changing healing RPC logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Healing status has a stable position near healing actions and appearing/wrapping text does not push troop content.
- [x] #2 Healing interactions remain unchanged; appropriate checks and versioned production build pass and changes are committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the conditional heading-level message into an always-present two-line status footer below the troop cards. 2. Verify the fixed-height scrollable live region keeps card/header positions stable, preserve healing logic, then typecheck/build/version and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Layout-only fix: footer below troop cards reserves h-8 with leading-4, scrolls unusually long messages rather than resizing the section, and retains role=status with polite atomic announcements. No healing/composable logic changes; no new tests for this reversible placement change.

Review PASS:P1=0,P2=0,P3=0. Message now follows troop cards in a permanently mounted h-8/leading-4 live region with overflow scrolling, so empty, short and wrapped status text keep surrounding geometry unchanged. Seven existing healing/troop tests pass; typecheck and0.10.67build passed. System Decision Impact: none — placement/accessibility styling only, with no healing RPC or cache behavior changes.

Committed layout-only status placement fix, changelog and0.10.67build after focused regression/typecheck/build verification. Final task state folded into the same commit; pre-existing staged empty TypeScript LSP log remains untouched.
<!-- SECTION:NOTES:END -->

