---
id: VHE-96PA6T
title: Track last read guild chat timestamp and compute accurate unread badge count
status: done
priority: high
labels: []
createdAt: '2026-11-02T09:20:04.536Z'
updatedAt: '2026-11-06T10:31:32.448Z'
completedAt: '2026-11-02T09:26:53.622Z'
timeSpent: 0
archivedAt: '2026-11-06T10:31:32.448Z'
---
# Track last read guild chat timestamp and compute accurate unread badge count

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Record the highest ctime of read messages in chrome.storage.local when guild chat is viewed
- [x] #2 Compute unread count by comparing message ctime against lastReadTime
- [x] #3 Show unread badge on chat FAB only when there are unread messages
- [x] #4 Clear unread badge when chat panel or tab is opened
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Acceptance audit 2026-11-06 under @task-VHE-MRH4NM: Verified markGuildChatAsRead stores max ctime in guildChatLastReadTime, getUnreadChatCount compares timestamps, updateGuildChatBadge hides zero and chat opening marks read. Evidence: guild-chat-ui.test.mjs unread/persist/read tests and popup-data.test.mjs unread count. System Decision Impact: none — reconciles existing acceptance state; implementation remediation is tracked separately.
<!-- SECTION:NOTES:END -->

