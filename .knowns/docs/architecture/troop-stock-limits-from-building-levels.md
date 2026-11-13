---
id: doc-87d9d2045eac6b1f5c23ebc5a9778875
title: Troop stock limits from building levels
description: Verified cumulative unitsCapacity bonuses for Drill Grounds and Camps, distinct from march and training-batch capacity.
createdAt: '2026-11-13T12:52:48.108Z'
updatedAt: '2026-11-13T13:16:30.542Z'
tags:
  - troops
  - buildings
  - capacity
---

# Troop stock limits from Drill Grounds

Current model corrected by @task-VHE-WH13EE following the user's 2026-11-13 confirmation of current game behavior. The earlier @task-VHE-JXMA49 implementation incorrectly included legacy Camp rewards; those are excluded from the active model and generated table.

## Formula and verified levels

For every troop type, stock cap is the sum of cumulative capacity at the completed levels of Drill Grounds building IDs182,183,184. Camps40/41/42, queued upgrade targets, training-batch research and march capacity do not contribute.

Drill Grounds level19 contributes7400 and level14 contributes6830. The user confirmed the sum is14230 (the initially reported14320 was a typo). If only those two grounds are built, every troop type has a14230 cap, regardless of Camp level. Never add an unexplained90-point correction or inflate capacity to existing stock.

The immutable captured configs are buildingLevel8f8820e1d76bbfa899e8bdf9241880bf, bonus ea971ab94960e0606c25e03fedce1bab and unitsCapacityBonusMap a24c46c999e4af63b976c42c62bec55c. `scripts/generate-troop-limit-data.mjs` checks downloaded file MD5s against the captured index and generates only `DRILL_GROUND_LIMIT_BY_LEVEL` and IDs. These files contain legacy Camp bonus rows, but the current game rule explicitly excludes them. Successful data integrity verification does not prove a legacy bonus is part of the current capacity formula.

The three grounds share the same per-type cumulative table: level1=2770,2=3100,10=5630,14=6830,19=7400,25=9500. The captured development labels are Headquarters1/2/3; existing localized names remain unchanged.

## State and training

`calculateTroopMax` reads confirmed buildingStatus.data.buildings, with getSummary:building compatibility fallback; accepts arrays or keyed maps. Only completed levels affect cap. Absent entries in a known full building list are unbuilt (level0). Missing building data or malformed/unsupported Drill Grounds levels yield null. Invalid Camp levels are irrelevant because Camps are not part of the calculation.

When building data is unavailable, a valid explicit per-type limit from the unit summary is accepted as authoritative fallback. Otherwise never guess a stock cap. The optional legacy third currentTotal argument remains for API compatibility but has no influence.

Stock includes ready/deployed, injured and queued training counts. Unknown or overflowing stock limits block further training. Troop refresh requests getSummary:building through global RPC settings. This task does not change the per-batch trainingCapacity or hero/march troop capacity models.

## Progress

`troopStockProgress` and the Troops card use the true cap as denominator. Raw occupancy can exceed100%; display current/cap, one-decimal occupancy percentage and explicit Over cap by count. The visual ready/hospital/training segments are clipped in order to a total no greater than100%, without renormalizing the denominator to current stock. Segments do not shrink through CSS flex. A known zero cap with stock is full/overflow without dividing by zero. Unknown cap produces a neutral empty bar, no invented percentage, and a sync prompt.

The progressbar accessibility value stays within0–100; its value text preserves actual stock/cap and overflow. Numbers in the category counters remain actual counts even when their segment is clipped.

## Verification

`tests/troop-stock-limit.test.mjs` checks the user's exact19+14 example for all types with max-level Camps present, Camp exclusion, mixed confirmed levels, queued versus completed upgrades, unknown/unsupported levels, overflow, explicit fallback, non-stock research and actual training setup. It also executes the actual Troops card setup and checks under-cap/over-cap/unknown progress. Existing runtime fixtures include a confirmed Drill Grounds before testing a rejected training request.
