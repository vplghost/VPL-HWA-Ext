---
id: doc-6f4a4a2e2e3b17941a9db8218e3a3b8c
title: MQTT Assisted Piggyback
description: Experimental shared RPC mode that locally delivers a bounded MQTT map update to request a native game carrier, with append-only response isolation
createdAt: '2026-11-06T08:36:33.637Z'
updatedAt: '2026-11-08T11:37:20.271Z'
tags:
  - rpc
  - mqtt
  - settings
  - experimental
---

# MQTT Assisted Piggyback

## Purpose and setting

The shared `socketRefreshMode` accepts `mqtt-piggyback`, shown as **MQTT-assisted Piggyback (experimental)**. It inherits `popupRpcEnabled` and Monitor API requirements from @doc/architecture/shared-rpc-settings. It applies to all existing helper RPC producers; ordinary Piggyback remains the default.

This option requests a native carrier rather than starting a separate HTTP RPC. When helper calls are queued, the interceptor posts a local `mqtt-rpc-nudge` control. The MQTT observer attempts to dispatch a synthetic WebSocket message locally to the game's existing MQTT socket receiver. The game may react by fetching fresh chunks; queued helper calls are then appended to that game-generated request.

## Preconditions and limits

- An actual received PUBLISH must have been observed on the exact game MQTT endpoint (either mapChunksUpdated on world map topic within 60s, or user push on hwm/user/ within 120s).
- Multi-event template tracking: Tracks both World Map chunk updates (triggerTemplate on hwm/pub/global-map/) and user-channel push events (userPushTemplate on hwm/user/<userId>, e.g., bundleCarousel, specialQuestEvents, newReport). When the world map is active (viewedChunks fresh <= 60s), mapChunksUpdated is dispatched; when the world map is idle or unopened, a user-channel push nudge is dispatched locally.
- Active viewport chunk targeting: To avoid requesting off-screen chunks that the client ignores, the observer retains up to 32 recent real MQTT chunks (within 60s) and tracks recent native getChunks coordinates (viewedChunks observed within 60s on the same mapId). When synthesizing a local trigger, observed native coordinates on that map are prioritized and overlaid with updated timestamps max(local Unix milliseconds, updatedAt + 1) (@task-VHE-BZXW0H).
- Action allowlist gate: Queued RPC actions must be registered in helperActionMethods in extension/intercept.js (including createRally, cancelRally, attackMob, attackMine, stopMineGathering, randomDraft_save*, magicTower_*). Unlisted methods are dropped before the interceptor can emit the mqtt-rpc-nudge signal (@task-VHE-X2SJ1X).
- Hybrid carrier fallback: When mqtt-piggyback mode is active, the extension first tries the fast MQTT nudge path (~1s latency for getChunks). If no map carrier responds, calls attach to any periodic native game RPC (e.g., stashClient which fires every ~6s, or user actions) as periodic-fallback, preventing calls from remaining pending.
- The same socket must still be OPEN. Only sockets created after the hook is installed are available; reload the game after updating the extension.
- Both RPC and monitoring must be enabled and the selected mode must still be MQTT-assisted.
- Local triggers are limited to one per five seconds. A blocked/cooling trigger leaves calls pending for ordinary native RPC traffic.
- Templates remain only in page memory; they are not persisted or exported as command payloads.

## MQTT framing and isolation

The synthetic frame is a fresh QoS0 PUBLISH using the observed topic and the socket's detected MQTT version (v4/v5). MQTT v5 includes an empty property block. No packet identifier is reused and no packet is sent with WebSocket.send; dispatch is local via MessageEvent. The socket's Blob/ArrayBuffer delivery mode is respected.

A WeakSet marks synthetic MessageEvents so the observer does not record or reduce them as received server evidence. When Record is enabled, a separate payload-free interaction marker `mqtt-nudge` identifies the helper action. This prevents synthetic notifications from recursively producing extension refreshes or contaminating raw protocol captures.

The shared enable/mode checks still run at queue attachment time. Action expiration, no-action-retry behavior, queue counters and one-game-tab targeting remain as defined by @doc/architecture/shared-rpc-settings.

## Request body and response policy

The native carrier body is preserved. Queued calls are appended, native request IDs remain intact, and appended results are excluded from the response returned to the game. All results remain available for the extension cache.

Full body replacement is not enabled. The user's proposed replacement is conditional on the original API having no effect in the current state; the available evidence does not establish an API/context pair where the engine can lose its original call and response safely. A future replacement policy needs a specific method/state allowlist and proof that the game's expected response contract is preserved. Do not replace arbitrary read requests merely because they appear harmless.

## Status and use

Choose the mode under Settings → RPC dispatch method, enable popup RPC and Monitor API, and use any queued helper action (or click 'Refresh Heroes' in popup Settings or Heroes tab toolbar).

Settings features an interactive telemetry card and badge:
- Fast carrier attached (⚡ <3s latency, native method name like getChunks);
- Fallback carrier attached (⏱️ periodic traffic like stashClient or user action);
- Local trigger delivered (Nudge Sent), awaiting native RPC;
- Missing or expired template, closed socket, cooldown, or disabled gates.

Live rolling telemetry (rpcMqttTelemetry) tracks fast vs fallback carrier counts and the last carrier's method, source, latency, and timestamp. The Heroes tab toolbar also features a dynamic carrier badge next to 'Refresh Heroes'.

A delivered synthetic event requests the engine to act; if the map viewport or client view does not react immediately, the hybrid fallback automatically attaches queued calls to the next periodic or user-driven game RPC within ~6s.

## Verification and evidence boundaries

Implemented in `extension/mqtt-capture.js`, `extension/intercept.js`, `extension/bridge.js` and shared settings UI. Tests in `tests/mqtt-capture.test.mjs` cover MQTT v4/v5 and Blob/ArrayBuffer framing, gates, template age, closed sockets, cooldown, synthetic capture exclusion, a simulated engine generating getChunks, native result isolation, and no separate RPC fallback. Background/bridge tests cover third-mode routing and propagation.

The trigger's message shape is grounded in captured mapChunksUpdated evidence: @doc/api/captured-mqtt-event-catalog. End-to-end behavior has been tested with a simulated engine receiver, not a live authenticated game session. Source tasks: @task-VHE-6PCSC3, @task-VHE-BZXW0H, @task-VHE-X2SJ1X.
