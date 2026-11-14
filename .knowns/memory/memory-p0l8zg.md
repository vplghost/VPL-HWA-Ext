---
id: p0l8zg
title: Mine coordinates must not become the return outpost origin
key: mine-coordinates-must-not-become-the-return-outpost-origin
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-14T18:05:41.753Z'
ttlDays: 90
sources:
  - 'extension/rpc-cache.js:extract'
  - 'extension/smart-gather.js:context'
  - 'extension/auto-gather.js:planAutoGather'
  - tests/smart-gather.test.mjs
  - tests/gather-reload.test.mjs
  - '@task-VHE-1M0CGC'
  - '@task-VHE-B86D4M'
tags:
  - gathering
  - marches
  - coordinates
  - rpc
createdAt: '2026-11-14T12:13:25.858Z'
updatedAt: '2026-11-14T18:05:41.753Z'
---

getMarches return routes originate at a mine/boss and end at an outpost. extract must select the endpoint whose object.objectType is outpost before recording route.leader.userId in experimentalMapContext.outposts. Smart gathering returnMs and nearest selection require the current account's outpost entry; a generic search/mine center is insufficient and can create a false zero return ETA. Since0.10.84, getOutpostSummary:outpost also hydrates own outpost coordinates during startup before getChunks, scoped to a known account with stale/account/map guards. Auto-gather searches prefer outposts[currentAccount] over a generic viewport/mine center. Reload capture202611150055 showed own606,376 ignored while mine587,340 became generic center. Regression: tests/smart-gather.test.mjs and tests/gather-reload.test.mjs; canonical evidence: @doc/specs/smart-auto-gathering and @doc/api/world-map-rpc-contracts.
