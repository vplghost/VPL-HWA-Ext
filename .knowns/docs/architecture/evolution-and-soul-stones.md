---
id: doc-813ed4c6f4086f00fd7d42a4037effa8
title: Evolution and Soul Stones
description: Star upgrade thresholds, fragment costs, and inventory reduction for Heroes and Titans
createdAt: '2026-11-02T06:43:19.849Z'
updatedAt: '2026-11-02T06:43:30.630Z'
tags:
  - evolution,heroes,titans
---

# Evolution and Soul Stones

## Overview
Hero Wars: Alliance uses star-based evolution powered by Soul Stones (fragments). Evolution upgrades character base multipliers and stats while consuming a progressive number of fragments.

## Evolution Costs
Fragment costs to evolve TO each star tier (from enum_evolutionStar.json):

- Hero: 2★ (20), 3★ (50), 4★ (100), 5★ (150), 6★ Max (300)
- Titan: 2★ (50), 3★ (150), 4★ (500), 5★ (900), 6★ Max (1500)

## RPC Signatures & Cache Reduction
1. heroEvolve: { heroId }
   - heroGetAll.data[heroId].star += 1
   - Deducts cost from inventoryGet.data.fragmentHero[heroId] and resource:fragmentHero:*
2. titanEvolve: { titanId }
   - titanGetAll.data[titanId].star += 1
   - Deducts cost from inventoryGet.data.fragmentTitan[titanId] and resource:fragmentTitan:*
   - Synchronizes consumable balances returned in response (e.g. consumable 24)
   - Records token in resourceActionHistory to prevent duplicate executions.
