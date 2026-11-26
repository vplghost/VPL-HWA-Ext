---
id: VHE-WVKQTN
title: 'Fix Dashboard Campaign Raid counter, actual campaign energy & Personal Titanite accuracy (p1-17)'
status: done
priority: high
labels:
  - bugfix,dashboard,activity-stats,p1-17
createdAt: '2026-11-26T18:22:22.281Z'
updatedAt: '2026-11-26T18:25:05.466Z'
completedAt: '2026-11-26T18:25:05.466Z'
timeSpent: 0
---
# Fix Dashboard Campaign Raid counter, actual campaign energy & Personal Titanite accuracy (p1-17)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rpcCache tracks compact campaignDailySummary (<=7 UTC days, <=30 recentIdents, no new storage.local keys) counting batched multi-raids & actual energySpent without double-counting
- [x] #2 activityStats reads campaignDailySummary & actual energySpent (with backward compatibility) and preserves actual energy in getActivityStatsForDay
- [x] #3 resolvePersonalTitaniteToday aggregates guildStatus todayDungeonActivity, max of Titanite quests [10031,10032,10108], and UTC-aligned dungeonStatus, shared by Dashboard and DungeonModal
- [x] #4 CampaignRaidModal fast-path syncs campaignDailySummary by ident and IncomeOverview displays actual mission energy subtitle
- [x] #5 Unit tests and full build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed p1-17: compact campaignDailySummary (<1KB, <=7 UTC days, <=30 recentIdents, no new storage.local keys) tracking multi-raids & actual energy, resolvePersonalTitaniteToday shared across Dashboard & DungeonModal (uncapped guildStatus + max quests + UTC dailyCombatLog). Verified 1337 pass / 0 fail.
<!-- SECTION:NOTES:END -->

