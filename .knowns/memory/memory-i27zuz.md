---
id: i27zuz
title: Reward claim dispatch follows the Piggyback or Direct setting
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-05T16:29:55.486Z'
ttlDays: 90
sources:
  - extension/background.js
  - @doc/architecture/rpc-cache-pipeline
tags:
  - rewards
  - rpc
createdAt: '2026-11-05T16:29:55.486Z'
updatedAt: '2026-11-05T16:29:55.486Z'
---

The claim-rewards handler in background.js uses socketRefreshMode: Direct forwards refresh-rpc and Piggyback forwards queue-claim to one game tab. Piggyback requires popupRpcEnabled and Monitor API, waits up to two minutes for a game fetch RPC, then reports actual outcome through claimRpcStatus; failed claim actions are not automatically retried. See @doc/architecture/rpc-cache-pipeline.
