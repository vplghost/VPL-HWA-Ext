---
id: doc-a6f335cb1ecfe4f9e42b56b8b7fa18f3
title: Guild Features
description: Guild member/outpost snapshots, account/Guild scope, member statistics, chat FAB and API Log dialog routing
createdAt: '2026-11-03T14:32:55.942Z'
updatedAt: '2026-11-14T01:53:00.503Z'
tags:
  - guild
  - guild-chat
  - unread
  - fab
---

# Guild Features

## Overview
Guild features in HWA Helper include a persistent FAB (Floating Action Button) for guild chat access, reverse-chronological message display with progressive 50-message paging, auto-scroll to bottom, 7-day history retention, last-read timestamp persistence, and an accurate unread badge count — all isolated from the main popup view to prevent content overwrite.

## Guild Chat FAB
- A dedicated guild chat FAB button opens/closes the guild chat panel without navigating away from the current tab.
- Opening the FAB does NOT replace the main view content or the active tab status — VHE-Q1PGF6 fixed a regression where FAB open was triggering a full tab re-render.
- FAB shows a numeric unread badge (#guild-chat-badge) when there are messages with ctime greater than the last read timestamp.

## Last-Read Timestamp Tracking
- currentGuildChatLastReadTime (module-level in popup.js, initialized to 0) holds the in-memory read cursor.
- On popup open, guildChatLastReadTime is loaded from chrome.storage.local alongside other settings (autoClaimSettings, favoriteHeroes, tabConfig, etc.).
- When the chat panel is opened or scrolled, the maximum ctime of visible messages is recorded: if it exceeds currentGuildChatLastReadTime, the new value is written to chrome.storage.local and updateGuildChatBadge is called immediately.

## Unread Badge Computation
getUnreadChatCount(messages, lastReadTime) in popup-data.js:
- Filters messages array to those with Number(m.ctime) > Number(lastReadTime || 0).
- Returns the count; capped at '99+' for display in the badge element.
- updateGuildChatBadge(cache, lastReadTime) in popup.js reads guildChat messages from cache, calls getUnreadChatCount, and sets badge visibility and text. Badge is hidden when unreadCount === 0.

## Message Display and Reverse-Scroll Paging
- Messages are displayed bottom-to-top (newest at bottom, sorted chronologically ascending by ctime), matching native guild chat UI convention.
- On open, the chat container automatically scrolls to the bottom (container.scrollTop = container.scrollHeight).
- Progressive paging: default display limit is 50 newest messages (allMessages.slice(-displayLimit)).
- When scrolling up near the top (scrollTop <= 15), the display limit increments by 50 and the scroll position is compensated (container.scrollHeight - prevScrollHeight + prevScrollTop) to allow seamless history browsing.
- Chat input supports dark theme styling pairing dark:focus:bg-slate-800 with dark:text-slate-100 to prevent focus styling from reverting to a white background.

## 7-Day Message Retention
- Guild chat messages have a strict 7-day retention period (7 * 86400 seconds).
- In extension/rpc-cache.js, both incoming merge (chatGetAll) and cache pruning (pruneCache) filter out messages where ctime < recordTime - 7 * 86400.
- Orphaned users whose messages have aged out are cleanly pruned from guildChat.data.users.

## View Isolation
- Guild chat panel (#guild-chat-panel) is a floating overlay, not a tab content replacement.
- Switching tabs while chat is open does not close the panel; it remains visible above tab content.
- Closing the panel with the X button restores focus to the previously active tab without triggering a full popup reload.

## Message Sync
- Guild chat messages arrive via the guildChat RPC cache key (passive interception from intercept.js).
- The cache key is excluded from the standard snapshot comparison diff to prevent the chat panel from triggering spurious full re-renders on every new message.
- Message data is not available until the user opens in-game Guild Chat at least once per session.

## Key Invariants
- Never overwrite mainView content when the guild chat FAB is opened.
- Always compare ctime as Number, not string, to avoid lexicographic ordering bugs.
- Always prune messages older than 7 days from storage and active display.
- Write guildChatLastReadTime to chrome.storage.local only when a genuinely newer message is seen.
- unreadCount > 99 must display as '99+' not as the raw number.
- Dark theme inputs must avoid unqualified focus:bg-white classes without dark:focus:bg-slate-800.

## Source Provenance
- @task-VHE-GSFVHT (Guild chat FAB + reverse scroll initial implementation)
- @task-VHE-96PA6T (last-read timestamp + unread badge count)
- @task-VHE-Q1PGF6 (view isolation fix: prevent main view overwrite on FAB open)
- Symbols: GuildChatPanel.vue in src/components/common/GuildChatPanel.vue
- Symbols: renderGuildChat, updateGuildChatBadge, markChatRead in extension/popup.js
- Symbols: getUnreadChatCount in extension/popup-data.js
- Symbols: rpc-cache.js line 3678 (merge) and line 4317 (prune) in extension/rpc-cache.js


## Guild member and outpost tab (2026-11-14)

Implemented by @task-VHE-6WM927. Use **Guild** in the UI, matching current official locale `UI_MAINMENU_CLAN`/`MECHANIC_UNLOCKED_CLAN`; preserve wire method names containing `clan`. `clan_getSummary` belongs to city building/research data and is not the Guild roster.

Observed contracts in `hwa-game-record-202611100940_dungeon.json` and `hwa-game-record-202611112214_increase_skill.json`:

- `user_getClanInfo` (no feature/args) returns `clanData.clan` with Guild ID/title/owner/level/description/custom role names and `members` keyed by player ID. Member fields include name, level, clanId/clanRole, avatar/border, server and Unix-second lastLoginTime. `clanData.membersStat[]` joins by userId and contains today/total activity, today/total dungeon activity, recorded raidDamage and wasChampion.
- `getUserClanMembersOutposts` with feature `globalMap` and empty args returns `outposts[]`: userId, username, outpostId, outpostLevel, coordinates, mapId and flag. Coordinates are useful display data; UUIDs are internal correlation data. A replay of the first capture yields30members and30outposts.

The passive reducer creates `guildStatus` and `guildOutposts`. Own-account identity must be known, and the own player must belong to the returned roster. A roster is authoritative for membership; departed/foreign members do not survive into the current view. Outposts can arrive before or after the roster, are matched by exact user ID, and are bound to the active account/Guild once known. Changing account clears these stores; changing Guild discards prior-Guild outpost associations. Empty acknowledgements and failures are not no-Guild snapshots; explicit `clanData:null` clears membership. Timestamp guards reject older snapshots. The latest known outpost for remaining members is retained, with its observation timestamp, when a later partial outpost response omits it.

`GuildTab.vue` shows member basics, official/custom roles, activity/Titanite, outpost level/coordinates and last login. Member expansion shows recorded totals, server and observation times. Missing fields show unavailable states rather than fabricated zeros. Search/filter/sort and filtered JSON export are supported. Owner/255 is Guild Master; roles4/3 follow the repository's verified Officer/Member mapping and server custom role names; unknown role codes remain unavailable. Refresh uses `userGetInfo`, `user_getClanInfo`, and `getUserClanMembersOutposts:globalMap`, respecting global RPC settings and strict read allowlists. Raw account/outpost/map IDs are not printed in the table.

Regression coverage is in `tests/guild-data.test.mjs`: both response arrival orders, foreign member filtering, account/Guild/no-Guild transitions, unknown roles, actual SFC rendering, filters, refresh and export.

## Log dialog and FAB routing (2026-11-14)

Implemented by @task-VHE-WEDXQP. API Log is now `LogModal.vue`, reusing the existing log viewer and recording/filter/sort/clear/export behavior. The FAB opens Guild Chat or API Log without replacing the active tab. Tower/Dungeon FAB entries are removed; Dashboard activity launchers and their global dialogs remain. TabNav/Settings discard the obsolete Log tab ID and include Guild while retaining other tab visibility/order preferences. ModalDialog supplies the existing explicit-dismissal/backdrop policy. `tests/log-dialog-navigation.test.mjs` covers routing and legacy tab-setting normalization.
