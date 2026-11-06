---
id: rbqezg
title: Rally first dispatch must use selected boss snapshot
layer: project
category: failure
status: proposed
tags:
  - rally
  - rpc
createdAt: '2026-11-06T14:08:55.553Z'
updatedAt: '2026-11-06T14:08:55.553Z'
---

A captured Start rally session completed heroGetAll/getUnitSummary and a second searchMob without recording createRally; replaying the capture showed the selected boss and troop data were already sufficient. The first dispatch now builds createRally directly from those snapshots; reserve roster refresh and boss search for later queue rounds. Evidence: @task-VHE-992BGT and hwaHelperRaidQueue.start.
