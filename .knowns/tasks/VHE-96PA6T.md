---
id: VHE-96PA6T
title: Track last read guild chat timestamp and compute accurate unread badge count
status: done
priority: high
labels: []
createdAt: '2026-11-02T09:20:04.536Z'
updatedAt: '2026-11-02T09:26:53.622Z'
completedAt: '2026-11-02T09:26:53.622Z'
timeSpent: 0
---
# Track last read guild chat timestamp and compute accurate unread badge count

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Record the highest ctime of read messages in chrome.storage.local when guild chat is viewed
- [ ] #2 Compute unread count by comparing message ctime against lastReadTime
- [ ] #3 Show unread badge on chat FAB only when there are unread messages
- [ ] #4 Clear unread badge when chat panel or tab is opened
<!-- AC:END -->

