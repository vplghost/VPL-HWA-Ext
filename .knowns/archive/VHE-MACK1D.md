---
id: VHE-MACK1D
title: Correlate rally lifecycle updates to the owning squad
status: done
priority: high
labels: []
createdAt: '2026-11-06T10:22:08.532Z'
updatedAt: '2026-11-06T10:34:26.530Z'
completedAt: '2026-11-06T10:31:30.636Z'
timeSpent: 408
archivedAt: '2026-11-06T10:34:26.530Z'
---
# Correlate rally lifecycle updates to the owning squad

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit found returnRoute/battleReport reducers updating every rally and hardcoded account identity fallbacks. Restrict updates to proven matching rally/squad/route/target, preserve unrelated marches, and remove account-specific fallbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Return route and battle report events update only a uniquely matched rally/squad/route/target; unidentified/ambiguous events leave other marches unchanged.
- [x] #2 Rally details identify the current account or existing own squad without hardcoded player IDs/names or same-name ownership fallback.
- [x] #3 Regression tests cover simultaneous rallies, unrelated routes/reports, unknown account and own auto-join details; full checks/build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve route/target/rally/squad identifiers from observed snapshots, reports and routes. 2. Replace broad rally updates with unique matching; require a positive identifier rather than a singleton guess. 3. Remove hardcoded/name-based account ownership and preserve member team for known own squads. 4. Add multi-rally and identity regressions, update affected contract docs and audit AC evidence. 5. Run focused/full tests and build; review and complete.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed route/report correlation with unique positive identities, route owner checks and shared-target ambiguity rejection. Removed hardcoded account IDs/names, preserved own auto-joined team when leader details arrive without own member, retained return route IDs through MQTT/snapshots, and allowed same-timestamp details to enrich snapshots. Anonymous historical reports still update mail status but never alter march ETAs. Three added regression groups plus updated explicit-identity test pass; full suite 283 pass/10 optional trace skips. System Decision Impact: none — enforces existing per-squad rally isolation requirement already documented by @task-VHE-ZFAXZJ and @task-VHE-62VVG5; no new durable policy is introduced.

Final review complete: no unresolved P1/P2 findings. npm run check passes 283 tests, 10 optional historical private-trace skips, 0 failures; generated build 0.9.77. Updated canonical map/march contract with exact route/report ownership rules and same-timestamp enrichment. No live game RPC was sent during remediation.

Final temporal correlation refinement: a new return route matched only by own boss must start no earlier than that rally planned departure; an older return from the same still-alive boss cannot attach to a newer waiting rally. Added regression assertion. Final npm run check remains 283 passed / 10 optional skips / 0 failures; generated build 0.9.78 supersedes the intermediate 0.9.77 build.
<!-- SECTION:NOTES:END -->

