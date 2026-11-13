---
id: qe9erm
title: Draft push is a refresh trigger, rally push includes exact return ETA
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-05T15:18:25.062Z'
ttlDays: 90
sources:
  - extension/rpc-cache.js
  - @doc/architecture/rpc-cache-pipeline
tags:
  - mqtt
  - draft
  - rally
createdAt: '2026-11-05T15:18:25.062Z'
updatedAt: '2026-11-05T15:18:25.062Z'
---

Observed in the 2026-11-05 game trace: randomDraft_statusChanged carries only push metadata, so randomDraft_getInfo is needed for stageId and stageFinishTs; mobRallyAttackResult carries routeToOutpost.startedAt and durationMs, giving exact return ETA. See extractSocket and @doc/architecture/rpc-cache-pipeline.
