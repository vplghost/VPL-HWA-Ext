---
id: v7soti
title: Dungeon checkpoint zero-door floors require progress save and traversal delay
layer: project
category: pattern
status: proposed
tags:
  - dungeon,automation,checkpoint
createdAt: '2026-11-23T01:31:59.998Z'
updatedAt: '2026-11-23T01:31:59.998Z'
---

Checkpoint floors (divisible by 10) have 0 doors and present a save lever. The runner must not halt on zero doors when saveFloor > respawnFloor or readyToSave; it must issue dungeonSaveProgress, await lever animation, and advance. Cite: src/services/queues/dungeonAutomationRunner.ts
