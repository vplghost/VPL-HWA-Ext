---
id: 0ghjkj
title: City queue dispatch acknowledgement is not server completion
key: city-queue-dispatch-acknowledgement-is-not-server-completion
layer: project
category: failure
status: active
lastVerified: '2026-11-13T08:51:59.159Z'
sources:
  - '@task-VHE-1YQ8A1'
  - '@doc/architecture/building-and-research-queue-reconciliation'
  - tests/background.test.mjs
  - tests/city-queue-ui.test.mjs
tags:
  - building
  - research
  - queues
  - debug
createdAt: '2026-11-13T08:51:59.159Z'
updatedAt: '2026-11-13T08:51:59.159Z'
---

Building/Research background queues previously removed pending work and logged completion as soon as tabs.sendMessage resolved; this made Add Queue appear to revert even if no game RPC succeeded. advanceCityQueue now serializes edits/evaluation, retains pendingRequest until correlated server results or a verified matching summary, and checks stale waits with bounded summary RPCs. getQueueEnd must not guess seconds from a duration's magnitude: a 30000ms upgrade was inflated to an eight-hour wait.
