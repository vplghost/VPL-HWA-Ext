---
id: 9zn6rn
title: HWA Helper API capture path
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-01T08:42:44.929Z'
ttlDays: 90
sources:
  - extension/intercept.js
  - extension/bridge.js
  - extension/background.js
  - @task-VHE-N8QQGB
tags:
  - extension
  - profiling
createdAt: '2026-11-01T08:42:44.929Z'
updatedAt: '2026-11-01T08:42:44.929Z'
---

The extension intercepts fetch and XMLHttpRequest in the MAIN world and forwards metadata through bridge.js to background.js for bounded chrome.storage.local retention. See @task-VHE-N8QQGB and the intercept.js, bridge.js, and background.js sources.
