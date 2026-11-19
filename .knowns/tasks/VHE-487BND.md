---
id: VHE-487BND
title: 'Campaign Raid: implement multi-call batching loop min(items needed, raids possible)'
status: done
priority: high
labels:
  - campaign
  - raid
  - heroes
createdAt: '2026-11-19T17:48:32.872Z'
updatedAt: '2026-11-19T17:53:45.360Z'
completedAt: '2026-11-19T17:53:45.360Z'
timeSpent: 0
---
# Campaign Raid: implement multi-call batching loop min(items needed, raids possible)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update rpcCache to accumulate multiple missionRaid results within same response batch
- [x] #2 Implement multi-call executeRaidCall in CampaignRaidModal with batch size min(items needed, raids possible)
- [x] #3 Update startRaid to execute batched loop and stop automatically when target count reached
- [x] #4 Write unit tests and compile production build
<!-- AC:END -->

