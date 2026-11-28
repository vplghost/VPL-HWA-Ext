---
id: VHE-JJXHS7
title: 'P1-23: Dashboard Personal Titanite Accuracy — Trust Authoritative Live Value & Self-Heal Poisoned Daily History'
status: done
priority: high
labels: []
createdAt: '2026-11-28T16:58:11.325Z'
updatedAt: '2026-11-28T17:01:03.172Z'
completedAt: '2026-11-28T17:01:03.172Z'
timeSpent: 0
---
# P1-23: Dashboard Personal Titanite Accuracy — Trust Authoritative Live Value & Self-Heal Poisoned Daily History

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add hasAuthoritativePersonalTitanite in activityStats.ts so Dashboard Daily Progress & Automation uses live server Titanite 1:1 with DungeonModal and self-heals poisoned dailyActivityHistory entries across the 00:00-02:00 UTC reset gap or account switches; add reactive nowTick in IncomeOverview.vue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 getActivityStatsForDay and persistDailyActivityStats trust live authoritative personalTitaniteToday (1:1 with DungeonModal) and self-heal inflated history values
- [x] #2 Offline fallback preserves existing.personalTitaniteToday when no authoritative source is loaded and accountId matches
- [x] #3 Unit tests in tests/activity-stats.test.mjs, full npm test (0 fail), and dual npm run build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed P1-23 (v0.11.412): Dashboard Personal Titanite now trusts authoritative live value 1:1 with DungeonModal and self-heals poisoned dailyActivityHistory entries; reactive 60s clock added to IncomeOverview.vue. Verified: 1,427 pass / 0 fail, dual build (dist/ + .output/chrome-mv3/) passed.
<!-- SECTION:NOTES:END -->

