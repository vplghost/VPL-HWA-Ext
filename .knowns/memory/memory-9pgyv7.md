---
id: 9pgyv7
title: Building TimeSpan day prefix must not be parsed as decimal hours
key: building-timespan-day-prefix-must-not-be-parsed-as-decimal-hours
layer: project
category: failure
status: active
lastVerified: '2026-11-13T16:49:43.518Z'
sources:
  - '@doc/architecture/building-and-research-duration-units-and-day-components'
  - 'scripts/lib/remote-duration.mjs:parseRemoteDurationSeconds'
  - 'extension/building-data.js:normalizeQueuedDuration'
  - '@task-VHE-R07HP4'
tags:
  - building
  - research
  - duration
  - debug
createdAt: '2026-11-13T16:49:43.518Z'
updatedAt: '2026-11-13T16:50:14.372Z'
---

Building config durations use [days.]hours:minutes:seconds. The former generator Number(first colon component) interpreted 4.10:59:00 as 4.1 hours + 59 minutes, truncating 102 building-level durations. parseRemoteDurationSeconds fixes this; Hall 20→21 is 385140 base seconds and 223381200 ms at the existing 0.58 estimate. All 898 current Research durations were audited and already correct. normalizeQueuedDuration repairs only exact old default estimates for affected saved automation targets; never rewrite in-flight payloads or authoritative active server timers. Provenance and verification: @doc/architecture/building-and-research-duration-units-and-day-components.
