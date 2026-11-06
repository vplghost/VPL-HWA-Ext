---
id: 20261106-1536-mqtt-assisted-rpc-mode-uses-local-map-update-carriers
title: MQTT-assisted RPC mode uses local map-update carriers
status: draft
supersedes: []
supersededBy: []
tags:
  - rpc
  - mqtt
  - settings
  - experimental
sources:
  - '@task-VHE-6PCSC3'
  - '@doc/architecture/mqtt-assisted-piggyback'
  - 'extension/mqtt-capture.js: triggerGameRefresh'
  - tests/mqtt-capture.test.mjs
relatedDocs:
  - architecture/mqtt-assisted-piggyback
  - architecture/shared-rpc-settings
relatedTasks:
  - VHE-6PCSC3
verification: []
reviewState: needs_evidence
reviewBlockers:
  - 'linked task "VHE-6PCSC3" is "in-progress"; all linked tasks must be done before accepting candidate'
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedHash: '8caa583615e13cc07aad7d8625c1274b52c2d88e57fb142ec85c1db67ce56a6e'
reviewEvaluatedAt: '2026-11-06T08:36:54.561Z'
createdAt: '2026-11-06T08:36:54.561Z'
updatedAt: '2026-11-06T08:36:54.561Z'
---

## Context

User requested an additional global RPC option on 2026-11-06 that lets the game engine initiate a carrier after a simulated MQTT notification, then piggybacks or conditionally replaces a harmless native body.

## Decision

Provide opt-in mqtt-piggyback as a shared mode. Locally inject only a recent validated mapChunksUpdated template on its open native MQTT socket with fresh QoS0 framing and strict rate/gate checks. Exclude synthetic packets from server capture/reduction. Preserve native RPC body/results and append queued calls; no Direct fallback. Full body replacement remains unqualified until a specific method/state and response-preservation contract are established.

## Alternatives Considered


## Consequences
