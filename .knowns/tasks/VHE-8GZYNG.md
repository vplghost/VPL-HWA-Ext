---
id: VHE-8GZYNG
title: Update expeditions unit tests for batched calls and UI locking verification
status: done
priority: high
labels:
  - test,expeditions
createdAt: '2026-11-21T05:26:04.410Z'
updatedAt: '2026-11-21T05:29:56.942Z'
completedAt: '2026-11-21T05:29:56.942Z'
timeSpent: 0
---
# Update expeditions unit tests for batched calls and UI locking verification

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Verify startAvailable dispatches a single batched RPC request with all planned slots
- [ ] #2 Verify collectAll dispatches a single batched RPC request with all ready slots
- [ ] #3 Verify UI lock and slot busy states during batch operations
- [ ] #4 All unit tests pass and build succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added unit tests verifying batched startAvailable, collectAll, and slot UI locking states; all tests passing
<!-- SECTION:NOTES:END -->

