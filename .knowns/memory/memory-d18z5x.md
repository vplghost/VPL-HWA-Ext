---
id: d18z5x
title: Sync healed troops requires completeHealing mutation
key: sync-healed-troops-requires-completehealing-mutation
layer: project
category: failure
status: active
lastVerified: '2026-11-13T06:51:09.040Z'
sources:
  - 'src/composables/useTroopTraining.ts::syncHealed'
  - tests/healing-sync.test.mjs
  - '@task-VHE-CMZHNT'
  - '@doc/api/world-map-rpc-contracts'
tags:
  - healing
  - rpc
  - debug
createdAt: '2026-11-13T06:51:09.040Z'
updatedAt: '2026-11-13T06:51:09.040Z'
---

Vue Sync Healed previously sent only snapshot reads, leaving finished hospital healing uncollected and the next Heal All inaccessible. useTroopTraining.syncHealed must send completeHealing:unit with millisecond completeDate before authoritative unit/healing reads; only confirmed responses release the elapsed run. The supplied 2026-11-13 capture also has a five-unit 40000 ms heal, disproving the old 60000 ms minimum. See @task-VHE-CMZHNT and @doc/api/world-map-rpc-contracts.
