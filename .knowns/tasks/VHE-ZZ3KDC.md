---
id: VHE-ZZ3KDC
title: Deduplicate Resources against Items and compact the resource grid
status: done
priority: medium
labels: []
createdAt: '2026-11-13T17:17:44.589Z'
updatedAt: '2026-11-13T17:21:39.728Z'
completedAt: '2026-11-13T17:21:39.728Z'
timeSpent: 157
---
# Deduplicate Resources against Items and compact the resource grid

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hide exact category/ID entries already listed with positive quantity in Items from the Resources view and its filtered export. Keep balances that have no Items row. Use a responsive denser grid that adapts to available width, preserves header pin preferences and makes counts/search/pinned filter consistent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resources excludes exact entries actually present in Items while retaining unmatched resources and other categories with the same numeric ID.
- [x] #2 Search, pinned count/filter and export reflect the deduplicated list; existing header pin preferences remain saved; grid/toolbar adapt to available width.
- [x] #3 Meaningful regression checks, typecheck and versioned production build pass; changes are committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Match Resources against Items inventory semantics by category/ID and positive quantity, retaining unmatched currencies/materials/refillables. 2. Apply filtering consistently to view, pinned count and export; compact the responsive grid/toolbar. 3. Verify real SFC state/rendering, cross-category collisions, inventory changes and export/pin behavior; typecheck/build/version/docs and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented isListedInventoryItem matching ItemsTab category/ID and positive-stock semantics. Resources hides only exact duplicates, reacts to inventory arrival/removal, retains unmatched balances and never deletes cached data/header pins. Search/pinned count/filter/export use the same derived list. Grid uses auto-fill minmax(min(100%,12rem),1fr), compact cards/icon-only accessible pins and wrapping toolbar. Actual SFC state/template tests cover collisions, absent inventory, late changes, filtered exports, pin preferences and DOM. Full suite682:670pass,0fail,12optional skips; typecheck passed.

Review PASS:P1=0,P2=0,P3=0. Typecheck and production build0.10.66 passed; compiled grid CSS verified. No live browser visual inspection was performed; actual template SSR and state tests pass. System Decision Impact: none — this is tab-level deduplication/layout using existing cache mirrors and Items semantics; it does not change cache ownership, header pin selection or RPC policy.

Completed and committed Resources/Items deduplication, compact responsive UI, matching exports/counts, regression tests, documentation and0.10.66release artifacts. Final task state folded into the same commit; unrelated staged empty TypeScript LSP log remains outside it.
<!-- SECTION:NOTES:END -->

