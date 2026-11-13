---
id: noqdlr
title: Guild chat enforces 7-day retention, 50-message paging, and dark theme focus styles
layer: project
category: convention
status: proposed
confidence: high
lastVerified: '2026-11-13T02:32:40.074Z'
ttlDays: 90
sources:
  - src/components/common/GuildChatPanel.vue
  - extension/rpc-cache.js
  - '@doc/architecture/guild-features'
tags:
  - guild-chat
  - retention
  - ui
  - dark-theme
createdAt: '2026-11-13T02:32:40.074Z'
updatedAt: '2026-11-13T02:32:40.074Z'
---

Guild chat displays messages chronologically with newest at the bottom and auto-scrolls down on open. Initial page is 50 newest messages with reverse infinite scroll. Messages older than 7 days (7 * 86400s) are purged during rpc-cache merges and pruneCache. Dark inputs must pair dark:focus:bg-slate-800 with dark:text-slate-100 to avoid white focus washouts. Cite: GuildChatPanel.vue, rpc-cache.js, @doc/architecture/guild-features.
