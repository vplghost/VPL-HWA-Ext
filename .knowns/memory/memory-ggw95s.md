---
id: ggw95s
title: Speedup suggestions stop one item short of completion
layer: project
category: pattern
status: proposed
tags:
  - speedup
createdAt: '2026-11-15T05:50:56.574Z'
updatedAt: '2026-11-15T05:50:56.574Z'
---

speedup.suggestedAmount uses min(stock,max(0,ceil(remainingMs/itemDurationMs)-1)), confirmed by the user on2026-11-15. It fills when opening the compact icon-triggered form or changing an item; no suggestion spends resources, and explicit confirmation/persisted pending guards remain required. Building/Research icons follow percent; Hospital icons follow active timers. Checkable anchors: extension/speedup.js:suggestedAmount, @task-VHE-YX63BV, @doc/api/speedup-rpc-contract-and-confirmed-use.
