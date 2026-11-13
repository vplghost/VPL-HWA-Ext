---
id: akiyit
title: Bridge timers must catch synchronous context invalidation
key: bridge-timers-must-catch-synchronous-context-invalidation
layer: project
category: failure
status: active
lastVerified: '2026-11-13T16:16:24.294Z'
sources:
  - 'extension/bridge.js:sendBridgeMessage'
  - 'extension/bridge.js:bridgeTimeout'
  - 'extension/bridge.js:handleContextInvalidated'
  - '@task-VHE-B1K62K'
tags:
  - bridge
  - timers
  - debug
  - lifecycle
createdAt: '2026-11-13T16:16:24.294Z'
updatedAt: '2026-11-13T16:16:24.294Z'
---

Chrome runtime.sendMessage may throw Extension context invalidated synchronously before a Promise exists, so attaching .catch alone did not protect bridge.js Building/Research and other automation wake timers. sendBridgeMessage catches both failure modes; bridgeTimeout tracks timers and gates stale callbacks, while handleContextInvalidated cancels them. Queue-state read invalidation is also handled; ordinary missing receiver failures do not disable the bridge. Manual helper controls retain their existing reconnect notice.
