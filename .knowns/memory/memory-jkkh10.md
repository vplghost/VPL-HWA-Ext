---
id: jkkh10
title: Event quest claims may have empty reward responses
layer: project
category: failure
status: proposed
confidence: high
lastVerified: '2026-11-03T16:13:51.126Z'
ttlDays: 90
sources:
  - extension/rpc-cache.js
  - extension/background.js
tags:
  - event
  - rpc
createdAt: '2026-11-03T16:13:51.126Z'
updatedAt: '2026-11-03T16:13:51.126Z'
---

The observed completeQuest(14360) response is an empty object, so the claim itself does not establish resource or item deltas. questClaimAction records the claim and background refreshes userGetInfo, inventoryGet, and refillableGetAll to reconcile authoritative balances. Check extension/rpc-cache.js questClaimAction and extension/background.js api-record handler.
