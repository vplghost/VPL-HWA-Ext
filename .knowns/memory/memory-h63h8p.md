---
id: h63h8p
title: Daily quest titles join remote conditions to English locale templates
key: daily-quest-titles-join-remote-conditions-to-english-locale-templates
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T15:00:03.665Z'
ttlDays: 90
sources:
  - '@task-VHE-X39972'
  - scripts/generate-quest-data.mjs
  - tests/daily-quest-config.test.mjs
  - '@doc/architecture/goals-tracking'
tags:
  - quests
  - locale
  - metadata
  - daily
createdAt: '2026-11-14T15:00:03.665Z'
updatedAt: '2026-11-14T15:00:03.665Z'
---

Daily pack names are generated from hash-verified quest/questChain/questCondition/dailyQuestPack plus size/MD5-verified English locale, not inferred ID ranges. Chain135 camp quests362/363/364 have cumulative targets1/5/10, transferProgress=true; #364 is Clear Brigand Camp 10 times. #365 is world-map gathering, never Tower-locked; #2413 is Start Research. Use npm run quests:update and canonical provenance: @doc/architecture/goals-tracking. Unsupported templates/params stay unknown.
