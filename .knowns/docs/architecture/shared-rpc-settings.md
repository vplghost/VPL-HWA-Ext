---
id: doc-ae23757efba5a35e23544c6e9aabb147
title: Shared RPC Settings
description: User rule that every helper RPC inherits shared enable and dispatch mode settings unless an explicit feature override exists
createdAt: '2026-11-06T04:21:46.197Z'
updatedAt: '2026-11-08T10:10:18.099Z'
tags:
  - rpc
  - settings
  - rule
  - architecture
---

# Shared RPC Settings

## User rule

All extension-generated RPC calls inherit the shared RPC settings by default. This covers existing and future experimental functions, Draft submissions, manual refreshes, reward claims, MQTT-triggered refreshes and automatic follow-up snapshots. A feature must not silently force Direct, bypass the enable switch or introduce an implicit exception. Any future override requires an explicitly specified feature setting; none is defined by this rule.

Requested explicitly by the user on 2026-11-06 and implemented in @task-VHE-62VVG5.

## Settings contract

| Setting | Default | Required behavior |
|---|---|---|
| `popupRpcEnabled` | false | No extension-originated RPC when false/unset. |
| `socketRefreshMode` | piggyback | `piggyback` waits for native RPC; `mqtt-piggyback` can request a native carrier via a local MQTT map notification; only `direct` sends a separate immediate RPC. |
| `captureSettings.interceptEnabled` | enabled unless explicitly false | Both Piggyback modes require monitoring. Direct can run while passive monitoring is off. |

These are shared modes, not feature-specific bypasses. Neither Piggyback mode may fall back to Direct. MQTT assistance uses a fresh validated native map-update template, an open socket and bounded local injection; see @doc/architecture/mqtt-assisted-piggyback. No full request-body replacement has been qualified.

`engine-ping` is local diagnostics. Generic Unity commands cannot be serialized into a known piggyback RPC; they are rejected in both Piggyback modes and remain enable-gated in Direct.

## Enforcement and queue lifecycle

`rpcMessageForSettings` in `extension/background.js` resolves transport for manual and automatic producers. `extension/intercept.js` checks the current mode and enable switch again at execution. Legacy `refresh-rpc` and `draft-action` controls cannot force Direct while the shared mode is Piggyback.

Disabling RPC, disabling monitoring or switching to Direct clears queued calls before dispatch. Calls already sent cannot be recalled by changing settings. Read-only refresh calls may retry after incomplete/network responses only while Piggyback and monitoring remain enabled. Mutating calls (claims, rally creation, gathering, recall, Draft submission) are consumed once and never automatically retried after dispatch.

Pending helper actions expire after two minutes without a suitable game RPC; expiry is enforced before attachment. Reward claims additionally emit an expiry status. The queue is bounded to 64 unique calls; read-only entries may be displaced before pending actions. A Draft save/claim must precede its companion refresh, including when the native batch contains an earlier copy of that read.

Append results are captured for the extension and stripped from the response returned to the game. Preserve original request IDs for Piggyback. A queued/forwarded acknowledgement is not server success; UI must say queued until response data arrives.

## Adding a feature

1. Construct the feature's known RPC payload, preserving method/feature/args.
2. Dispatch through the settings-aware background route.
3. Register any new mutating action in the interceptor's `helperActionMethods` allowlist (`extension/intercept.js`) and any read-only method in `piggybackMethods`. Unlisted methods are dropped at enqueue time before they can attach to a native carrier or trigger an MQTT nudge (@task-VHE-X2SJ1X). Never classify a mutation as a retryable read.
4. Test disabled, default Piggyback, MQTT-assisted Piggyback, explicit Direct, monitoring disabled, settings changes while queued, and failure/expiry behavior.
5. Introduce a feature override only after the user explicitly specifies its settings contract.

Current tests: `tests/background.test.mjs`, `tests/intercept.test.mjs`, `tests/mqtt-capture.test.mjs`, `tests/events-ui.test.mjs`, `tests/legend-draft-ui.test.mjs`.

Related references: @doc/architecture/rpc-cache-pipeline, @doc/architecture/auto-claim-automation-bridge, @doc/architecture/mqtt-assisted-piggyback, @doc/api/mqtt-processing-and-refresh.

## Queue visibility

The header RPC queue count is published by the actual page interceptor (`rpc-queue-status`), forwarded by the bridge and aggregated per game tab in background session state. It counts unique pending RPC calls rather than batches or in-flight requests. Action expiry publishes a new count even when no game fetch occurs; closing a game tab removes its count. The bridge forwards counts only, never command payloads. This replaces the shelved Wheel badge: @doc/archive/shelved-wheel-of-fortune.
