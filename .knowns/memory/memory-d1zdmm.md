---
id: d1zdmm
title: Debug-only extension capabilities tree-shaken via VITE_DEBUG_BRIDGE
layer: project
category: pattern
status: proposed
tags:
  - wxt,build,permissions,security
createdAt: '2026-11-23T01:31:59.812Z'
updatedAt: '2026-11-23T01:31:59.812Z'
---

Native messaging and declarativeNetRequest permissions are injected conditionally in wxt.config.ts only when VITE_DEBUG_BRIDGE is true. Runtime entrypoints check import.meta.env.VITE_DEBUG_BRIDGE to ensure zero overhead and clean manifest in production builds. Cite: @doc/architecture/native-messaging-debug-bridge-and-wasm-call-chaining
