---
id: VHE-Y87CFH
title: P1-15 Fix Raid/Monster Queue Stuck on Gathering Recall Error
status: done
priority: high
labels:
  - p1
  - raid
  - smart-gather
  - bug
  - backlog
createdAt: '2026-11-26T13:56:48.643Z'
updatedAt: '2026-11-26T13:59:39.129Z'
completedAt: '2026-11-26T13:59:39.129Z'
timeSpent: 0
---
# P1-15 Fix Raid/Monster Queue Stuck on Gathering Recall Error

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix recallForQueue() and returnMs() in smartGather.ts so returning/in-combat squads do not trigger false 'No gathering squad with known coordinates can release the required slot/heroes' errors, add center coordinate fallbacks, and guard waiting_gather timeout in advanceGatherQueue().
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AC1: Returning/non-gathering squad holding needed heroes returns null from recallForQueue() instead of false error
- [ ] #2 AC2: returnMs() falls back to options.center and returnToOutpost.to.coordinates when experimentalMapContext center is missing
- [ ] #3 AC3: No unnecessary gathering recall when needed is empty and a march is already returning to outpost
- [ ] #4 AC4: Unit tests pass (npm test 0 fail) and npm run build succeeds
<!-- AC:END -->

