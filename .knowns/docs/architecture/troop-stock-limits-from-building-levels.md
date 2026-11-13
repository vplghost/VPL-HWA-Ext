---
id: doc-87d9d2045eac6b1f5c23ebc5a9778875
title: Troop stock limits from building levels
description: Verified cumulative unitsCapacity bonuses for Drill Grounds and Camps, distinct from march and training-batch capacity.
createdAt: '2026-11-13T12:52:48.108Z'
updatedAt: '2026-11-13T12:52:48.108Z'
tags:
  - troops
  - buildings
  - capacity
---

# Troop stock limits from building levels

Implemented by @task-VHE-JXMA49.

## Verified inputs

The captured remote-config index provides immutable buildingLevel 8f8820e1d76bbfa899e8bdf9241880bf, bonus ea971ab94960e0606c25e03fedce1bab and unitsCapacityBonusMap a24c46c999e4af63b976c42c62bec55c. Downloaded bytes were verified against each MD5. `scripts/generate-troop-limit-data.mjs` verifies these inputs and generates the small packaged `src/utils/troopLimitData.ts` tables. No runtime CDN requests.

unitsCapacityFront maps to Infantry (unit IDs 21–29), unitsCapacityMiddle to Spearmen (11–19), and unitsCapacityBack to Marksmen (1–9). Building-level rewards permanently grant absolute capacity increments. Sum increments from level 1 through the confirmed current level, not just the increment at that level.

All capacity-granting building IDs in this config are 40/41/42 and 182/183/184. Captured development labels for the latter are Headquarters 1/2/3 (the Drill Grounds group); retain existing verified localized UI names. Each of 182/183/184 grants capacity to all three troop types. Their cumulative per-type bonuses at levels 1, 2, 10 and 25 are 2770, 3100, 5630 and 9500 respectively. Sum each building independently at its own completed level.

Camp mapping: Marksmen 41, Spearmen 42, Infantry 40. Each grants its own type cumulative capacity 1300 at level 1, 1700 at level 2, 3450 at level 3, 9500 at level 10, 12500 at level 20 and 18500 at level 25. Thus three level-10 Drill Grounds plus a type's level-10 Camp yield 3×5630+9500 = 26390 for that type.

## Calculation and evidence boundaries

`calculateTroopMax` reads confirmed buildingStatus.data.buildings, with getSummary:building compatibility fallback. Accept lists or keyed maps, including numeric levels and buildingId/id rows. Ignore construction queues entirely; only a confirmed completed level affects the capacity. Absent entries in a known full building list are unbuilt (level 0). Missing building data, malformed relevant levels or levels outside packaged coverage are Unknown (`null`), not a fabricated 10,000 fallback. A valid explicit per-type unit summary limit is accepted as fallback when building data is unavailable.

The former 5000+1500×level estimate and 500×Camp Expansion research bonus were incorrect. The verified expansion research sample awards trainingCapacity (per-batch training size), not unitsCapacity (total stock). Do not mix them. March/squad hero capacity is also a separate model and is unchanged.

Never raise the computed limit to current troop count. Overflow remains visible as stock greater than its actual cap and blocks further training. The optional legacy third currentTotal argument is retained for call compatibility but does not affect the result.

`useTroopTraining` exposes nullable maxTroops and refuses to start training when unknown. Remaining training count is bounded by ready+deployed+injured+queued stock. The Troops card shows Unknown with a sync prompt rather than Maxed when data is missing. Refresh troops includes getSummary:building through the existing shared RPC policy. Confirmed construction completion updates canonical building levels, so these computations react automatically.

## Verification

`tests/troop-stock-limit.test.mjs` tests mixed levels for all three grounds/types, object maps, unbuilt versus unknown, queued versus completed upgrades, unsupported/invalid levels, overflow, explicit limits, non-stock research and actual training setup behavior. Existing frontend fixtures now assert verified stock values rather than the old guesses; the rejected-RPC runtime test includes a known Camp before attempting training.
