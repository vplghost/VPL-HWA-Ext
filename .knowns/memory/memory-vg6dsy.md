---
id: vg6dsy
title: Guild roster uses user_getClanInfo and account-scoped outpost joins
key: guild-roster-outpost-observed-contract
layer: project
category: pattern
status: active
confidence: high
lastVerified: '2026-11-14T03:16:24.359Z'
sources:
  - '@doc/architecture/guild-features'
  - '@task-VHE-6WM927'
  - 'src/utils/guildData.ts:currentGuild'
  - tests/guild-data.test.mjs
tags:
  - guild
  - cache
  - account-scope
  - rpc
createdAt: '2026-11-14T03:16:24.359Z'
updatedAt: '2026-11-14T03:16:24.359Z'
---

Guild membership comes from user_getClanInfo, not clan_getSummary (city building/research data). The implemented cache joins getUserClanMembersOutposts:globalMap by exact user ID, requires known active-account membership, rejects stale snapshots and clears associations on account/Guild transitions. Explicit clanData:null clears membership; empty acknowledgements/failures do not. Partial outpost responses retain prior observations for remaining members with timestamps. Canonical source: @doc/architecture/guild-features; @task-VHE-6WM927, commit 2aa8564. Related scoping System Decision remains a draft, not current guidance.
