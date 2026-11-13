---
id: k5lpao
title: Quest feeds require separate eligibility filters
layer: project
category: pattern
status: proposed
confidence: high
lastVerified: '2026-11-07T00:20:43.074Z'
ttlDays: 90
sources:
  - extension/rpc-cache.js
  - extension/popup-data.js
  - @doc/architecture/goals-tracking
tags:
  - quests
  - dashboard
  - events
createdAt: '2026-11-07T00:20:43.074Z'
updatedAt: '2026-11-07T00:20:43.074Z'
---

The startup capture confirms getDailyQuests:quest.data.quests is the authoritative daily progress list, while specialQuestStatus.data.events is a separate timed event feed and questEvents is metadata that can be hidden. For user-facing goals, require active event time, visible view and group, and a quest absent from inactiveQuestIds; completed special quests are not automatically claimable. Checkable code: hwaHelperRpcCache.extract, dailyDashboard, extractEventGoals; context: @doc/architecture/goals-tracking.
