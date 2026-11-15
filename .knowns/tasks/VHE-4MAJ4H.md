---
id: VHE-4MAJ4H
title: Capture training, universal and overrun speedup contracts
status: on-hold
priority: medium
labels: []
createdAt: '2026-11-15T03:57:40.583Z'
updatedAt: '2026-11-15T03:57:40.583Z'
timeSpent: 0
---
# Capture training, universal and overrun speedup contracts

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Future capture work from @task-VHE-HHPR1K. The Nov15 speedup log proves only dedicated healing/building/research items with empty resourcesToReward. Need authoritative requests/responses for troop-training speedup, universal items, mixed item types and an overrun that exchanges/refunds excess duration. Current UI sends only captured dedicated-item categories and refuses overrun; no RPC method or refund payload is inferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Supply training speedup call with feature, active queue identity, item spend and before/after timer/inventory snapshots.
- [ ] #2 Supply universal/mixed-item and overrun resourcesToReward samples with duration and quantity rules before enabling them.
<!-- AC:END -->

