---
id: ioti1u
title: World action RPCs can have empty successful responses
layer: project
category: pattern
status: proposed
tags:
  - rpc
  - cache
createdAt: '2026-11-01T12:48:22.184Z'
updatedAt: '2026-11-01T12:48:22.184Z'
---

For live World counters, successful action RPCs may contain state-changing values only in request args or versioned game config. startResearch:personalResearch supplies startDate and durationMs in args; createRally:mob and cancelRally:rally require matching rally IDs and the current globalMapMobRally attackCost. Reconcile estimates with the next refillableGetAll snapshot. Evidence: @task-VHE-BTR30J and hwaHelperRpcCache.extract/merge.
