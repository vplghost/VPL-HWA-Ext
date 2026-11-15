---
id: 945ksn
title: Native mine completion pushes preserve the fresh-troop return gate
layer: project
category: pattern
status: proposed
tags:
  - gathering
  - mqtt
createdAt: '2026-11-15T07:13:18.888Z'
updatedAt: '2026-11-15T07:13:18.888Z'
---

extractSocket and the mineMarchAction reducer apply captured gatheringMineCompleted routeToOutpost and returnFromMineCompleted to known own-account squads. marchReturnStatus completion timestamps make smart.sync require unit observations after actual return, while marchSnapshotStatus retains proof of full initial hydration. See @doc/architecture/passive-first-gathering-march-observations and @task-VHE-ZRSTK3; regression evidence: tests/gather-passive.test.mjs.
