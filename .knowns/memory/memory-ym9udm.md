---
id: ym9udm
title: WSS metadata refresh can piggyback on game fetch RPC
layer: project
category: pattern
status: proposed
tags:
  - mqtt
  - rpc
createdAt: '2026-11-05T16:16:49.393Z'
updatedAt: '2026-11-05T16:16:49.393Z'
---

The socketRefreshMode setting defaults to piggyback for metadata-only WSS follow-up reads when popupRpcEnabled is true. queue-rpc in intercept.js appends allowlisted calls to the next game fetch RPC, strips the stale signature, records the full results for cache, and returns only original results to the game; direct remains selectable. See @doc/architecture/rpc-cache-pipeline.
