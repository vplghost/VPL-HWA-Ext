---
id: 18otow
title: Troop stock capacity is distinct from training batch and march capacity
key: troop-stock-capacity-is-distinct-from-training-batch-and-march-capacity
layer: project
category: failure
status: active
lastVerified: '2026-11-13T12:54:10.613Z'
sources:
  - '@task-VHE-JXMA49'
  - '@doc/architecture/troop-stock-limits-from-building-levels'
  - 'src/utils/troops.ts:calculateTroopMax'
  - scripts/generate-troop-limit-data.mjs
tags:
  - troops
  - capacity
  - buildings
createdAt: '2026-11-13T12:54:10.613Z'
updatedAt: '2026-11-13T12:54:10.613Z'
---

The removed calculateTroopMax estimate 5000+level*1500 and researchLevel*500 was unsupported. Verified buildingLevel/bonus configs grant cumulative absolute unitsCapacity by completed levels: all three Drill Grounds IDs182/183/184 contribute to every troop type; matching Camp IDs41/42/40 contribute to Marksmen/Spearmen/Infantry. Camp Expansion research example bonus2792 is trainingCapacity (batch size), not stock capacity. Current stock must not inflate the cap; unknown building levels yield null and block training. See calculateTroopMax, generated troopLimitData.ts and @doc/architecture/troop-stock-limits-from-building-levels.
