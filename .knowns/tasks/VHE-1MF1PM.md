---
id: VHE-1MF1PM
title: Add Guild Chat optimistic UI, direct RPC response handling, and auto-fetch on open
status: done
priority: high
labels:
  - ui,chat,performance
createdAt: '2026-11-20T17:15:56.388Z'
updatedAt: '2026-11-20T17:51:12.157Z'
completedAt: '2026-11-20T17:51:12.157Z'
timeSpent: 0
---
# Add Guild Chat optimistic UI, direct RPC response handling, and auto-fetch on open

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Render optimistic pending message with spinner when sending a message
- [ ] #2 Ingest chatGetAll response from dispatchRpc directly into local chat data
- [ ] #3 Auto-fetch chatGetAll when opening GuildChatPanel if cache is stale or empty
- [ ] #4 Pass all UI and component unit tests
<!-- AC:END -->

