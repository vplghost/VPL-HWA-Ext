---
id: xvorcs
title: All helper RPC features inherit the global dispatch settings
key: all-helper-rpc-features-inherit-the-global-dispatch-settings
layer: project
category: preference
status: active
confidence: high
lastVerified: '2026-11-06T04:23:01.370Z'
ttlDays: 90
sources:
  - User request on 2026-11-06 in this conversation
  - '@task-VHE-62VVG5'
  - '@doc/architecture/shared-rpc-settings'
tags:
  - rpc
  - settings
  - user-preference
createdAt: '2026-11-06T04:23:01.370Z'
updatedAt: '2026-11-06T04:23:01.370Z'
---

The user explicitly required on 2026-11-06 that all RPC features inherit the common settings; any exception must later be exposed as a specific feature setting. This is implemented for Experimental, Draft, quick refresh, claims and automatic follow-ups via rpcMessageForSettings and interceptor enforcement; see @doc/architecture/shared-rpc-settings.

**Why:** The shared settings are the default authority for RPC behavior, while exceptions must be explicit rather than hidden in a feature implementation.
