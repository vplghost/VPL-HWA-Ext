---
id: 5h0n9w
title: API collections can be object-shaped dictionaries requiring normalization before array methods
layer: project
category: failure
status: proposed
confidence: high
lastVerified: '2026-11-13T02:32:11.941Z'
ttlDays: 90
sources:
  - extension/popup-data.js
  - extension/popup.js
  - '@doc/architecture/goals-tracking'
tags:
  - api
  - cache
  - goals
  - guild-versus
createdAt: '2026-11-13T02:32:11.941Z'
updatedAt: '2026-11-13T02:32:11.941Z'
---

In extractEventGoals and Guild Versus renderers, clanVersusStatus.battle.rounds and challenges can arrive as object dictionaries rather than arrays. Relying on (rounds || []).find throws TypeError: r.find is not a function. Always normalize with Array.isArray(col) ? col : Object.values(col || {}) before array iteration. Cite: extractEventGoals in extension/popup-data.js, @doc/architecture/goals-tracking.
