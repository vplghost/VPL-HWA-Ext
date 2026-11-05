---
id: 218mbi
title: Solo monster attacks use report results and estimated return timing
key: solo-monster-attacks-use-report-results-and-estimated-return-timing
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-05T05:13:32.468Z'
sources:
  - extension/rpc-cache.js
  - extension/popup-data.js
  - '@task-VHE-DVWXWW'
tags:
  - marches
  - monster
  - world-energy
createdAt: '2026-11-05T05:13:32.468Z'
updatedAt: '2026-11-05T05:13:32.468Z'
---

`attackMob:mob` supplies the squad/team and outbound route; `getPage:report` supplies `soloMobAttackResult` with `payload.result`. The 2026-11-05 captured `globalMapMobSolo` config charges 10 World Energy per solo attack. A report can mark the squad returning, but absent a return route, its return ETA is estimated from the outbound duration; later route/snapshot data should supersede that estimate. Keep failed outcomes in bounded result history after the march badge expires.
