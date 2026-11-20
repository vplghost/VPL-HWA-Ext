---
id: f2za7i
title: Dungeon battle simulation healer rules and fatal damage correlation
layer: project
category: pattern
status: proposed
tags: []
createdAt: '2026-11-20T13:04:46.898Z'
updatedAt: '2026-11-20T13:04:46.898Z'
---

Dungeon semi-auto battles must dispatch dungeonSaveProgress after dungeonEndBattle succeeds, cap non-healer team HP at pre-battle HP, classify Tydus (4004, 30% max HP team heal on water synergy + Child of Water) and Hyperion (4003) as major healers, and omit fatal frontline casualties from attackers.heroes with 2-star rating. Provenance: @doc/architecture/dungeon-battle-simulation-and-healer-mechanics, @task-VHE-M1Y8P7, @task-VHE-PQ14JB.
