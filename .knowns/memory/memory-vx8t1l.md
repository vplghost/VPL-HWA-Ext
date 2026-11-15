---
id: vx8t1l
title: Speedup item consumption requires user confirmation
layer: project
category: preference
status: proposed
tags:
  - speedup
createdAt: '2026-11-15T04:00:18.887Z'
updatedAt: '2026-11-15T04:00:18.887Z'
---

User explicitly required a confirmation step for every speedup spend on2026-11-15. Implemented separate review and Confirm & use items in SpeedupControl, with background ownership preventing duplicate uncertain spends.

**Why:** The user wants to avoid accidental consumption of limited speedup items.

Evidence: user request2026-11-15, @task-VHE-HHPR1K, @doc/api/speedup-rpc-contract-and-confirmed-use.
