---
id: vedsxx
title: 'MQTT nudge must target the game''s active map chunks'
layer: project
category: failure
status: active
confidence: high
lastVerified: '2026-11-08T10:11:05.945Z'
ttlDays: 90
sources:
  - extension/mqtt-capture.js
  - @task-VHE-BZXW0H
  - @doc/architecture/mqtt-assisted-piggyback
tags:
  - mqtt
  - rpc
  - debug
createdAt: '2026-11-08T10:11:05.945Z'
updatedAt: '2026-11-08T10:11:05.945Z'
---

A mapChunksUpdated nudge built from only the latest server packet can target an off-screen chunk and leave helper RPCs waiting for unrelated native traffic. Keep recent real map updates and prioritize the latest native getChunks coordinates for the same map when synthesizing a local trigger. Evidence: @task-VHE-BZXW0H, @doc/architecture/mqtt-assisted-piggyback, and rememberTrigger / rememberViewedChunks / triggerGameRefresh in extension/mqtt-capture.js.
