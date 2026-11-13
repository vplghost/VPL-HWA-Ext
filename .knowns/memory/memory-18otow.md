---
id: 18otow
title: Troop stock capacity is distinct from training batch and march capacity
key: troop-stock-capacity-is-distinct-from-training-batch-and-march-capacity
layer: project
category: failure
status: active
lastVerified: '2026-11-13T13:16:30.590Z'
sources:
  - User confirmation, 2026-11-13, Drill Grounds-only rule and14230 sum
  - '@task-VHE-WH13EE'
  - '@doc/architecture/troop-stock-limits-from-building-levels'
  - 'src/utils/troops.ts:calculateTroopMax'
  - 'src/utils/troops.ts:troopStockProgress'
tags:
  - troops
  - capacity
  - buildings
createdAt: '2026-11-13T12:54:10.613Z'
updatedAt: '2026-11-13T13:16:30.590Z'
---

Current game stock caps use only completed Drill Grounds IDs182/183/184. Do not add legacy Camp40/41/42 bonus rows even though older immutable configs contain them. User confirmed on2026-11-13 that Drill Grounds19=7400 and14=6830, total14230 for each troop type (14320 was a typo). The earlier inclusion of Camp bonuses was incorrect. TrainingCapacity research is batch size, not stock capacity; hero/march capacity is separate. calculateTroopMax keeps true cap despite overflow, and troopStockProgress uses that cap as denominator with clipped visual segments and explicit overflow/unknown text. See @doc/architecture/troop-stock-limits-from-building-levels.
