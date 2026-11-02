---
id: doc-5977b0645ae33e48fc00a5b8f7c90347
title: RPC Cache Pipeline
description: Passive RPC interception, delta reduction, resource keys, and action deduplication in HWA Helper
createdAt: '2026-11-02T06:43:06.566Z'
updatedAt: '2026-11-02T06:43:06.566Z'
tags:
  - architecture,cache,rpc
---

# RPC Cache Pipeline

## Overview
HWA Helper captures Hero Wars: Alliance RPCs passively using \intercept.js\ and reduces them into a unified in-memory snapshot store without holding locks or blocking game gameplay.

## Core Mechanisms
1. **Extraction (\pcCache.extract\)**:
   - Parses RPC calls matching registered method names (\methods\ mapping).
   - Maps methods into logical feature domains: \heroes\, \	itans\, \events\, \items\, \header\, \other\, \internal\.
   - Generates deduplication tokens using \call.ident\ and entity IDs (e.g. \\:heroEvolve:\\).

2. **Reduction (\pcCache.reduce\ / \merge\)\**:
   - **Snapshots**: Full state objects (\heroGetAll\, \	itanGetAll\, \inventoryGet\, \clanVersusStatus\, \dungeonStatus\, \legendDraftStatus\) overwrite older cached versions based on timestamp.
   - **Action Deltas**: One-time actions (\heroEvolve\, \	itanEvolve\, \heroUpgradeSkill\, \inventory_use\, \claimChest\) mutate specific slices (decrement fragments/potions, increment stars/skills) and track executed tokens in \esourceActionHistory\ to prevent replay.
   - **Resource Normalization**: Keyed resources (\esource:gold\, \esource:consumable:*\, \esource:fragmentHero:*\, \esource:fragmentTitan:*\) mirror inventory quantities for O(1) header/table lookups.
