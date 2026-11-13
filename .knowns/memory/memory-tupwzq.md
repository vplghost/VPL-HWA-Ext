---
id: tupwzq
title: Default RPC dispatch mode must be initialized to piggyback on extension install
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-13T02:32:26.400Z'
ttlDays: 90
sources:
  - extension/background.js
  - src/components/common/Header.vue
  - '@doc/architecture/shared-rpc-settings'
tags:
  - rpc
  - settings
  - storage
  - background
createdAt: '2026-11-13T02:32:26.400Z'
updatedAt: '2026-11-13T02:32:26.400Z'
---

On fresh install, chrome.storage.local.get(['socketRefreshMode']) returns undefined. Never allow dialogs to invent a direct fallback or background dispatch to misroute RPC calls. Explicitly persist socketRefreshMode: 'piggyback' in chrome.runtime.onInstalled and fallback to piggyback in all modal launchers. Cite: background.js, Header.vue, @doc/architecture/shared-rpc-settings.
