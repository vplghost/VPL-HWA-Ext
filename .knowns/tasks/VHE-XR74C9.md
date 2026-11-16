---
id: VHE-XR74C9
title: Add interactive refresh action button to modal error banners
status: done
priority: high
labels:
  - ui
  - ux
  - modal
createdAt: '2026-11-15T16:28:29.883Z'
updatedAt: '2026-11-16T03:39:08.873Z'
completedAt: '2026-11-15T16:46:30.755Z'
timeSpent: 0
assignee: '@me'
---
# Add interactive refresh action button to modal error banners

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Create reusable StatusAlertBanner component with normal, loading, success, and error states
- [x] #2 Integrate StatusAlertBanner into RaidModal and MonsterModal error banners
- [x] #3 Clicking refresh executes troop and march RPC queries and updates status icon to success or error
- [x] #4 Unit tests verify banner state transitions and refresh trigger
<!-- AC:END -->

