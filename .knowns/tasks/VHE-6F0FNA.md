---
id: VHE-6F0FNA
title: Fix Free Spin need account data deadlock and enable proactive account recovery
status: done
priority: high
labels:
  - bug
  - free-spin
createdAt: '2026-11-15T16:28:19.908Z'
updatedAt: '2026-11-15T16:40:55.955Z'
completedAt: '2026-11-15T16:40:55.955Z'
timeSpent: 0
assignee: '@me'
---
# Fix Free Spin need account data deadlock and enable proactive account recovery

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Free spin resolves account ID from cached storage or proactive account query without F5 loop
- [ ] #2 Bridge script initializes freeSpinAccountId from rpcCache storage and intercepts account login RPCs
- [ ] #3 Auto free spin unit tests verify account context resolution and spin trigger
<!-- AC:END -->

