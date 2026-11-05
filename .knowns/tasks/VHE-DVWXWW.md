---
id: VHE-DVWXWW
title: Track solo monster attack march, World Energy, and battle result
status: done
priority: medium
labels: []
createdAt: '2026-11-05T05:06:57.841Z'
updatedAt: '2026-11-05T05:13:47.076Z'
completedAt: '2026-11-05T05:13:47.076Z'
timeSpent: 0
---
# Track solo monster attack march, World Energy, and battle result

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement passive state reduction for attackMob:mob from the 2026-11-05 capture, including team, energy cost, result history, failure logging, and return expiry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Successful attackMob creates one attack march with selected heroes, target, and arrival time
- [x] #2 Successful solo monster attack deducts verified 10 World Energy once and respects newer snapshots
- [x] #3 Solo monster reports update only the matching attack march and retain win/loss outcome history
- [x] #4 Attack march enters return stage and disappears after return ETA without hiding unrelated marches
- [x] #5 Captured trace and failure/dedup cases are validated by targeted tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use captured searchMob/getChunks/attackMob/report evidence and the referenced globalMapMobSolo config to define match keys, cost, and timing.
2. Extend rpc-cache extraction/reduction with solo attack march, World Energy action deduplication, and bounded result history.
3. Update march rendering/expiry for outbound, return, and completed solo attacks without affecting rally/gather.
4. Add captured-trace and synthetic failure/dedup tests; run targeted tests, build, and Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Trace 2026-11-05: attackMob started at 1793854809805 with 45,730 ms outbound route; report at 1793854856409 says win and matches mobConfigId 67. The trace ends before return; estimated ETA is 1793854902139. globalMapMobSolo config URL from recorded remoteConfigInit (hash 7bc90ab77a2c9a649c8b4ca1bdb9083f) confirms cost 10 refillableResource id 2 for config 67/all listed configs. Implemented solo mob map, attack march/team, snapshot-guarded energy delta, bounded outcome history (including failures), exact return-route override, and expiry. 109 targeted cache/UI tests pass; four focused solo tests pass; build 0.9.54 passes. Full suite replay tests still lack 10 temp fixtures. System Decision Impact: none; no accepted decision matched this bounded work. Runtime limitation: capture has no World Energy baseline or own return route, so no numeric balance can be recovered from this file and return ETA is estimated.
<!-- SECTION:NOTES:END -->

