---
id: VHE-0RENVD
title: Add Gold and Emerald income analytics and 7-day trend chart to Dashboard
status: done
priority: high
labels:
  - dashboard,analytics,income
createdAt: '2026-11-15T09:28:46.596Z'
updatedAt: '2026-11-15T09:44:39.389Z'
completedAt: '2026-11-15T09:44:39.389Z'
timeSpent: 0
assignee: '@me'
---
# Add Gold and Emerald income analytics and 7-day trend chart to Dashboard

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Aggregate today gold and emerald income with breakdown by source on Dashboard
- [x] #2 Provide dedicated date-range income chart defaulting to previous 7 days excluding current day
- [x] #3 Support custom date range filtering with breakdown by source
- [x] #4 Strictly follow English-only UI, WXT Vue 3 conventions, and defensive collection handling
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create src/utils/resourceIncome.ts to aggregate Gold and Emerald income with source breakdown and UTC date bucketing. 2. Build src/components/dashboard/IncomeOverview.vue featuring Today income breakdown and an interactive SVG Daily Trend Chart (default: last 7 days excluding today). 3. Integrate IncomeOverview into DashboardTab.vue below ResourceSummary with responsive English-only UI. 4. Write tests in tests/resource-income.test.mjs covering aggregation, source breakdown, date filtering, and defensive collection handling. 5. Run npm run check to verify typecheck, tests, and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented resourceIncome.ts utility and IncomeOverview.vue component on Dashboard. Verified mine sources (World map mines only provide Food, Wood, Stone, Iron; Gold is earned via Emerald Exchange, Combat/Mail Reports, Tower, Campaign, Quests, Dungeon, Brigands). Added 7-day SVG trend chart excluding current day, Today breakdown card, and unit tests passing 866/866 tests.
<!-- SECTION:NOTES:END -->

