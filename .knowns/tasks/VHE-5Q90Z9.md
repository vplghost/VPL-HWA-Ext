---
id: VHE-5Q90Z9
title: Implement Debounced Storage Flush for high-frequency passive MQTT and march events
status: done
priority: high
labels:
  - storage,performance,background
createdAt: '2026-11-21T01:38:23.591Z'
updatedAt: '2026-11-21T02:49:43.897Z'
completedAt: '2026-11-21T02:49:43.897Z'
timeSpent: 0
---
# Implement Debounced Storage Flush for high-frequency passive MQTT and march events

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Coalesce frequent passive MQTT/march storage writes with a 300ms debounce buffer
- [x] #2 Ensure user mutations, claims, and explicit RPC calls flush immediately without delay
- [x] #3 Prevent race conditions and queue stalling during debounced writes
- [x] #4 Pass all background runtime and queue unit tests
<!-- AC:END -->

