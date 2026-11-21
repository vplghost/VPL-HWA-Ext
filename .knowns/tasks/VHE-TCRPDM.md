---
id: VHE-TCRPDM
title: Implement batched RPC calls for Start Available and Claim All in ExpeditionsModal
status: done
priority: high
labels:
  - feature,ui,expeditions
createdAt: '2026-11-21T05:26:04.022Z'
updatedAt: '2026-11-21T05:29:56.551Z'
completedAt: '2026-11-21T05:29:56.551Z'
timeSpent: 0
---
# Implement batched RPC calls for Start Available and Claim All in ExpeditionsModal

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 startAvailable batches all planned expeditionStart calls into a single dispatchRpc call
- [ ] #2 Add Claim All button that batches all ready expeditionFarm calls into a single dispatchRpc call
- [ ] #3 Implement comprehensive UI lock and busy overlay across all participating slots during batch actions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented batched startAvailable and collectAll RPC calls in ExpeditionsModal.vue with proper UI locking
<!-- SECTION:NOTES:END -->

