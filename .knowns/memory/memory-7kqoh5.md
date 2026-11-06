---
id: 7kqoh5
title: Rally capacity uses observed values rather than an inferred curve
key: rally-capacity-uses-observed-values-rather-than-an-inferred-curve
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-06T09:15:14.848Z'
sources:
  - 'extension/experimental-data.js:squadCapacity'
  - '@doc/api/world-map-rpc-contracts'
  - '@task-VHE-1K5J8J'
tags:
  - rally
  - capacity
  - rpc
createdAt: '2026-11-06T09:15:14.848Z'
updatedAt: '2026-11-06T09:15:14.848Z'
---

`squadCapacity` uses explicit per-hero capacity plus additional base capacity; saved values bind to level/star/power and invalidate on changes. The executable capacity curve has not been verified despite exposed squadSetting coefficients. Do not substitute prior troop counts or fit the five user samples. See @doc/api/world-map-rpc-contracts and @task-VHE-1K5J8J.
