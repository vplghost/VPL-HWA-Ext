---
id: 48uyvl
title: Version-aware read coalescing preserves trailing invalidations
layer: project
category: pattern
status: proposed
tags:
  - rpc
  - mqtt
  - cache
createdAt: '2026-11-15T07:54:20.045Z'
updatedAt: '2026-11-15T07:54:20.045Z'
---

hwaHelperWorldRead.plan retains the highest rally version or latest unversioned invalidation during an in-flight read, persists one trailing refresh and lets native details satisfy it. Freshness is scoped to account/map/version and full initial hydration; explicit join and cancellation checks bypass optional debounce. Request-count regressions must also assert the latest cached version. Provenance: @task-VHE-F8X6B6, @doc/architecture/passive-first-gathering-march-observations, extension/world-read.js and tests/world-read.test.mjs; committed in4e40db7.
