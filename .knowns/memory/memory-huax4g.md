---
id: huax4g
title: Missing-mine errors previously stopped Smart gathering permanently
layer: project
category: failure
status: proposed
tags:
  - gathering
createdAt: '2026-11-15T02:59:29.116Z'
updatedAt: '2026-11-15T02:59:29.116Z'
---

smart.sync previously persisted getMineById MineNotFound as state.error, stopping all later planning; nearestPlan also required restart when candidates ran out. Exact confirmed MineNotFound now skips the target using bounded exclusions, legacy exact stops recover only without pending mutations, and exhausted nearest scans restart after60s. Unknown or unconfirmed mutation errors retain their stop/confirmation gates. Evidence: @task-VHE-V3KHXA, @doc/api/world-map-rpc-contracts, tests/smart-gather-background.test.mjs.
