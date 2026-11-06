---
id: 20261106-2154-raid-queue-consumes-searched-bosses-before-searching-again
title: Raid queue consumes searched bosses before searching again
status: accepted
supersedes: []
supersededBy: []
tags:
  - raid
sources:
  - '@task-VHE-G0FP1G'
  - 'extension/raid-queue.js:advance'
  - tests/raid-queue.test.mjs
  - tests/background.test.mjs
relatedDocs:
  - api/world-map-rpc-contracts
relatedTasks:
  - VHE-G0FP1G
verification:
  - 'source:@task-VHE-G0FP1G'
  - 'source:extension/raid-queue.js:advance'
  - 'source:tests/raid-queue.test.mjs'
  - 'source:tests/background.test.mjs'
  - 'task:@task-VHE-G0FP1G:done'
verifiedAt: '2026-11-06T14:58:05.214Z'
createdAt: '2026-11-06T14:54:26.164Z'
updatedAt: '2026-11-06T14:58:05.214Z'
---

## Context

The previous managed queue searched again after every win, even while the prior search had unused boss targets.

## Decision

Persist remaining raid count and ordered boss candidates in raid state. Keep the current rally as the front candidate until a confirmed win and return, then remove it and decrement count. Skip a target on recoverable create or confirmed cancellation errors without decrementing count. Search only when candidates are exhausted; stop for loss, insufficient World Energy, zero remaining count, or explicit queue cancellation. Explicit cancellation clears pending candidates and leaves an active rally running.

## Alternatives Considered


## Consequences

Fewer searchMob RPCs and deterministic target order. Failed targets are excluded from later searches in the same queue; a game rejection for insufficient energy stops dispatch.
