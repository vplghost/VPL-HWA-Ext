---
id: VHE-3WEX9T
title: Fix Header Legend Draft and Mail badge indicators triggering on inactive cache
status: done
priority: high
labels: []
createdAt: '2026-11-11T10:44:10.504Z'
updatedAt: '2026-11-11T10:44:14.863Z'
completedAt: '2026-11-11T10:44:14.863Z'
timeSpent: 0
assignee: me
---
# Fix Header Legend Draft and Mail badge indicators triggering on inactive cache

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Legend Draft alert only displays when draft stage is active (stages 1-6) and active !== false
- [ ] #2 Mail badge only displays when there are actual unclaimed letters or battle reports
- [ ] #3 Clicking mail badge triggers quick refresh RPC for report page and mailGetAll
<!-- AC:END -->

