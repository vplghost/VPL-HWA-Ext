---
id: doc-6b29aa2dba5227a05c9446f14ca7373a
title: Goals Tracking
description: 'Goals tab model: event source extraction, Guild Versus step denominators, Tower cleared state, quest integration, and event resource stock tracking'
createdAt: '2026-11-03T14:32:27.635Z'
updatedAt: '2026-11-14T15:00:03.579Z'
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

## Guild Versus unknown-state rendering (0.10.82)

@task-VHE-VT9095 replaces inherited sample fallbacks in the Vue GuildVersusModal with `guildVersusView` (src/utils/guildVersusView.ts). Missing guild/league/battle/round/participation/score/eligibility stay unknown; explicit0 and false are preserved. A0:0 matchup displays0% for both sides rather than fabricating an opponent lead. Round schedule rows require observed server rounds. Static rule metadata remains separate from reported state; absent metadata does not imply a step size of1 or a chest threshold. Chest readiness requires known score, known positive threshold, known claim state and explicit personal/guild eligibility. Stale personal round data is unknown rather than reset to a synthetic0. Actual SFC rendering tests for missing/zero/full states are in tests/guild-versus-unknown.test.mjs.

## Verified daily quest names and phases (0.10.82)

@task-VHE-X39972 replaces manually inferred daily ID meanings with the captured remote-config quest + questChain + questCondition + dailyQuestPack, joined to the pinned English locale. Generator: scripts/generate-quest-data.mjs (npm run quests:update), with optional config-directory, captured-index and compressed-locale path arguments. Defaults read temp/smart-gather-{quest,questChain,questCondition,dailyQuestPack}.json, temp/remote-config-captured.json and temp/items-current-en.json.gz. Every config MD5 must equal its captured URL filename; locale size/MD5 must match extension/data-names.js asset metadata. Missing/mismatched inputs fail generation; no mutable latest fallback.

25 daily pack definitions and names are generated into extension/quest-catalog.json and the marked section of extension/quest-data.js. Each definition retains chainId, phase, transferProgress, condition/target/args, translation method, locale key/template and original developer label. English titles use LIB_QUEST_TRANSLATE_<METHOD> plus verified count and resource/unit parameters, not the Russian developer label or a guessed numeric ID range. Unsupported conditions/parameters/templates return unknown rather than a fabricated title; unknown runtime IDs keep Daily Quest #<id>. Existing explicit user runtime catalog overrides remain supported.

### Brigand Camp chain

| Quest | Phase | Cumulative target | English locale title |
| --- | --- | --- | --- |
| 362 | 1 | 1 | Clear Brigand Camp 1 time |
| 363 | 2 | 5 | Clear Brigand Camp 5 times |
| 364 | 3 | 10 | Clear Brigand Camp 10 times |

All belong to chain 135, condition/translationMethod globalMapCampVictories, transferProgress=true. English locale key LIB_QUEST_TRANSLATE_GLOBALMAPCAMPVICTORIES is `Clear Brigand Camp %param1% $m(time|times|times)`. hwa-game-record-202611141920_firstattack.json timeline entry 11 getDailyQuests response has #363 completed/progress5/completionCount1 and #364 inProgress/progress5/completionCount0. Thus #364 needs 5 further camp victories in that snapshot, not 10 new victories. QuestDetailModal displays the observed progress against the verified target, including 0 / target.

### Corrected neighboring IDs

348–350 train 10 Infantry/Spearmen/Marksmen; 351–353 train 30 of those classes. 358 is the second food-gathering phase, 361 is iron gathering. 365–367 count world-map resource gathering (1/2/4), not Tower/Arena/Expeditions. 368–370 count world-map Boss victories (1/2/3). 2413 is Start Research, not Titan Dungeon. Quest #365 was also hardcoded as a Tower chest in three UI/goal paths; those false locks are removed so a completed Tower does not make gathering unavailable.

### Provenance and tests

Config sources: quest b1b8d8f88d714ab34604dfb22f4af15e; questChain 822f98416eb5676f77ccec2b31f4ff07; questCondition 77aaa411dcaed96d34387d51ce95a4e3; dailyQuestPack 0a33f101c05956c1ba1a84489a8db7a8. Full pinned URLs are in dailySources of the exported catalog. Locale asset: en.json.gz, size683124, MD5 def7ae37ac67df119f41eae76690c092, from recorded game metadata (client1.293.1010).

Sanitized fixture tests/fixtures/daily-quest-config.json retains only relevant public config fields/locale strings and observed #364 progress, with no account/auth data. tests/daily-quest-config.test.mjs verifies cumulative chain, every generated title/catalog entry, truthful unknown fallback and compiled Vue dialog rendering (5 / 10; #365 still actionable after Tower completion).
