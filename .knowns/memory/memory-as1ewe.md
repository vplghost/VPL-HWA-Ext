---
id: as1ewe
title: Gathering estimates use server plans and freeze during return
key: gathering-estimates-from-server-plans
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T03:16:24.290Z'
sources:
  - '@doc/api/world-map-rpc-contracts'
  - '@task-VHE-N23JRD'
  - 'src/utils/gatheringProgress.ts:gatheringProgress'
  - tests/gathering-progress.test.mjs
tags:
  - gathering
  - estimates
  - rpc
  - world-map
createdAt: '2026-11-14T03:16:24.290Z'
updatedAt: '2026-11-14T03:16:24.290Z'
---

`gatheringProgress` uses getMineSummary:mine plannedGatheredResourceAmount × clamp((now-startedAt)/plannedDurationMs,0,1), flooring the displayed quantity. Match squad/mine; never use entire mine stock or an invented rate. Return/recall freezes collection at the server return-route start; estimates never credit inventory. Missing timing/quantity stays unknown. Gathering, Dashboard and tooltips share this helper. Canonical contract: @doc/api/world-map-rpc-contracts (Gathering amount estimates from getMineSummary); source @task-VHE-N23JRD, commit 2aa8564.
