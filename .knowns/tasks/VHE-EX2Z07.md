---
id: VHE-EX2Z07
title: Fix Claim All daily bonus VIP argument when user VIP level is insufficient
status: done
priority: high
labels:
  - dashboard,automation,rpc
createdAt: '2026-11-21T05:52:48.848Z'
updatedAt: '2026-11-21T05:54:41.300Z'
completedAt: '2026-11-21T05:54:41.300Z'
timeSpent: 0
---
# Fix Claim All daily bonus VIP argument when user VIP level is insufficient

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calculate user VIP level from vipPoints
- [ ] #2 Only include { vip: 1 } when user VIP satisfies day requirement
- [ ] #3 Prevent fatal RPC error NotEnough vip level
<!-- AC:END -->

