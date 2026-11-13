---
id: ur3kxd
title: Brigand camp uses hero-only settlement and 10 World Energy
key: brigand-camp-uses-hero-only-settlement-and-10-world-energy
layer: project
category: pattern
status: active
lastVerified: '2026-11-13T09:15:15.113Z'
sources:
  - '@task-VHE-GVVBMR'
  - '@doc/api/brigand-camp-rpc-contract'
  - 'extension/rpc-cache.js:extract'
tags:
  - brigand
  - world-energy
  - rpc
createdAt: '2026-11-13T09:15:15.113Z'
updatedAt: '2026-11-13T09:15:15.113Z'
---

Captured globalMapCamp teams are nested hero ID arrays. winCampBattle:camp takes campId and userHeroesIds and returns typed reward[] after the native battle. It does not return a troop march. The immutable globalMapCamp config MD5 f45fde890a6683ceef09053f5b636c0b charges ten world refillableResource #2 for every level. Current dialog requires a manual active camp UUID because the trace contains no camp discovery call; direct live settlement has not been verified. See @doc/api/brigand-camp-rpc-contract and hwaHelperRpcCache.extract.
