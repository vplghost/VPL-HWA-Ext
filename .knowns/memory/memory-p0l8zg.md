---
id: p0l8zg
title: Mine coordinates must not become the return outpost origin
key: mine-coordinates-must-not-become-the-return-outpost-origin
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-14T12:13:25.858Z'
sources:
  - 'extension/rpc-cache.js:extract'
  - 'extension/smart-gather.js:context'
  - tests/smart-gather.test.mjs
  - '@task-VHE-1M0CGC'
tags:
  - gathering
  - marches
  - coordinates
  - rpc
createdAt: '2026-11-14T12:13:25.858Z'
updatedAt: '2026-11-14T12:13:25.858Z'
---

getMarches return routes originate at a mine/boss and end at an outpost. extract must select the endpoint whose object.objectType is outpost before recording route.leader.userId in experimentalMapContext.outposts. Smart gathering returnMs and nearest selection require the current account's outpost entry; a generic search/mine center is insufficient and can create a false zero return ETA. Regression: smart-gather.test.mjs return-route/account-switch test.
