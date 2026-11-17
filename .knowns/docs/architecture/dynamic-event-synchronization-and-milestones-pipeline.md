---
id: doc-c3cf26937d0b4cab5729ac111b7b6fbc
title: Dynamic Event Synchronization and Milestones Pipeline
description: Architecture, CDN synchronization, milestone ladder resolution, and interactive event detail dialog model for dynamic live events in HWA Helper
createdAt: '2026-11-17T15:05:32.761Z'
updatedAt: '2026-11-17T15:06:20.524Z'
tags:
  - events
  - cdn
  - sync
  - milestones
  - rpc
  - ui
---

# Dynamic Event Synchronization and Milestones Pipeline

## 1. Overview & Problem Context
In Hero Wars: Alliance (HWA), live special quest events and Battle Passes change on a weekly or seasonal basis. Hardcoding event definitions, view titles, quest chains, and milestone thresholds causes extension desynchronization whenever new events roll out.

This architecture establishes a dynamic synchronization and rich milestone pipeline that:
1. Passively captures live event status and CDN configuration URLs from game RPC and MQTT traffic.
2. Automatically synchronizes versioned remote configs from the Nexters CDN without requiring extension updates or rebuilds.
3. Decodes and presents detailed tier milestones: objective task, unit of measurement, target requirement, current progress, percentage, and reward badges.
4. Integrates an interactive Event Viewer & Milestones modal with one-click RPC reward claiming and live progress tracking.

---

## 2. Architecture & Component Pipeline

```
+-------------------------+      +-------------------------+
|      Game Server        |      |    Nexters CDN Config   |
| (RPC/MQTT: specialQuest)|      | (specialQuestEventView, |
+------------+------------+      |    questChain, quest)   |
             |                   +------------+------------+
             v                                |
+-------------------------+                   |
| rpcCache (Passive Store)|                   |
| specialQuestStatus      |                   |
| remoteConfigStatus      |                   |
+------------+------------+                   v
             |                   +-------------------------+
             +------------------>| eventCatalogService.ts   |
                                 | (Dynamic CDN Sync)      |
                                 +------------+------------+
                                              |
                                              v
+-------------------------+      +-------------------------+
| questData.ts            |<-----+ chrome.storage.local    |
| (Runtime Event Catalog) |      | (dynamicEventCatalog)   |
+------------+------------+      +-------------------------+
             |
             v
+-------------------------+
| tierHelper.ts           |
| (Task, Unit, Target,    |
|  Ladder Resolution)     |
+------------+------------+
             |
             v
+----------------------------------------------------------+
| EventDetailModal.vue (Event Viewer & Milestones Dialog)  |
| - Horizontal Event Switcher & Countdown Timer            |
| - Filter Tabs (All, Daily Resets, Single Chains, Status) |
| - Active Objective Banner with Target & Mini Bar         |
| - Expandable Milestone Tiers Ladder                      |
| - Direct & Batch RPC Reward Claiming                     |
+----------------------------------------------------------+
```

### 2.1 Passive Interception (`rpcCache.ts`)
The extension monitors game initialization and event traffic:
- `specialQuestEventGetAll` / `specialQuestEvent_getAll`: Stores active events under `cache.specialQuestStatus`.
- `indexGet`: Extracts `remoteConfigStatus` containing dynamic CDN URLs for `specialQuestEventView`, `questChain`, `quest`, and `battlepass`.
- `questGetAll`: Caches active non-event daily quests and fallback reward payloads.

### 2.2 Dynamic CDN Synchronization (`eventCatalogService.ts`)
- **Version Tracking**: Detects when `specialQuestEventViewUrl` or `questChainUrl` hashes change in `remoteConfigStatus`.
- **Non-blocking Fetch**: Uses `fetchJsonSafely` with an `AbortController` timeout (8000ms).
- **Persistent Cache**: Stores parsed titles into `chrome.storage.local` under `dynamicEventCatalog`.
- **Runtime Injection**: Calls `questData.registerRuntimeDefinitions` so running UI components update dynamically without page reloads.

### 2.3 Tier & Milestone Resolution (`tierHelper.ts`)
Every tier in a quest chain resolves four primary attributes:
1. **Task Description (`task` / `taskEn`)**: E.g., *"Đăng nhập hàng ngày"*, *"Chi tiêu Emeralds"*, *"Đấu Arena"*, *"Khai thác Titanite"*.
2. **Unit of Measurement (`unit` / `unitEn`)**: E.g., `ngày`, `Emeralds`, `Energy`, `trận`, `rương`, `Titanite`, `Boss`, `lính`, `phút`.
3. **Target Requirement (`target` / `targetDisplay`)**: Threshold determined through a three-level fallback hierarchy:
   - Level 1: Explicit target in `quest.condition.target` or `quest.target`.
   - Level 2: Known quest targets map from CDN configurations (`knownQuestTargets`).
   - Level 3: Progression ladder of the chain's `localeKey` (e.g. login days 1..7, emeralds progression ladder 100..120,000).
   - Level 4: Default step multiplier (`tierIndex * defaultStep`).
4. **Progress & Percentage (`progress`, `percent`, `progressDisplay`)**: Clamped percentage calculation and formatted ratio strings.

### 2.4 Reward Normalization (`rewardHelper.ts`)
Converts both object-shaped (`{ gold: 1000, coin: { "18": 50 } }`) and array-shaped (`[{ type: "gold", amount: 1000 }]`) reward structures into uniform `FormattedReward` badges with proper colors, borders, and asset icons.

### 2.5 Event Detail Modal (`EventDetailModal.vue`)
- **Horizontal Event Tabs**: Quickly switch between weekly active special events and seasonal Battle Passes.
- **Header Summary**: View event ID, countdown timer, overall completed milestones count, and aggregate progress bar.
- **Filter Toolbar**: Instant filtering by repeat type (`All`, `Daily Resets`, `Single Chains`), completion state (`In Progress`, `Completed`), and live search input.
- **Current Objective Banner**: Highlights the active tier for each uncompleted chain with task title, target badge, mini progress bar, and claim action.
- **Expandable Milestone Ladder**: Full tier ladder showing index, task, target badge, detailed progress, rewards, and individual claim buttons.
- **RPC Claim Integration**: Dispatches single quest claims (`claimSingleQuest`) or batch claims (`claimAllReady`) via `sendQuestClaim`.

---

## 3. Retrospective Learnings & Engineering Pitfalls

### 3.1 Network Sandbox & Host Permissions
- **Issue**: Direct Node.js / curl commands executed in CLI environments timeout when contacting `hwmb-remote-config-cdn.nextersglobal.com` due to local system firewall rules outside Chrome.
- **Resolution**: All dynamic remote config fetches must be executed within the extension context (background service worker or popup) using declared `host_permissions: ['https://*.nextersglobal.com/*']` in `wxt.config.ts` and `manifest.json`.

### 3.2 Dark Theme Contrast & Non-standard Tailwind Classes
- **Issue**: Using non-standard Tailwind classes such as `dark:bg-slate-850` or `dark:hover:bg-slate-750` causes Tailwind to drop the rule, leading to unstyled or transparent backgrounds. Dim text classes like `dark:text-slate-500` produce illegible low-contrast text on dark surfaces.
- **Resolution**: Adhere strictly to valid Tailwind scale values (`dark:bg-slate-800`, `dark:bg-slate-900`, `dark:hover:bg-slate-700/80`) and elevate secondary text luminance to `dark:text-slate-200` and `dark:text-slate-300`. Add explicit borders (`dark:border-slate-700`, `dark:border-amber-700/60`) to badges for crisp legibility.

### 3.3 Milestone Progress Accumulation
- **Issue**: In Hero Wars, cumulative chains (such as spend Emeralds or defeat Bosses) report aggregate progress on every tier rather than resetting to 0.
- **Resolution**: Tier progress must be evaluated against the tier's individual target: if `state === 'completed'`, display 100% and completed status; for active/future tiers, calculate `min(progress, target) / target * 100%`.

---

## 4. Verification & Testing
- Unit tests in `tests/event-detail-modal.test.mjs` verify:
  1. `parseRewards` correctly handles both array and object payloads.
  2. `resolveTierDetail` accurately extracts task, unit, target, and progress.
  3. `EventDetailModal` template structure, modal registration, filters, and RPC actions.
  4. `EventsTab` integration with `eventDetail` modal launcher for special quests and battle passes.
