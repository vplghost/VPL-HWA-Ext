---
id: VHE-PJJD5V
title: Sync x-request-id counter to prevent server rejection, fix auto-claim UI update, and implement inventory grid view for items
status: done
priority: high
labels: []
createdAt: '2026-11-02T18:03:39.107Z'
updatedAt: '2026-11-02T18:19:44.309Z'
completedAt: '2026-11-02T18:19:44.309Z'
timeSpent: 0
---
# Sync x-request-id counter to prevent server rejection, fix auto-claim UI update, and implement inventory grid view for items

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Synced x-request-id counter globally between Unity game client and extension RPC dispatches via sessionStorage and xhr.setRequestHeader rewrite, preventing 'Request id less then cached request id' server error. Fixed auto-claim UI update with unconditional api-record dispatch and optimistic popup cache refresh. Implemented inventory-style borderless grid view for tab Items with group dividers sorted in-game order (consumables, equipment, recipes, soul stones, resources), item abbreviations on top-left, quantities on bottom-right, full tooltips, and grid/list view switcher (persisted, defaulting to grid). Version bumped to v0.9.31.
<!-- SECTION:NOTES:END -->

