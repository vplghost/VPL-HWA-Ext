---
id: kokif1
title: Tower chest selection and reward are separate RPC fields
key: tower-chest-selection-and-reward-are-separate-rpc-fields
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-03T05:55:30.171Z'
sources:
  - '@doc/architecture/tower-rpc-session-and-progress-model'
  - extension/rpc-cache.js
tags:
  - tower
  - rpc
createdAt: '2026-11-03T05:55:30.171Z'
updatedAt: '2026-11-03T05:55:30.171Z'
---

In Tower captures, `magicTower_openChest.args.number` is the chosen chest position, while `response.reward` is the revealed prize. `rewardIndex` and the pre-open `rewards[]` pool do not establish a stable position-to-prize mapping; keep offered costs and revealed reward separately.
