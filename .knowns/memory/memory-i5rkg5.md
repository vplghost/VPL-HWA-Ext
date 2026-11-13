---
id: i5rkg5
title: Raid energy automation requires an observed natural exact threshold crossing
key: raid-energy-automation-requires-an-observed-natural-exact-threshold-crossing
layer: project
category: pattern
status: active
lastVerified: '2026-11-13T11:16:08.753Z'
sources:
  - '@task-VHE-BPQPT6'
  - '@doc/architecture/raid-target-recovery-and-natural-energy-trigger'
  - 'extension/raid-energy-auto.js:observe'
  - 'extension/raid-queue.js:advance'
tags:
  - raid
  - energy
  - automation
createdAt: '2026-11-13T11:16:08.753Z'
updatedAt: '2026-11-13T11:16:08.753Z'
---

hwaHelperRaidEnergyAuto.observe uses session-stored same-document/account/config baseline, known refill schedule and local 30-second heartbeat. It fires only from below to exactly threshold, not on first observation, above threshold, document reload, observation gaps over 90 seconds or manual source increases. Background consumes the crossing before checking busy/global settings, so skipped triggers never run later. raid-queue refreshes missing or >5-minute target batches and searches after nonexistent-target errors without decrementing remaining count. Evidence: @doc/architecture/raid-target-recovery-and-natural-energy-trigger, tests/raid-energy-auto.test.mjs and tests/raid-queue.test.mjs.
