---
id: VHE-6PCSC3
title: Add MQTT-assisted piggyback RPC dispatch option
status: done
priority: high
labels: []
createdAt: '2026-11-06T07:24:34.308Z'
updatedAt: '2026-11-06T10:31:32.083Z'
completedAt: '2026-11-06T08:37:35.115Z'
timeSpent: 4371
archivedAt: '2026-11-06T10:31:32.083Z'
---
# Add MQTT-assisted piggyback RPC dispatch option

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an opt-in global MQTT-assisted Piggyback mode: locally inject a bounded map-update notification using a recently observed MQTT template, let the game initiate its native map refresh, then append queued helper calls. Preserve native body/results because no safe full replacement contract has been established.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shared settings offer MQTT-assisted Piggyback and every helper RPC inherits it while existing enable/monitor gates remain enforced.
- [x] #2 Only recent valid mapChunksUpdated templates on an open MQTT socket can trigger a local QoS0 message; synthetic messages are never recorded/reduced as real server events.
- [x] #3 Queued calls piggyback on game-owned RPC; no separate RPC fallback, no blind body replacement, bounded injection rate and clear unavailable status.
- [x] #4 Regression tests cover MQTT v4/v5 framing, engine-carrier integration, gating, template expiry, loop prevention and settings propagation; docs/build validation pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Propagate a third shared dispatch mode across bridge, interceptor and settings UI while keeping background queued routing.
2. Add a locally injected MQTT QoS0 map-update trigger derived from a recent validated inbound template, with open-socket checks, cooldown and synthetic-event exclusion.
3. Request one bounded trigger per queued batch; keep original native RPC body/result isolation and no Direct fallback.
4. Add transport/engine integration and mode propagation tests; document prerequisites and the unproven body-replacement condition.
5. Run regression suite, syntax/build and Knowns validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented third shared dispatch mode mqtt-piggyback across bridge/interceptor/settings. On enqueue, request a local mapChunksUpdated PUBLISH based on a <=60-second validated real template, preserving observed coordinates and advancing update metadata. Require popup RPC, Monitor API, selected mode and open original socket; rate limit to one trigger/5 seconds. Build fresh QoS0 v4/v5 framing matching Blob/ArrayBuffer delivery; WeakSet excludes synthetic events from raw capture/reduction. No WebSocket.send or separate HTTP RPC is used for the trigger. Native game RPC body/results remain intact with normal append/filter handling. Settings distinguish trigger delivery from actual carrier attachment and report missing/stale templates, closed sockets and cooldown. Body replacement not enabled: no proven harmless API/state+response contract exists in available evidence. Simulated engine integration verifies getChunks carrier generation, appended calls and native-only response; live authenticated game behavior remains unverified and mode is labeled experimental. npm run check passes: 249 passed, 10 explicit optional-private-trace skips, 0 failed; build 0.9.73; syntax/diff/doc validation pass. System Decision Impact: candidate @decision/20261106-1536-mqtt-assisted-rpc-mode-uses-local-map-update-carriers (added) — records the opt-in global carrier-trigger mode and native-body preservation.
<!-- SECTION:NOTES:END -->

