---
id: 7kqoh5
title: Rally capacity uses Settings defaults and stat-bound observed squads
key: rally-capacity-uses-observed-values-rather-than-an-inferred-curve
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-06T10:08:32.355Z'
ttlDays: 90
sources:
  - 'extension/experimental-data.js:capacityModel'
  - 'extension/rpc-cache.js:observeSquad'
  - '@task-VHE-NFV32J'
  - '@doc/api/world-map-rpc-contracts'
tags:
  - rally
  - capacity
  - rpc
createdAt: '2026-11-06T09:15:14.848Z'
updatedAt: '2026-11-06T10:08:32.356Z'
---

Rally no longer asks for hero/base capacities. Settings defaults are 600 per unknown hero and 950 base. `capacityModel` uses explicit/known hero data, bounded own-account profile-bound squad loads from rallies/auto-join/gathering, and row reduction only for identifiable contributions. Underdetermined/conflicting hero values retain defaults; exact-lineup observed maximums improve team totals without assigning arbitrary per-hero shares. Loads are estimates, not proof of a full maximum or an executable power curve. See @doc/api/world-map-rpc-contracts and @task-VHE-NFV32J.
