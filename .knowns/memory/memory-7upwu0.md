---
id: 7upwu0
title: 'MQTT nudge must target the game''s active map chunks'
layer: project
category: failure
status: proposed
tags:
  - mqtt
  - rpc
  - debug
createdAt: '2026-11-07T12:43:18.715Z'
updatedAt: '2026-11-07T12:43:18.715Z'
---

A mapChunksUpdated nudge built from only the latest server packet can target an off-screen chunk and leave helper RPCs waiting for unrelated native traffic. Keep recent real map updates and prioritize the latest native getChunks coordinates for the same map when synthesizing a local trigger. Evidence: @task-VHE-BZXW0H and rememberTrigger / rememberViewedChunks / triggerGameRefresh in extension/mqtt-capture.js.
