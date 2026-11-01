---
id: uc1i3x
title: Energy RPC fields
layer: project
category: pattern
status: proposed
tags: []
createdAt: '2026-11-01T11:53:54.443Z'
updatedAt: '2026-11-01T11:53:54.443Z'
---

Energy snapshot comes from userGetInfo.response.refillable[id=1].amount or refillableGetAll.response.refillables[refillableId=1].amount. World Energy comes from refillableGetAll.response.refillables[refillableId=2].amount. Cache only the numeric amount via hwaHelperRpcCache.extract; do not retain userGetInfo profile fields. Source: hwaHelperRpcCache.extract, @task-VHE-F99XNX. Confidence: high. Last verified: 2026-11-01.
