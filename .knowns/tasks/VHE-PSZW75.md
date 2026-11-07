---
id: VHE-PSZW75
title: Add solo monster attack dialog and sequential queue
status: done
priority: medium
labels: []
createdAt: '2026-11-07T12:15:03.919Z'
updatedAt: '2026-11-07T12:25:08.091Z'
completedAt: '2026-11-07T12:25:07.995Z'
timeSpent: 180
---
# Add solo monster attack dialog and sequential queue

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use captured 2026-11-07 solo monster flow to add team selection, level search, single attack, safe sequential queue, and recent results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Monster dialog opens from the header and supports selecting an available team, level, found target, and attack.
- [x] #2 Queue sends at most one active monster attack, advances only after confirmed win and return, and stops on loss, exhaustion, errors, cancellation, or timeout.
- [x] #3 Recent solo attack results and queue status remain visible after popup reopening.
- [x] #4 Regression tests, build, and Knowns validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add level-to-config mapping and persist solo search results from captured searchMob. 2. Implement a persisted monster queue controller using exact attackMob, result and return identities, shared RPC policy, roster/energy checks and wake ticks. 3. Add dialog and header trigger with team, level, target, attack/queue controls, status and recent results. 4. Add captured and synthetic tests for success, loss, duplicate events, stale results, cancellation, exhaustion, persistence and UI. 5. Run targeted and broad tests, build, validate and close task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Monster header dialog, level 1-30 solo search, selected-team attack, sequential persisted queue, status and recent results. Queue advances after exact win and confirmed return; stops on loss, errors, timeout, energy depletion and cancellation. Fixed solo march cleanup on returnFromMobCompleted. Tests: 327 passed (excluding private quest-data fixture); npm run build generated 0.9.101. System Decision Impact: queue sequencing is feature-local behavior and does not change a repository-wide decision.
<!-- SECTION:NOTES:END -->

