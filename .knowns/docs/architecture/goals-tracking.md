---
id: doc-6b29aa2dba5227a05c9446f14ca7373a
title: Goals Tracking
description: 'Goals tab model: event source extraction, Guild Versus step denominators, Tower cleared state, quest integration, and event resource stock tracking'
createdAt: '2026-11-03T14:32:27.635Z'
updatedAt: '2026-11-13T02:31:38.072Z'
tags:
  - goals
  - events
  - tracking
  - guild-versus
---

# Goals Tracking

## Overview
The Goals tab in HWA Helper aggregates active game goals from multiple RPC sources into a unified prioritized view. Goals are extracted from the passive RPC cache by extractEventGoals(cache) in popup-data.js and rendered by renderGoals(cache) in popup.js.

## Goal Categories
Goals are classified into two top-level categories rendered as filter tabs:

| Category | Description |
|---|---|
| Activities | Time-limited actions: Guild Versus challenges, Tower chest, Tower cleared, raid/rally march status |
| Resources | Resource stock thresholds required by active events or challenges |

A Synergies sub-filter surfaces goals whose required resource or activity appears in more than one event simultaneously (overlapCount > 1). A Ready sub-filter surfaces immediately actionable goals.

## Goal Sources and Extraction

### Guild Versus (clanVersusStatus)
- Reads clanVersusStatus.data from cache.
- Object-shaped collection normalization: Server responses may deliver clanVersusStatus.data.battle.rounds and info.challenges as numeric-string keyed Object dictionaries ({ 1: {...}, 2: {...} }) instead of standard Arrays. extractEventGoals in popup-data.js and renderers in popup.js must normalize collections using Array.isArray(col) ? col : (col && typeof col === 'object' ? Object.values(col) : []) before invoking .find(), .map(), or .filter(), preventing TypeError: r.find is not a function.
- Round goals: total challenge points needed this round vs. points earned; denominator comes from hwaHelperClanVersusChestThresholds keyed by round number.
- Daily goals: individual challenge step progress vs. daily target; denominators from hwaHelperClanVersusChallengeSteps. Deduplication: round and daily goals for the same challenge ID are merged — only one card is emitted per challenge to prevent double-counting.
- Challenge names from hwaHelperClanVersusChallengeNames; point values from hwaHelperClanVersusChallengePoints.
- Resource requirements from hwaHelperClanVersusRoundQuests keyed by round quest ID.

### Tower (towerStatus + towerSession)
- Tower chest goal: reads towerStatus.data; cleared state detected via isTowerCleared(cache) in popup-data.js.
- When cleared, the Tower Chest goal shows as completed and a 'Tower Complete' activity card is shown.
- Tower session data (towerSession.data) is used for in-progress floor/room tracking; see @doc/architecture/tower-rpc-session-and-progress-model.

### Quest Events (questEvents)
- questEvents cache key provides active event quest progress.
- Quest goals display current/target step counts and link to event resource requirements.
- Integrated in VHE-ARSAFV: quest source was added to extractEventGoals alongside Guild Versus.

### Event Resource Stock
- Event resource stock display added in VHE-DBAYGG.
- Resource goals show current stock vs. required amount per active event.
- getChallengeResourceStock(cache, resourceId) resolves the current count from the resource cache keys.
- isDebugOrEventResource(entry) distinguishes event-only resources from standard renewable ones.

## UI Structure
renderGoals(cache) in popup.js:
1. Calls extractEventGoals(cache) to get { all, activities, resources, metrics }.
2. metrics: { totalGoals, synergiesCount, readyCount } shown in summary cards.
3. Segmented filter: All / Activities / Resources / Synergies / Ready.
4. activeGoalsFilter (module-level) persists the selected tab across cache refreshes.
5. Goal cards are sorted by readiness then by category priority.

## Key Invariants
- Guild Versus round and daily goals for the same challenge ID must be deduplicated — emit one unified card only.
- Always normalize ounds and challenges to arrays with Array.isArray(col) ? col : Object.values(col || {}) to prevent runtime TypeErrors when the server returns dictionary payloads.
- Tower cleared state must be checked from towerStatus, not inferred from towerSession alone.
- Goals tab shows 'No active event goals' when extractEventGoals returns an empty all array.
- Container padding must prevent border overlap with adjacent tab content.

## Source Provenance
- @task-VHE-DBAYGG (event resource stock + Goals roadmap tab initial implementation)
- @task-VHE-ARSAFV (quest tracking integration + guild chat bottom-to-top ordering)
- @task-VHE-FXHQJY (Guild Versus goal deduplication + Tower cleared status)
- @task-VHE-GS0FA2 (Guild Versus challenge step denominators fix)
- Symbols: extractEventGoals, getChallengeResourceStock, isTowerCleared, normalizeGoalKey in extension/popup-data.js
- Symbols: renderGoals, openGuildVersusModal, activeGoalsFilter in extension/popup.js
