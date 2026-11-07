---
id: VHE-BZXW0H
title: Fix MQTT assisted piggyback native carrier trigger
status: done
priority: high
labels: []
createdAt: '2026-11-07T12:40:59.964Z'
updatedAt: '2026-11-07T12:43:42.947Z'
completedAt: '2026-11-07T12:43:42.947Z'
timeSpent: 0
---
# Fix MQTT assisted piggyback native carrier trigger

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Synthetic MQTT trigger targets observed active map chunks and causes a native getChunks carrier in the simulated engine.
- [x] #2 Triggered helper RPCs still use native piggyback isolation and tests/build pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Correlate captured MQTT map updates with native getChunks. Fix template selection or packet construction, add regression tests, run targeted and broad checks, build and document evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause from capture: latest mapChunksUpdated sample can be outside the last native getChunks viewport; nudge markers did not prove native causality. Fix: retain 32 recent MQTT chunks and prefer recent native getChunks coordinates on the same map. Simulated watched-chunk carrier and isolation tests pass; 329 regression tests pass; build 0.9.103. Live authenticated behavior remains unverified. System Decision Impact: none; preserves native piggyback and no Direct fallback. Project memory 7upwu0 created. Existing Knowns doc update hit alternating mutation-conflict hashes, so it was left untouched.
<!-- SECTION:NOTES:END -->

