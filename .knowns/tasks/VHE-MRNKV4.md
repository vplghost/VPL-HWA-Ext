---
id: VHE-MRNKV4
title: Optimize Auto Join Rally and Auto Gather on MQTT rallyCreated signal
status: done
priority: high
labels:
  - rally,gathering,mqtt,automation
createdAt: '2026-11-15T11:07:49.049Z'
updatedAt: '2026-11-15T11:16:05.489Z'
completedAt: '2026-11-15T11:16:05.489Z'
timeSpent: 0
assignee: '@me'
---
# Optimize Auto Join Rally and Auto Gather on MQTT rallyCreated signal

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix lastRpcUrl endpoint poisoning from /oauth/refresh in intercept.js, ensure immediate direct dispatch of getRallyById upon MQTT rallyCreated, and optimize timely coordination with Auto Gather squad recall.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fix lastRpcUrl in intercept.js to strictly match /api/rpc
- [x] #2 Optimize rallyCreated handling in background.js for timely getRallyById dispatch
- [x] #3 Optimize squad recall coordination between auto-gather and priority auto-join rally
- [x] #4 Add unit test suite verifying rallyCreated dispatch, endpoint purity, and auto recall
- [x] #5 Verify all tests pass, typecheck, build, bump version, and update changelog
<!-- AC:END -->

