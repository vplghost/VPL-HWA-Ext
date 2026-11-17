---
id: i4hq8k
title: Mine target rejections auto-skip for 60s without pausing auto gather
layer: project
category: pattern
status: proposed
tags:
  - gathering
  - rpc
  - resilience
  - errors
createdAt: '2026-11-17T01:31:12.414Z'
updatedAt: '2026-11-17T01:31:12.414Z'
---

Game server rejections on attackMine or getMineById with target-state codes (TargetAlreadyOccupied, MineNotFound, BattleTypeMismatch, TargetInBattle) must auto-skip that mine for 60s and search/dispatch another target without setting state.error or halting Smart gathering. Only unit-level failures (e.g., InsufficientUnits) pause with diagnostics. Provenance: @doc/api/mine-incoming-attack-and-timed-withdrawal.
