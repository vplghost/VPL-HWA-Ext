---
id: VHE-G0FP1G
title: Use searched boss list for sequential raid queue
status: done
priority: high
labels:
  - raid,queue
createdAt: '2026-11-06T14:50:35.448Z'
updatedAt: '2026-11-06T14:55:37.562Z'
completedAt: '2026-11-06T14:55:37.562Z'
timeSpent: 0
---
# Use searched boss list for sequential raid queue

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Persist the boss candidates from one search, consume them across wins and recoverable errors, search again only when candidates are exhausted, and stop on loss, insufficient World Energy, zero remaining wins or user cancellation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Queue stores remaining raid count and boss candidates with selected first target
- [x] #2 Winning and returning consumes one candidate and starts the next without searching while candidates remain
- [x] #3 Recoverable create errors skip the failed boss; exhaustion triggers one new search
- [x] #4 Loss, insufficient World Energy, or zero remaining raids stops dispatch
- [x] #5 Stop queue clears pending candidates and leaves an already active rally running
- [x] #6 Focused regression tests and full project check pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect existing state machine and energy cache; implement persisted boss queue and next-target transitions; update cancel semantics and UI status; test win/error/exhaustion/energy/stop and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persisted bossQueue {remain_raid_count, queue}, selected boss first, skip failed or cancelled boss without spending win count, and search only after candidates drain. Confirmed win plus return removes the active boss and decrements remaining count; loss and known World Energy below 25 stop dispatch. Explicit stop clears bossQueue while retaining current rally and never sends cancelRally. Legacy active states migrate in place. npm run check passed 304 tests and built v0.9.86. System Decision Impact: candidate @decision/20261106-2154-raid-queue-consumes-searched-bosses-before-searching-again (changed). Attempted Knowns CLI edit to api/world-map-rpc-contracts Sequential lifecycle twice; alternating canonical hash conflict prevented updating that older section, so the draft decision carries the new contract pending docs repair.
<!-- SECTION:NOTES:END -->

