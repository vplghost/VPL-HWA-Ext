---
id: VHE-X2SJ1X
title: Allow monster attack through piggyback interceptor
status: done
priority: high
labels: []
createdAt: '2026-11-07T15:15:51.889Z'
updatedAt: '2026-11-07T15:16:51.037Z'
completedAt: '2026-11-07T15:16:51.037Z'
timeSpent: 0
---
# Allow monster attack through piggyback interceptor

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Queued attackMob is appended once to a native game RPC, and its result is visible to the queue controller.
- [x] #2 MQTT-assisted mode nudges only when attackMob has been accepted into the interceptor queue.
- [x] #3 Tests and build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Confirm captured queue has no helper attack after enqueue; add attackMob to interceptor action allowlist; add regression for one-shot append and MQTT nudge; run tests and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Captured trace: manual attackMob at 15:11:30; queue starts at 15:13:48 and reports piggyback-queued but no later attackMob or piggyback-attached. Root cause: attackMob absent from helperActionMethods in intercept.js, so queue-rpc was filtered out before append and MQTT nudge. Added attackMob allowlist; interceptor regression verifies one-shot native append, response isolation, queue count and MQTT nudge. 330 tests pass; build 0.9.105. System Decision Impact: none; uses existing shared RPC dispatch policy.
<!-- SECTION:NOTES:END -->

