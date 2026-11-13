---
id: ur3kxd
title: Brigand camp uses hero-only settlement and 10 World Energy
key: brigand-camp-uses-hero-only-settlement-and-10-world-energy
layer: project
category: pattern
status: active
lastVerified: '2026-11-13T09:53:22.294Z'
sources:
  - '@task-VHE-DHB6KB'
  - '@doc/api/brigand-camp-rpc-contract'
  - 'src/utils/brigandCamp.ts:campSearchCalls'
  - 'extension/rpc-cache.js:extract'
tags:
  - brigand
  - world-energy
  - rpc
createdAt: '2026-11-13T09:15:15.113Z'
updatedAt: '2026-11-13T09:53:22.294Z'
---

Brigand camp uses hero-only globalMapCamp team arrays and winCampBattle:camp {campId,userHeroesIds} victory settlement. It returns typed reward[] without a troop march. Immutable globalMapCamp MD5 f45fde890a6683ceef09053f5b636c0b charges 10 world refillableResource #2 at every level. Discovery is now verified: getCampSummary:camp with empty args returns response.campsSummary {nextRespawnDt,camps:[{id,campConfigId,defendersPack}]}. Dialog selects server targets, locally filters levels, hides expired lists and removes confirmed defeated camps. Search does not spend energy and follows shared RPC settings. Native battle launch/direct live settlement remain unverified. See @doc/api/brigand-camp-rpc-contract, campSearchCalls and hwaHelperRpcCache.extract.
