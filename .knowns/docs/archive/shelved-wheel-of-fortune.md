---
id: doc-2ac6388a8df3d976339f644736738138
title: Shelved Wheel of Fortune
description: Wheel/Free Spin feature suspended by user, preserved source snapshot and conditions for resuming work
createdAt: '2026-11-06T04:32:14.933Z'
updatedAt: '2026-11-06T04:32:14.933Z'
tags:
  - archive
  - wheel
  - shelved
---

# Shelved Wheel of Fortune

## Status

Shelved by explicit user instruction on 2026-11-06 in @task-VHE-8D82V9. Do not develop, monitor, infer free-spin state or restore the header badge until the user gives new instructions.

## Preserved implementation

`archive/wheel/free-spin.snapshot.txt` preserves the former badge logic, snapshot/action/reducer code, refillable rule and historical tests. This is a non-executable archive outside extension/dist; it is not loaded or run by the application or test runner.

Live Wheel-specific tracking has been removed. Resource extraction ignores refillable 62 and the popup excludes any retained legacy Wheel resource data. Raw API capture remains generic; recording an API payload does not activate Wheel-specific tracking.

The former header location now displays the actual number of RPC calls awaiting piggyback dispatch. Counts exclude in-flight calls, aggregate game tabs, and update on enqueue, dispatch, restore, cancellation, expiry and tab closure.

## Resume condition

A future explicit user instruction is required. On resumption, obtain fresh wire/UI evidence before trusting the archived cooldown assumptions; the archive records the old implementation, not a current validated game contract.
