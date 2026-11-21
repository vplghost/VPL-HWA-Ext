---
id: VHE-46ZF6S
title: 'Partition domain keys (cache:world, cache:roster) for rpcCache'
status: done
priority: high
labels:
  - storage
  - performance
  - frontend
createdAt: '2026-11-21T02:57:52.223Z'
updatedAt: '2026-11-21T03:01:06.710Z'
completedAt: '2026-11-21T03:01:06.710Z'
timeSpent: 0
---
# Partition domain keys (cache:world, cache:roster) for rpcCache

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Partition marchStatus and mineMap into dedicated domain key cache:world
- [x] #2 Partition heroGetAll, titanGetAll, and inventoryGet into domain key cache:roster
- [x] #3 Update useRpcCache to transparently compose and react to domain partition keys
- [x] #4 Add domain partitioning unit tests and pass all test suites
<!-- AC:END -->

