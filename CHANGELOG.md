# Changelog

## 0.11.262 — 2026-11-24

### Added

- **PvP Team Optimizer & 10-Round Local Unity WASM Arena Leaderboard (`pvpTeamOptimizer.ts`, `PvpTeamOptimizerModal.vue`, `useModals.ts`, `App.vue`, `TeamsTab.vue`)**:
  - Added `src/services/pvpTeamOptimizer.ts` with power-based hero pool pruning (`pruneHeroPool`: `topN`, `minPowerPctOfMax`, `minPowerPctOfSeedMin`, `lockedHeroIds`, `excludedHeroIds`), 1-swap & Beam Search candidate generation (`generateOneSwapCandidates`), offline synthetic Arena battle builder (`buildSyntheticArenaBattle`), 10-round Unity WASM matchup runner (`runTenRoundPvpMatch`: 5+5 symmetric or 10 atk + early-exit screening), and Elo/Top-K Round-Robin leaderboard ranking (`runPvpOptimizationSession`).
  - Added `PvpTeamOptimizerModal.vue` (reusing `<HeroTeamPicker>` and `<AutomationLogPanel>`) accessible from `TeamsTab.vue` (`#btn-open-pvp-optimizer`), displaying estimated matchup counts, live progress with Stop control, ranked Top Teams with Elo / Win Rate vs Seed / `Giant Killer` badges, and 1-click **Save Team** into `customTeams`.

## 0.11.260 — 2026-11-24

### Added & Fixed

- **Titan Dungeon 5-Floor Checkpoint Auto-Claim, Single-Door Best-of-10 (`<=5` Members) & Unified Auto Attack UI (`dungeonPlanner.ts`, `dungeonAutomationRunner.ts`, `dungeonBattleSim.ts`, `DungeonModal.vue`, `DungeonSimModal.vue`)**:
  - Fixed Dungeon Auto Attack stalling/erroring at every 5th floor (`580`, `585`, ...) where `dungeonEndBattle` returns `dungeon: null`: replaced outdated `% 10 === 0` checks with `needsFiveFloorCheckpointClaim()` to automatically call `dungeonSaveProgress({})`, claim checkpoint gold, and unlock floor `N+1` in both Auto Attack and manual `DungeonSimModal` submission.
  - Added `runSingleDoorBestOfTen()` (`src/services/dungeonPlanner.ts`) to automatically execute 10 Unity WASM simulations with distinct derived seeds and accept the best outcome (`win > 0 casualties > tank/team HP & energy preservation`) whenever a single-door floor has `<= 5` alive eligible members.
  - Fixed `simulateBattleWithUnity()` in `dungeonBattleSim.ts` to respect explicit candidate `seed` overrides over `rawBattle.seed`.
  - Upgraded the existing **Auto Attack** (`#dungeon-auto-btn`) flow in `DungeonModal.vue` with a compact 1-line `#dungeon-auto-config-bar` (Target Titanite `75/150/300/Unlimited`, Min HP threshold, `Best-of-10 (Single Door ≤5)`) and checkpoint/Best-of-10 session metrics.

## 0.11.258 — 2026-11-24

### Added

- **Active Automation Hub Strip, Shared Dialog Primitives & 100% English UI Standardization (`ActiveAutomationStrip.vue`, `useActiveAutomations.ts`, `AutomationLogPanel.vue`, `HeroTeamPicker.vue`, `DiagnosticsBanner.vue`, `App.vue`)**:
  - Added `ActiveAutomationStrip.vue` (auto-hides when idle) between `<Header />` and `<TabNav />` in `App.vue`, displaying live status chips for active automations (`Raid`, `Monster`, `Gather`, `Train`, `Building`, `Research`, `Tower`, `Dungeon`) with click-to-open and 1-click stop (`⏹`).
  - Added reusable shared components in `src/components/common/`: `AutomationLogPanel.vue`, `HeroTeamPicker.vue`, and `DiagnosticsBanner.vue`.
  - Standardized remaining Vietnamese strings in `DungeonSimModal.vue`, `SettingsTab.vue`, and `ActivityGoals.vue` to English, backed by an automated regression test in `tests/active-automation-hub.test.mjs`.

## 0.11.256 — 2026-11-24

### Added

- **Typed `RuntimeEventBus`, `ResourceLockManager` & Modular Background Handlers (`eventBus.ts`, `resourceLock.ts`, `draftHandler.ts`, `queueDispatcher.ts`, `backgroundRuntime.ts`)**:
  - Added `RuntimeEventBus` (`src/background/eventBus.ts`) to dispatch every record in `api-record-batch` sequentially by RPC/MQTT topic with a single source-of-truth `liveCache` (eliminating stale disk reads in `updateRaidQueue` and `updateMonsterQueue`).
  - Added `ResourceLockManager` (`src/background/resourceLock.ts`) with TTL auto-expiry to coordinate hero squad and march slot reservations across parallel automations (`raidQueue`, `monsterQueue`, `autoGather`) and persist `activeResourceLocks`.
  - Extracted `src/background/handlers/draftHandler.ts` and `src/background/handlers/queueDispatcher.ts` out of `backgroundRuntime.ts` while preserving full backwards compatibility.

## 0.11.254 — 2026-11-24

### Added

- **IndexedDB Recorder Offload, `rpcCache` TTL Auto-Pruning & Storage/Latency Telemetry (`recorderDb.ts`, `cachePruner.ts`, `telemetry.ts`, `backgroundRuntime.ts`, `SettingsTab.vue`)**:
  - Offloaded Game Window Recorder `apiEntries` and `interactionEntries` to IndexedDB (`hwaRecorderDb`) with an automatic `InMemoryRecorderStore` fallback for Node.js tests, keeping `chrome.storage.local` free from multi-MB recording dumps.
  - Added `pruneRpcCache()` (`CACHE_PRUNE_LIMITS`) to automatically cap and expire stale history partitions (`resourceActionHistory`, `createdRalliesHistory`, `brigandCampHistory`, `guildChat`, `battleReports`).
  - Added `RuntimeTelemetryTracker` + `collectStorageTelemetry()` and a **Storage & Runtime Telemetry** card (`#storage-telemetry-card`) in `SettingsTab.vue` showing 10 MB quota usage (warning at ≥ 70%), partition breakdown, Avg/P95 bridge latency, disk flushes/min, and a 1-click **Compact Cache** action.

## 0.11.252 — 2026-11-24

### Added

- **Dynamic WASM Symbol Auto-Resolver, Versioned Profile, Settings Override UI & `wasm-sync` Skill (`resolve-wasm-symbols.mjs`, `wasmSymbols.ts`, `interceptor.ts`, `bridge.ts`, `SettingsTab.vue`, `wasm-sync.ps1`, `.agents/skills/wasm-sync/SKILL.md`)**:
  - Added `hwa-sim/scripts/resolve-wasm-symbols.mjs` (`npm run wasm:sync`) to parse `build.wasm` (`Type`/`Import`/`Function`/`Element`/`Code` sections) and `symbols.json`, auto-generating typed `src/data/wasmSymbols.ts` with 36 WASM `tableIndex`/`funcIndex`/`arity` entries, `BattleConfigStorage` static addresses (`0x15a3a30`, `+92`, `+112`), and `DraftsXORCipher` struct offsets (`+8`, `+12`).
  - Refactored `src/content/interceptor.ts` to consume `src/data/wasmSymbols.ts`, run `verifyWasmProfile()` pre-flight arity verification before `BattleInstantPlay`, fall back to `findClassByName('BattleConfigStorage')` heap scanning if static lookup misses, and support hot-patch `wasmSymbolOverrides` forwarded from `chrome.storage.local` via `src/content/bridge.ts`.
  - Added **WASM Engine Profile** status, version-mismatch badge, and Import/Reset Symbol Override JSON editor in `src/components/tabs/SettingsTab.vue`.
  - Added one-shot `scripts/wasm-sync.ps1` pipeline (`--core-wasm-only` selective download, resolver diff summary, test & dual-build) and `.agents/skills/wasm-sync/SKILL.md` for low-token AI updates on new game builds.

### Fixed

- **Legends Draft Decrypted `{ base, swap }` Hero Pool Extraction & UI Rendering (`draftHelper.ts`, `backgroundRuntime.ts`, `useDraft.ts`, `LegendsDraftModal.vue`, `draft.ts`)**:
  - Updated `extractDraftHeroSteps()` and added `extractDraftSwapHeroIds()` / `extractDraftHeroDetails()` to parse the live `DraftsXORCipher` payload format `{ base: { [heroId]: HeroObj }, swap: { ... } }` (in addition to legacy matrix shapes), resolving `candidateCount: 0` when decryption succeeded.
  - Wired `backgroundRuntime.ts` and `useDraft.ts` to share `draftHelper.ts` extraction, and updated `LegendsDraftModal.vue` to display hero avatars, star rating (`★`), power (`K`), and a dedicated **Swap Pool** (`#draft-swap-pool`) section.

## 0.11.250 — 2026-11-24

### Added

- **Arena Dialog with Unity WASM 10-Round Simulation & Automation (`ArenaModal.vue`, `arenaService.ts`, `ActivityGoals.vue`, `useModals.ts`, `App.vue`, `rpcCache.ts`, `interceptor.ts`)**:
  - Added interactive **Arena** modal opened directly from the Dashboard's Daily Activities & Progress Arena card.
  - Extracted and cached full Arena data (`arenaFindEnemies`, `League_getInfo`, `battleGetByType`, `customArena_endBattle`, and free battles deduction on `resource:refillable:6`).
  - Added `runArenaMonteCarloSim()` (10-round batched Unity WASM simulation using `Presets_arena(0)`) and **Auto Arena** loop: auto-refreshes opponents exceeding configured power ratio (default `90%`), fights when simulated win rate ≥ `80%`, and stops on defeat or when free battles reach `0`.

## 0.11.248 — 2026-11-24

### Changed

- **`ext-backlog` Log Archival Cleanup (`.agents/skills/ext-backlog/SKILL.md`)**:
  - Added an automatic log cleanup step right before backlog renaming in Step 5 to move user-provided log files into a sibling `archived/` subdirectory (e.g., `temp/tracking-data/archived/`).

## 0.11.246 — 2026-11-24

### Fixed

- **Legends Draft 15-Hero Decryption, Unified English UI & Error Diagnostics (`interceptor.ts`, `LegendsDraftModal.vue`, `draftHelper.ts`, `useDraft.ts`, `backgroundRuntime.ts`, `SettingsTab.vue`)**:
  - Replaced invalid `WebAssembly.Table.set(330804, jsFn)` hook (which threw a silently swallowed `TypeError` in Chrome V8) with `readDraftCipherKeysFromUnity()` + `decryptDraftPayloadFromUnity()`, reading `dynamicKey` (`+8`) and `constKey` (`+12`) directly from the live `DraftsXORCipher` instance in Unity WASM heap with fallback to `lastRpcHeaders` / `webglAuth` session keys.
  - Standardized 100% of Legends Draft UI labels, phase descriptions, and SettingsTab text to English.
  - Added structured decryption error reporting (`draft-decrypt-error`), collapsible `#draft-diagnostics-panel`, and 1-click `#btn-copy-draft-diagnostics` in `LegendsDraftModal.vue`.

## 0.11.244 — 2026-11-24

### Fixed

- **Raid Queue Auto-Resume, Batch Event Processing & World Energy Round Cap (`backgroundRuntime.ts`, `raidQueue.ts`, `RaidModal.vue`)**:
  - Processed every record in `api-record-batch` through `updateRaidQueue` (with live hot `rpcCache`), `updateMonsterQueue`, `updateTowerRun`, `updateDungeonRun`, `advanceBuildingQueue`, and `advanceResearchQueue` so closely timed MQTT events (`mobRallyAttackResult` + `rallyCompleted`, `returnFromMobCompleted` + `returnToOutpostFromMob`) are never dropped.
  - Updated `raidQueue.ts` to transition mid-queue clan rally / auto-join interruptions into `waiting_rally` and automatically resume once cleared instead of stopping the queue, recognized `returnToOutpostFromMob`, and throttled `waiting_rally` polling to `wakeAt`.
  - Updated `RaidModal.vue` to cap `Rounds` (`#raid-queue-count`) by remaining World Energy (`Math.floor(worldEnergy / 25)`) and default to the maximum possible rounds when opening the dialog.

## 0.11.242 — 2026-11-24

### Fixed

- **Legends Draft Auto-Open on RPC/MQTT, FAB Shortcut & Draft Chip Deduction (`interceptor.ts`, `mqttCapture.ts`, `bridge.ts`, `backgroundRuntime.ts`, `useDraft.ts`, `FabDial.vue`, `rpcCache.ts`)**:
  - Updated `inspectDraftRpc(reqText, resText)` across `fetch`, piggyback `fetch`, and `XHR` to correlate `randomDraft_*` request UUID `ident`s with responses instead of requiring `'randomDraft'` inside response bodies.
  - Emitted and forwarded `draft-mqtt-event` for `randomDraft_statusChanged` MQTT pushes and stamped `autoOpenNonce` in `backgroundRuntime.ts` + `useDraft.ts` so `LegendsDraftModal` reliably auto-opens on active draft events when enabled in settings.
  - Restored the `#legend-draft-fab` shortcut button in `FabDial.vue` to open `LegendsDraftModal`.
  - Deducted `-1` Draft Chip (`resource:refillable:60`) once per `matchId` (`randomDraft_chip:${matchId}`) on `randomDraft_startBattle` / `randomDraft_result` in `rpcCache.ts`.

## 0.11.240 — 2026-11-24

### Changed

- **Enhanced `ext-backlog` Workflow (`.agents/skills/ext-backlog/SKILL.md`)**:
  - Updated completed backlog file naming to `done.<encoded_timestamp>.<old_filename>` using an inverted base36 timestamp (`EPOCH_2100 = 4102444800`, 7-char zero-padded) so the most recently completed files sort to the top.
  - Required ISO 8601 completion timestamp in `# Kết quả` and oldest-first sequential processing sorted by `CreationTime`.
  - Added `continue` option (including Vietnamese/English synonyms such as `liên tục`, `tiếp tục`, `cho đến hết`, `all`, ...) to auto-approve commits and keep processing remaining backlogs sequentially.

## 0.11.238 — 2026-11-24

### Fixed

- **Titan & Hero Dungeon Simulation `BattleConfig` Desync (`src/content/interceptor.ts`)**:
  - Replaced `Presets_clanWarReplay` (`BattleConfigStorage.titanClanPvp` / `clanPvp`) priority for Dungeon battles with the exact game client instant-battle preset from `DungeonStartBattleRoutine_tryInstantBattle`: `BattleConfigStorage_get_titan` (`285313`) for Titan Dungeon and `BattleConfigStorage_get_tower` (`285311`) for Hero Dungeon, combined with `BattlePresetsFactory_manualRaid(config, 0, 0)` (`291685`).
  - Added validated & cached `resolveBattleConfigStorage()` (via `0x15a3a30` + `ClassInit` + `BattleConfigStorage` class-name guard) with full fallback to legacy preset candidates, preventing server `Invalid battle` rejections on `dungeonEndBattle`.
  - Added regression test in `tests/dungeon-sim-modal.test.mjs`.

## 0.11.236 — 2026-11-24

### Fixed

- **Shared 3-Camp Training Capacity (`512`) & Speed-Adjusted `startTraining` Duration (`troops.ts`, `troopTrainingBonusData.ts`, `useTroopTraining.ts`, `backgroundRuntime.ts`)**:
  - Updated `getBuildingTrainingCapacity` to compute shared `trainingCapacity` from `productionBonusStatus` (`getSummary:bonus`) or fallback to summing all 3 Camp buildings (`40 + 41 + 42`) plus Personal Research `Camp Expansion I–VII` bonuses (`142×3 + 86 = 512` exact match).
  - Replaced hardcoded `46342ms`/unit `startTraining` duration with exact `calculateTrainingDurationMs(unitId, count, cache)` using `unitTraining` base durations (Lv.1–9) divided by `(1 + trainingSpeedPct / 100)` across camps, researches, and clan fortress bonuses, eliminating server `ValidationError`.
  - Added `{ name: 'getSummary', feature: 'bonus' }` to troop refresh/auto-train sync and captured `result.response.errorCode` in `advanceTroopTraining` diagnostics.

## 0.11.234 — 2026-11-24

### Changed

- **Low-Latency Game-to-Extension Message Batching & Partitioned Storage (`bridge.ts`, `backgroundRuntime.ts`, `useRpcCache.ts`)**:
  - Added 40ms / 16-record micro-batching (`api-record-batch`) in `bridge.ts` with immediate flush for urgent user actions and guarded account-ID JSON parsing.
  - Added in-memory `rpcCache` hot cache and dirty-partition flushing (`cache:world`, `cache:roster`, `guildChat`, `rpcCache`) in `backgroundRuntime.ts`, cutting default passive debounce from `300ms` to `100ms` and eliminating repeated multi-MB disk reads/writes.
  - Added instant `rpc-cache-delta` push from background to `useRpcCache.ts` so open UI updates in `<50ms` without waiting for disk flush.
- **Workflow Standardization (`.agents/skills/ext-backlog/SKILL.md`)**:
  - Updated `ext-backlog` Step 6 to delegate release, dual-build, changelog, and commit flow to `ext-build` (which integrates `kn-commit`).

### Fixed

- **Troop Training Capacity with Personal Research Bonuses (`troops.ts`, `useTroopTraining.ts`, `backgroundRuntime.ts`)**:
  - Added permanent `Camp Expansion I–VII` research bonuses (IDs `3, 59, 90, 125, 158, 189, 492`, up to `+178` batch capacity) to `getBuildingTrainingCapacity` and synced `personalResearch` summary during troop refreshes.
- **Troop Healing Duration ValidationError (`troops.ts`, `useTroopTraining.ts`)**:
  - Replaced hardcoded `8000ms`/unit duration with exact per-tier `UNIT_HEALING_DURATION_MS_BY_LEVEL` table from `unitHealing` config (Lv.1=1s … Lv.7=8s, Lv.8=11s, Lv.9=13s, Lv.10=15s) and surfaced RPC `errorCode` failures in `healStatus`.
- **Game Window Recorder Persistence, Stop Stability & Export Speed (`backgroundRuntime.ts`, `bridge.ts`)**:
  - Persisted API and interaction records across MV3 Service Worker restarts and added `ensureRecordingHydrated` so logs and recording state survive SW sleep.
  - Eliminated `chrome.storage.local.get(null)` full-storage scans in `interactionEntries`/`clearInteractions` and decoupled `record-export` from the `pending` queue.
  - Guarded Record/Stop button toggle race conditions in `bridge.ts` and deferred `URL.revokeObjectURL`.
- **Auto Troop Training Triggers & RPC Dispatch (`backgroundRuntime.ts`, `troops.ts`, `SettingsTab.vue`, `useTroopTraining.ts`)**:
  - Resolved active Hero Wars game tab instead of extension sender tab in `auto-train-tick`, added `api-record`/`storage.onChanged`/`hwa-troop-train-wake` triggers, auto-refreshed missing/stale cache, removed hardcoded Lv.7 default in SettingsTab, and surfaced live `autoTrainState` diagnostics.

## 0.11.228 — 2026-11-24

### Added

- **Phase 1 Readonly Legends Draft Dialog with Native WASM Table Hook (`LegendsDraftModal.vue`, `useDraft.ts`, `interceptor.ts`)**:
  - **15 Candidate Heroes Matrix UI**: Built read-only modal dialog presenting all 15 draft candidates across 5 pick steps (columns) and 3 hero cards (rows). Each card showcases avatar, name, main stat badge (STR/AGI/INT), role/class, and highlights picked choices with gold/amber glow and `✓ ĐÃ CHỌN` badge.
  - **Dynamic Stage & Opponent Header**: Features real-time phase indicator (`Defense Phase` in Stage 2, `Attack Phase` in Stage 4, `Ready` in Stage 5), match ID, rating delta, opponent profile (name, level, clan), and live countdown timer until `stageFinishTs`.
  - **Native WebAssembly Table Index Hook (Table #330804)**: Hooked `BaseXORCipher_decrypt` in Unity WebGL WebAssembly table to extract plaintext JSON directly from heap memory without requiring server session key knowledge.
  - **RPC Interception & Auto-Opening**: Integrated RPC sniffer for `randomDraft_getInfo` and `randomDraft_register` to trigger automatic dialog display when `autoOpenDraftDialog` setting is enabled.
  - **Seamless Session Rebinding & Error Diagnostics**: Rebinds all data seamlessly when a new draft match starts while dialog remains open, and renders a diagnostic error box with raw dump if decoding encounters an exception.
  - **Settings Option**: Added `#setting-auto-open-draft` checkbox in SettingsTab to configure auto-opening behavior.

## 0.11.226 — 2026-11-24

### Fixed

- **Correct Hero and Titan Skin Stat Mappings (`heroMetadata.ts`, `TitanDetailModal.vue`, `HeroHoverCard.vue`)**:
  - **Protobuf Stat Decoding & Alignment**: Decoded `temp/splitlib/skin.pb` to fix stat ID mappings: resolved `statId === 9` as Health (`HP`) instead of Armor, `statId === 7` as Armor (`Arm`) instead of Magic Defense, and main stat alignments (`Int` for Iris and Xe'sha; `Str` for Corvus, Aurora, Galahad, Astaroth).
  - **Titan Skin Statistics Ground Truth**: Verified and corrected all 30 Titans — Tank Titans (Sigurd, Moloch, Angus, Brustar, Rigel, Pallant) have Default Skin Health (`HP`), Primordial Physical Attack (`PA`), and Biomech Health (`HP`), while Non-Tank Titans have Default Physical Attack (`PA`), Primordial Health (`HP`), and Biomech Physical Attack (`PA`).
  - **Purchased Hero Skins Rectified**: Updated 14+ hero skins in-game (Cleaver Barbarian, Aurora Spring, Astaroth Cybernetic, Ishmael Masquerade, Lilith Winter, Martha Masquerade, Rufus Angel/Winter, Ziri Cybernetic/Champion, etc.) from `Arm` to `HP`.
  - **Titan Detail Dialog Skin Stat Badges**: Added `statKey` and `statLabel` badges with color accents (Emerald for `Health`, Rose for `Physical Attack`) to each skin card in `TitanDetailModal.vue`.
  - **Synchronized Generators & Tests**: Updated `scripts/sync-skin-stats.mjs`, `scripts/generate-hero-stats.mjs`, and aligned assertions in `tests/hero-titan-typed-data.test.mjs`, `tests/popup-data.test.mjs`, and `tests/popup-hero-view.test.mjs`.

## 0.11.224 — 2026-11-24

### Fixed

- **Synchronize Hero & Titan Skill Names with Latest Client Data (`heroMetadata.ts`, `titanMetadata.ts`, `scripts/`)**:
  - **Fresh Client Extraction**: Downloaded and unpacked the latest game client data files from CDN (`locale/en.json.gz` and `splitlib.json.zip`).
  - **Titans Skill Alignment**: Completely updated skill names across all 30 Titans in `src/data/titanMetadata.ts` to match in-game abilities (e.g. Sigurd `Icy Aegis`, Angus `Anger of the Earth`, Moloch `Crushing Blow`, Vulcan `Erupting Rage`, Ignis `Burning Blood`, Araji `Incinerating Ray` / `Herald of Flame`, Eden `Burden of Creation` / `Subterranean Prison`).
  - **Heroes Skill Alignment**: Updated 259 skill names across 83 playable heroes in `src/data/heroMetadata.ts`, eliminating stale placeholders on newer heroes (Folio, Tempus, Polaris, Peech, Guus, Somna, Electra, Byrna, Drayne, Miu, Kendle, Crow, Eva, Wodryn, Leonel).
  - **Dynamic Generator Automation**: Updated `scripts/generate-hero-metadata.mjs` and `scripts/generate-titan-metadata.mjs` to dynamically map skills from `hero.skill` and `LIB_SKILL_<id>` rather than relying on stale hardcoded dictionaries.

## 0.11.223 — 2026-11-24

### Added

- **Legends Draft WebAssembly Reverse Engineering & Cipher Decoding Dossier (`docs/LEGENDS-DRAFT-DECODING.md`, `temp/legend_draft/`)**:
  - **Cipher Algorithm Decoded**: Unveiled game client's Stream XOR Cipher decryption logic (`game.command.encrypt.DraftsXORCipher` and `BaseXORCipher`). Payloads are Base64-decoded into 7-bit ASCII strings and XOR-decrypted via a dual-key stream: $P[i] = S[i] \oplus \text{constKey}[i \pmod{64}] \oplus \text{sessionKey}[i \pmod{L_2}]$ yielding clean `DraftsDto` JSON.
  - **WASM Table Indices & Entrypoints Discovered**: Resolved exact IL2CPP function table indices in `build.wasm`: `BaseXORCipher_decrypt` at table **`330804`**, `BaseXORCipher_cipher` at table **`330805`**, `DraftsLegacyDataParser_init` at table **`232520`**, `DraftsLegacyDataParser_parseModel` at table **`232521`**, and `DraftsLegacyDataParser_parseHeroes` at table **`232524`**.
  - **Historical Tracking Data Aggregation**: Extracted and normalized 15 full draft matches from historical RPC and telemetry traces into structured JSON datasets (`temp/legend_draft/match_*.json`) with master index `draft_samples_index.json`, providing ground truth candidate pools across all 5 draft pick stages.
  - **Candidate Hero Extraction Architecture**: Designed non-invasive hook mechanism on WASM table entry `330804` via `src/content/interceptor.ts` and Native Bridge, enabling 100% reliable extraction of the 15 candidate heroes during live matches without server key spoofing.

## 0.11.222 — 2026-11-23

### Refactored

- **Decompose `experimentalData.ts` into Domain Utilities (`squadCapacity.ts`, `mobData.ts`, `mineData.ts`)**:
  - **`squadCapacity.ts`**: Encapsulated troop capacity estimation/matrix modeling (`capacityModel`, `squadCapacity`, `heroCapacity`, `normalizeCapacitySettings`), unit definitions (`unitInfo`), allocation algorithm (`allocateTroops` with tier priority), and team option builders (`availableHeroIds`, `teamOptions`, `buildSquad`).
  - **`mobData.ts`**: Consolidated Boss and Solo Monster level mappings (`bossConfigId`, `bossLevel`, `soloMonsterConfigIds`, `soloMonsterLevel`), rally phase calculations (`rallyPhase`, `rallyMembers`), and rally RPC builders (`buildRallyCall`, `buildJoinRallyCall`).
  - **`mineData.ts`**: Consolidated remote mine configurations, cargo weights/capacities (`calculateMineCargo`, `calculateRequiredTroopsForCargo`), mine RPC builders (`buildMineSearchCall`, `buildGatherCall`), and gathering optimization (`buildOptimizedGatheringTeam`).
  - **Clean Direct Imports**: Migrated modals, composables, and services across `src/` to import directly from domain utilities while retaining `experimentalData.ts` as a backwards-compatible barrel export.

## 0.11.221 — 2026-11-23

### Added

- **Skill Points Soft Cap Upgrade to 20 (`resourceData.ts`, `rpcCache.ts`, `HeroDetailModal.vue`, `Header.vue`)**:
  - **Dynamic Soft Cap Resolution (`getSkillPointsCap`)**: Discovered game client config source in `temp/splitlib/refillable.json` (`maxValue: [10, 10, 10, 10, 20]`) and `refillable_upgrade_item.pb`. Standard accounts use index 0 (`10`), while purchasing the Building Slot Pack / Construction Queue Pack or VIP milestone activates the upgrade tier (`20`).
  - **Header & Modals Integration**: Dynamic cap `skillPointsCap` replaces hardcoded `10` across `HeroDetailModal.vue` (`claimFreeSkillPoints` checks, display label, and tooltips) and `Header.vue` (`isCapped` amber status guard).
  - **RPC Cache Awareness**: `userGetInfo` dynamically sets `cap = 20` for refillable id 2 (`resource:refillable:2`) when building queue upgrade or VIP points are detected.

## 0.11.219 — 2026-11-23

### Added

- **Dedicated March Detail Dialog (`MarchDetailModal.vue`, `useModals.ts`, `App.vue`)**:
  - Built dedicated `MarchDetailModal` decoupled from automation dialogs (`raid`, `gathering`, `monster`).
  - **Pill / Tab Switcher**: Top horizontal tabs allowing quick switching between all active marches with live countdowns and icons.
  - **Overview & Live Countdown**: Real-time status badge (Returning, In battle, Preparing rally, Gathering, Traveling), duration countdown, expected completion time, and progress bar.
  - **Deployed Squad Heroes**: Renders deployed heroes (up to 5) with avatar, level, star rating, and power metrics, including total squad power.
  - **Troop Composition Breakdown**: Detailed unit breakdown by troop type (Infantry 🛡️, Spearmen 🗡️, Marksmen 🏹), tier (Tier 1-9), unit count, and capacity percentage.
  - **March Recall Action**: Recall button for gathering squads (`stopMineGathering:mine`) and rally cancellation for leader before departure (`cancelRally:rally`).
  - **Dashboard & Header Integration**: Decoupled click navigation on active march cards in `QueuesOverview.vue` and march badges in `Header.vue` to open `MarchDetailModal`.

## 0.11.217 — 2026-11-23

### Added

- **Daily Activity & Energy Statistics Refactor (`activityStats.ts`, `Dashboard.vue`, `ActivityGoals.vue`)**:
  - Separated Campaign Energy and World Energy into distinct, dedicated cards on the Dashboard, eliminating ambiguous combined energy metrics.
  - Added Titan Dungeon tracking (total battles and personal titanite progress) and Frontier (Eternal Story) tracking (cleared stages and reward coins).
  - Tracked Brigand Camps across sessions and modal attacks via `brigandCampHistory`.
  - Attributed unassigned rally losses directly to auto-join losses without showing a negative loss badge on rallies led.
  - Re-balanced Daily Progress & Automation metrics layout into 7 concise, actionable cards.

### Fixed

- **Raid Queue Dynamic Highest-Level Troop Allocation & Auto-Search (`raidQueue.ts`, `experimentalData.ts`)**:
  - **Highest-Tier Troop Priority**: Enhanced `allocateTroops` with `prioritizeHighestLevel` parameter. When true, troops are prioritized and exhausted strictly from Tier 9 down to Tier 1 across all unit types, preventing lower-tier units from being allocated when higher tiers are available.
  - **Dynamic Re-Allocation & Returning Squad Wait**: Added `hasReturningRallySquad` in `raidQueue.ts` to detect returning marches (`returnToOutpost`). Raid queue pauses in `waiting_rally` and dynamically recalculates fresh troop availability right at the moment of creating the rally, avoiding quantity/level mismatch errors.
  - **Dead / Missing Boss Auto-Search**: When target bosses are defeated or missing from map, stale queue entries are purged and `searchMob` is triggered automatically, preventing queue freezes or stalls.

## 0.11.214 — 2026-11-23

### Added

- **Frontier (Eternal Story) Activity & Automation Engine (`frontierService.ts`, `FrontierModal.vue`, `ActivityGoals.vue`, `rpcCache.ts`)**:
  - **Full RPC & Data Integration**: Added extraction and merge support for `eternalStory_getState`, `eternalStory_autoFight`, `eternalStory_getChest`, `eternalStory_collectChest`, and `battle_teamSet`. Automatically tracks current stage, enemy team, AFK chest, and daily cleared stages.
  - **Frontier Detail Modal (`FrontierModal.vue`)**:
    - **Lineup & Stage Tab**: Displays full defender lineup with level, stars, color tier, talisman info, and power metrics. Provides interactive player squad selector with +/- power comparison.
    - **Team Preset Picker**: Easily loads hero lineups from custom teams (`useAccountTeams`) or server-saved presets (`teamGetAll.data` like Arena, Tower, Dungeon, Raid, etc.).
    - **AFK Chest Collector**: Collects accumulated Frontier Coins directly from the dialog header with live percentage tracking.
    - **Automation & Simulation Tab**: Supports single-stage testing and full continuous auto-progression.
    - **WASM Pre-Battle Simulation**: Simulates combat through Unity WebAssembly engine (`simulateBattleWithUnity`) before dispatching to server. Safely aborts if a defeat is predicted, preventing unnecessary server-recorded losses.
    - **Configurable Defeat Threshold**: Adjustable maximum consecutive defeats before stopping (`1`, `5`, or `10` defeats).
    - **Smart Team Rotation**: Optional Round-Robin rotation across multiple chosen custom teams on defeat to bypass difficult stages.
    - **Live Combat Log**: Logs every battle attempt, simulation prediction, server outcome, and coin rewards.
  - **Dashboard Integration**: Embedded Frontier activity card in `ActivityGoals.vue` showing stage position, world, enemy power, cleared stages count, and quick modal access. Removed redundant standalone card from Dashboard to preserve a streamlined layout.

### Fixed

- **Dungeon Simulation Retreat Flow (`dungeonAutomationRunner.ts`, `DungeonSimModal.vue`)**:
  - Enforced strict retreat flow on unsafe battle outcomes: when a battle outcome results in defeat, casualties (< 3 stars), or critical HP loss (< 20%), the runner safely clears active battle and calls `dungeonGetInfo` without submitting `dungeonEndBattle`, preventing titan loss.
- **Troop Promotion Dashboard Accounting (`TroopsOverview.vue`, `activityStats.ts`)**:
  - Included promoting troops in overall troop strength, hospital, and training calculations.

### Changed

- **Build Pipeline & Skills Automation (`scripts/build.mjs`, `ext-build`, `ext-backlog`)**:
  - Implemented dual-build pipeline compiling both clean Production (`dist/`, debug bridge disabled) and Debug / Unpacked (`.output/chrome-mv3`, native messaging bridge enabled).
  - Standardized automated changelog synchronization from commit history in `ext-build`.

## 0.11.134 — 2026-11-20

### Fixed

- **Dashboard Freebie Claiming: Correct Daily Bonus RPC Method to `dailyBonusFarm` (`popupData.ts`, `backgroundRuntime.ts`, `rpcCache.ts`, `definitions.ts`)**:
  - Replaced undefined server call name `dailyBonus_claim` with the authoritative Nexters RPC method `dailyBonusFarm`.
  - Added support for VIP claim arguments (`{ vip: 1 }` when `availableVip` is true in `dailyBonusGetInfo`, else `{}`).
  - Added post-claim state refresh for `dailyBonusGetInfo`.
  - Updated background runtime allowlists (`allowed` and `claimNames`) to authorize `dailyBonusFarm` and `dailyBonusGetInfo`, while maintaining backwards compatibility for `dailyBonus_claim`.
  - Updated RPC cache definitions and cache extraction to immediately update `dailyBonusGetInfo` (`availableToday: false, availableVip: false`) and merge extracted rewards upon receiving a successful `dailyBonusFarm` response.
  - Added and updated unit test coverage in `tests/claim-all-freebies.test.mjs` and `tests/rpc-cache.test.mjs`.

## 0.11.133 — 2026-11-20

### Added

- **Titan Dungeon: Semi-Automatic Clearance, Encounter Recording & Export (`dungeonBattleHistory.ts`, `DungeonModal.vue`, `rpcCache.ts`, `backgroundRuntime.ts`)**:
  - **Encounter Recording System**:
    - Built `src/utils/dungeonBattleHistory.ts` to passively record all dungeon encounters during gameplay.
    - Keys encounters using normalized enemy vs player team signatures (`e:${sortedEnemyIds}_vs_p:${sortedPlayerIds}`) with encounter records stored as an array under each key.
    - Captures total powers of both teams (`enemyPower`, `playerPower`), pre- and post-battle HP & energy stats, battle duration, stars, victory outcome, and exact RPC calls and responses (`dungeonStartBattle` and `dungeonEndBattle`).
    - Integrated with `rpcCache.ts` and `backgroundRuntime.ts` to seamlessly record from network traffic and persist across sessions via `chrome.storage.local`.
  - **Semi-Automatic Simulated Clearance**:
    - In `DungeonModal.vue`, checks each floor door against recorded encounters using `findMatchingEncounter`.
    - Matches doors where enemy lineups correspond to past victories and all player titans required for the winning lineup remain alive (`hp > 0` and `isDead !== true`).
    - Renders an "Auto Clear" (⚔️) button on matched door cards with deployed titan avatar previews, recorded stars, and duration.
    - Simulates the clearance through `dungeonStartBattle`, extracts live seed and attackers, constructs `dungeonEndBattle` with recorded metrics, and dispatches progress save and state refresh.
    - Includes interactive loading spinner and disabled state to prevent duplicate dispatches.
  - **Encounter History Export**:
    - Added an Export button (`#dungeon-export-btn`) to the dialog header right of the Refresh button.
    - Exports the complete encounter map and battle statistics into a downloadable JSON file (`hwa-dungeon-battle-history-YYYYMMDD.json`) for offline analysis.
  - Added unit test coverage in `tests/dungeon-battle-history.test.mjs` (7 new tests).

## 0.11.132 — 2026-11-20

### Added

- **Titans Tab: Full Card Hover Area & Skill Names/Icons Display (`TitansTab.vue`, `TitanHoverCard.vue`, `titanMetadata.ts`)**:
  - **Full Card Hover Trigger**:
    - Expanded hover card activation in Grid view to the entire card container by applying `hero-hover-trigger` to the outer card element in `TitansTab.vue` (matching `HeroesTab.vue`), rather than restricting hover interactions to the avatar/name inner element.
  - **Skill Names and Icons Display**:
    - Replaced redundant skill level numbers (`Lv. 130`, `130`) with skill names and icons in `TitanHoverCard.vue` since titan skill levels auto-scale with titan level and are inherently always maxed.
    - Added official titan skill definitions across all 28 titans in `titanMetadata.ts` (e.g. Sigurd: "Song of Valhalla", Nova: "North Wind", Hyperion: "Frost Needles" & "Compassion", Araji: "Incinerating Ray" & "Blastwave", Angus: "Earthquake", Eden: "Creeping Thorns" & "Underground Prison").
    - Displayed skills using compact inline badges featuring skill type icons (`⚡` / `✨`) and skill names.
  - Added unit test coverage in `tests/hero-hover-card.test.mjs`.

## 0.11.131 — 2026-11-20

### Fixed

- **Items Tab & Chest Opening: Non-Chest Collision Guard, Image Accuracy & Dark Theme UI (`chestHelper.ts`, `ChestModal.vue`, `ItemsTab.vue`)**:
  - **Non-Chest ID Collision Prevention**:
    - Added `NON_CHEST_CATEGORIES` (`gear`, `patron`, `artifact`, `scroll`, `coin`, `fragmentGear`, `fragmentTitan`, `fragmentHero`, `fragmentSkin`, `speedUp`, `teleporter`, `material`, etc.) to `src/utils/chestHelper.ts`.
    - Guarded `isOpenableChest` to immediately return `false` for any non-chest category item, preventing items like Orcish Hammer (Gear #18), Gear #62, and Relic Shards (Patron #21) from incorrectly displaying the "Open" button in `ItemsTab.vue`.
  - **Chest Modal Image Accuracy**:
    - Filtered `openableChests` in `ChestModal.vue` against `NON_CHEST_CATEGORIES`, preventing non-chest items with colliding IDs from populating the chest list.
    - Updated active chest selection to cross-reference `selectedChestCategory` alongside `selectedChestId`.
    - Resolved chest choice reward icons dynamically via `getRewardImg` fallback to `getItemIcon(reward.type, reward.id)`, ensuring all reward previews display accurate graphical icons.
  - **Dark Theme Compatibility & Tailwind Standardization**:
    - Replaced all non-standard Tailwind classes (`dark:bg-slate-850`, `dark:bg-slate-750`, `dark:hover:bg-slate-750`) in `ChestModal.vue` with standard utilities (`dark:bg-slate-800`, `dark:bg-slate-700`, `dark:hover:bg-slate-700`).
    - Enhanced contrast in dark theme across `ItemsTab.vue` for search inputs, category select options, toolbar buttons, section headers, grid cards, and table snapshot view.
  - Added unit test coverage in `tests/chest-opening.test.mjs`.

## 0.11.130 — 2026-11-20

### Added

- **Titan Hover Card Layout Alignment & Threshold Skills (`TitanHoverCard.vue`)**:
  - **Skills Threshold Highlight & Space Optimization**:
    - Removed redundant `S1`, `S2` prefixes, displaying clean level numbers.
    - Unified the `Skills` label and skill pills onto a single horizontal row (`flex items-center justify-between`) to save vertical space.
    - Added max threshold highlight: skills that reach the titan's level cap (`level >= titanLevel`) are highlighted with distinct amber background and border styling (`bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-2xs font-bold ring-1 ring-amber-500/30`).
  - **Compact Header & Metadata**:
    - Displayed titan level badge (`Lv. {{ titan.level }}`) alongside star counts in the header.
    - Realigned Skins and Artifacts into compact 1-line flex layouts with pills right-aligned (`justify-end flex-wrap gap-1`).
    - Standardized card internal grid spacing (`gap-1.5`) and padding to ensure consistent vertical compact styling across all unit hover cards.
  - Added unit test coverage in `tests/hero-hover-card.test.mjs`.

## 0.11.129 — 2026-11-20

### Added

- **Hero Hover Card Layout Redesign & Gear Thumbnails (`HeroHoverCard.vue`, `metadata.ts`, `style.css`)**:
  - **Skills Threshold Highlight & Space Optimization**:
    - Removed redundant `S1`, `S2`, `S3`, `S4` prefixes, displaying clean level values (`40`, `50`, `60`, etc.).
    - Unified the `Skills` label and skill pills onto a single horizontal row (`flex items-center justify-between`) to save significant vertical height.
    - Added max threshold highlight: skills that reach their maximum level cap for the hero's level are highlighted with distinct amber background and border styling (`bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-2xs font-bold ring-1 ring-amber-500/30`).
  - **Unified Equipment Rank & Gear Slots Frame**:
    - Merged Equipment Rank and the 6 Gear Slots into a single integrated container since the two pieces of information are directly correlated.
    - Displays equipment rank label with its tier glow color in the frame header.
    - Replaced generic circular dot buttons with miniature gear item icons (`img`) for each slot.
    - Added gear rarity border colors dynamically computed from lowest rank tiers (`border-slate-400`, `border-emerald-400`, `border-sky-400`, `border-purple-400`, `border-amber-400`, `border-rose-400`).
    - Differentiated equipped vs unequipped gear with high-contrast opacity (`opacity-100` with subtle corner dot vs `opacity-35 grayscale`).
  - **Scrollbar Elimination & Responsive Sizing**:
    - Realigned Skins, Glyphs, and Artifacts into compact inline flex rows.
    - Adjusted hover card padding to `p-2.5` (`0.625rem`) and width to `19.5rem` (`312px`), completely eliminating internal scrollbar overflow even when heroes have comprehensive data.
    - Added unit test suite in `tests/hero-hover-card.test.mjs`.

## 0.11.127 — 2026-11-20

### Added

- **Hero Dialog: Restructured Artifact Level Up Buttons (+1, +#1 Milestone, and +#2 Chest Bridge)** (`HeroDetailModal.vue`, `artifactHelper.ts`):
  - Re-architected artifact upgrade button layout into 3 organized action paths:
    - **Button 1 (`+1`)**: Upgrades 1 level using currently owned resources (`costForNextOne`).
    - **Button 2 (`+{#1}`)**: Upgrades `#1 = min(levelsDelta, affordableLevels)` levels to milestone using only currently owned resources (`milestoneCost`).
    - **Button 3 (`+{#2}`)**: Upgrades `#2 = min(levelsDelta, affordableLevelsWithChests)` levels to milestone by automatically calculating resource deficit and opening the exact number of matching choice chests (`chestsToOpen = ceil(deficit / yield)`).
  - Chest Bridge Mechanics:
    - Integrated artifact chest mappings (Weapon: Chest #62, Book: Chest #63, Ring: Chest #64) and tier yield multipliers (Gray: 12, Green: 7, Blue: 4, Violet: 2, Orange: 1).
    - When clicked, executes single batched RPC flow: dispatches `inventory_use` with exact choice index and count, followed by `#2` `artifact_levelUp` calls, followed by cache sync (`heroGetAll`, `inventoryGet`, `userGetInfo`).
    - Button `#2` is automatically hidden when player has 0 matching chests or when owned resources already cover the entire milestone.
  - Provided tactile loading spinners (`↻`) and synchronous `pointer-events-none` protection during execution.
  - Added unit test suite in `tests/artifact-level-up.test.mjs` verifying milestone calculations, chest bridge planning, and button template structure.

## 0.11.126 — 2026-11-20

### Added

- **Open Chest Dialog & Choice Caskets (`ChestModal.vue`, `ItemsTab.vue`, `chestHelper.ts`)**:
  - Implemented `ChestModal.vue` dialog enabling players to open any inventory chest, casket, or choice container directly from the extension.
  - Implemented `chestHelper.ts` containing `isOpenableChest`, `isChoiceChest`, `getChestChoices`, and drop aggregation logic:
    - Supports Choice Chests (Artifact Essence Chest #62, Artifact Scroll Chest #63, Artifact Metal Chest #64, Skin Stone Chests #51 & #65, Titan Chests #47, #48, #49, #50) with interactive reward selection preview.
    - Supports Random / Chance Chests (Bronze casket #15, Epic Chest #102, Legendary Chest #28, troves, gifts) sending `choice: -1`.
    - Drop aggregation dynamically groups multiple opened drops into concise received reward summaries.
  - Added "🎁 Open Chests" quick action to `ItemsTab.vue` toolbar, and interactive "Open" buttons / click actions on openable chest cards in both Grid and Table views.
  - Registered `'chest'` modal in `useModals.ts` and mounted in `entrypoints/popup/App.vue`.
  - Added unit test suite in `tests/chest-opening.test.mjs` verifying live game tracking parity with `temp/tracking-data/hwa-game-record-202611200058_chest_opening.json`.

## 0.11.125 — 2026-11-20

### Added

- **Loading States & Anti-Double-Click Visual Feedback (`HeroDetailModal.vue`)**:
  - Implemented synchronous click locking and dedicated action tracking (`upgradingSkillAction`, `upgradingArtifactAction`, `isUpgradingAllSkills`) to prevent double-clicking and provide immediate tactile feedback.
  - Skill Upgrade Buttons:
    - Single skill `+1` button (`btn-upgrade-skill`) now features an animated spinner (`↻`) and active highlight ring when upgrading, disabling immediate re-clicks.
    - Skill `+Max` button (`btn-upgrade-skill-max`) displays animated spinner (`↻`) and disable lock during execution.
    - Max All skills button (`btn-upgrade-all-skills-max`) activates animated spinner (`↻`) and temporary lock across all skills.
    - Video bonus claim button (`btn-claim-free-skill-points`) displays animated spinner (`↻`) and click lock.
  - Artifact Level Up Buttons:
    - Independent action tracking distinguishes whether `+1` single level or `+##` milestone upgrade was clicked, displaying animated spinner (`↻`) on the active button while temporarily locking both buttons with `pointer-events-none`.
  - Equipment Slot Buttons:
    - Craft, Equip, and Promote buttons now show animated spinners with synchronous `pointer-events-none` state to prevent duplicate RPC dispatches.
  - Added unit test assertions in `tests/hero-skill-upgrade-max.test.mjs` and `tests/artifact-level-up.test.mjs`.

## 0.11.124 — 2026-11-20

### Added

- **Multi-Call Campaign Raid Batching Loop (`CampaignRaidModal.vue`, `rpcCache.ts`)**:
  - Re-engineered raid loop in `CampaignRaidModal.vue` to dispatch batched multi-calls with `batchSize = min(itemsNeeded, raidsPossible)` per RPC request.
  - Ensures 1 RPC request executes multiple individual `times: 1` raids simultaneously without overshooting required item count or wasting player energy.
  - Automatic stopping conditions immediately break loop once target requirement is fulfilled.
  - Enhanced `rpcCache.ts` to aggregate multiple `missionRaid` drops, execution times, and tries spent within the same response batch without dropping subsequent calls.
  - Added unit test suite in `tests/campaign-raid-batching.test.mjs`.

## 0.11.123 — 2026-11-20

### Fixed

- **Fix Hero Artifact SlotId Indexing & Level Up Cache Reduction (`HeroDetailModal.vue`, `artifactHelper.ts`, `rpcCache.ts`)**:
  - Corrected artifact slot indexing in game RPC protocol to 0-based (`slotId: 0` for Weapon, `slotId: 1` for Book, `slotId: 2` for Ring).
  - Fixed `HeroDetailModal.vue` which previously sent 1-based `slotId` causing Weapon upgrades to request Book resources (`consumable #34`) and fail with `NotEnough`.
  - Updated `rpcCache.ts` reducer to directly access artifact slots using 0-based `slotId` and correctly deduce consumable essences/scrolls/metals.
  - Added unit test validation against live game tracking record `hwa-game-record-202611200026_hero_weapon_raise.json`.

## 0.11.122 — 2026-11-20

### Added

- **Hero Artifact Leveling & Milestone Upgrades (`HeroDetailModal.vue`, `artifactHelper.ts`, `rpcCache.ts`)**:
  - Implemented `artifactHelper.ts` calculating exact upgrade costs, resource types (Essence for Weapon, Scroll for Book, Metal for Ring), and quality tier milestones (Lvl 25, 50, 70, 85, 100).
  - Added artifact leveling buttons to `HeroDetailModal.vue`: single level (`+1`) and jump-to-next-milestone (`+##`) with resource cost badge rendered in smaller font size inside each button.
  - Added optimistic cache handling in `rpcCache.ts` for `artifact_levelUp` RPC actions: automatically increments hero artifact levels and deducts consumed consumable items from inventory cache.
  - Added batch dispatch queue with user notification for multi-level milestone upgrades.
  - Added comprehensive test coverage in `tests/artifact-level-up.test.mjs`.

## 0.11.121 — 2026-11-19

### Changed

- **Compact Battle Pass Milestone Tier Card Layout (`BattlePassModal.vue`)**:
  - Removed repetitive "Free:" and "Golden:" text labels from individual milestone tier cards, eliminating visual noise and reclaiming horizontal/vertical space.
  - Reorganized Free and Golden track sub-cards into a streamlined single-row layout (`flex items-center justify-between`) uniting reward badges and status indicators on the same line.
  - Replaced multi-row stacking in Milestone & Status column with a tight inline layout, integrating the single-tier claim button directly alongside requirement and status indicators.
  - Added mobile icon indicators (`🆓` / `⭐`) to retain instant track identification on small screens while desktop headers (`Free: Rewards Track` & `Golden: Pass Rewards`) remain clear.
  - Significantly reduced tier card height by ~40% for denser ladder visibility and reduced scrolling.
  - Updated test coverage in `tests/battlepass-modal.test.mjs`.

## 0.11.120 — 2026-11-19

### Added

- **Full Runtime Synchronization for Event Milestones, Targets & Rewards (`eventCatalogService.ts`, `tierHelper.ts`)**:
  - Implemented `parseQuests` in `eventCatalogService.ts`: downloads and parses `questUrl` configs from Nexters CDN, extracting dynamic requirement thresholds (`condition.target`) and reward packages (`reward: [{ type, id, amount }]`) for all quests.
  - Implemented `parseQuestChainTransferProgress`: dynamically extracts `transferProgress: boolean` per quest chain directly from `questChainUrl` CDN configs.
  - Connected `tierHelper.ts` to `chrome.storage.local.dynamicEventCatalog` with reactive `registerRuntimeTierData` and storage change listeners.
  - Prioritized dynamic runtime CDN targets and rewards in `resolveTierTarget` and `resolveTierDetail` before falling back to static dictionaries.
  - Added "🔄 Sync" button in `EventsTab.vue` toolbar to trigger on-demand CDN synchronization with real-time status feedback.
  - Integrated automatic CDN catalog synchronization into `EventDetailModal.vue` refresh workflow.
  - Added comprehensive test coverage in `tests/event-catalog-sync.test.mjs`.

## 0.11.118 — 2026-11-19

### Fixed

- **Event Milestone Tier Targets & Cumulative Progress Calibration (`src/utils/tierHelper.ts`, `src/data/questData.ts`)**:
  - Calibrated milestone target ladders for Spark of Glory / Glory of the Chosen (View 137, Event 100382):
    - **Training (Group 1325)**: Calibrated targets to mature server progression `[3000, 7500, 10000, 12500, 17500, 25000, 30000, 41000, 54000, 62000]` troops (replaces beginner scale `[50, 100, 250...]` that caused premature false completion states).
    - **Rising Legend (Group 1321)**: Calibrated targets `[10, 20, 30, 50, 70, 90, 110, 120, 130, 140, 155, 170, 185, 200, 225, 245, 270]`.
    - **Trial of Legends (Group 1322)**: Calibrated targets `[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 75]`.
    - **Daily Sign In (Group 1320)**: Calibrated targets `[1, 2, 3, 4, 5, 6, 7]`.
  - Identified & resolved implicit parameter behaviors:
    - `transferProgress: true`: Game quests in dynamic event series maintain cumulative total progression across all tiers rather than resetting to 0 per tier.
    - Server maturity scaling: Calibrated to mature server targets (`serverAge` / high server IDs).
  - Renamed View 137 to "Spark of Glory" (in-game event branding).

### Added

- **Milestone Tier Rewards Visualization (`src/utils/rewardHelper.ts`, `src/utils/tierHelper.ts`, `EventDetailModal.vue`)**:
  - Added currency and token definitions in `rewardHelper.ts`: Legend Coin (`40208`), Ascension Coin (`40207`), Ascension Crests (`40217`), Valor Coin (`40196`), Star Coin (`40211`), Pirate Coin (`100010`), Holiday Particle (`100008`), and Skin Stones (`8`, `9`, `10`).
  - Implemented dynamic reward ladder definitions and milestone reward generators in `tierHelper.ts` for all 4 Glory event chains.
  - Resolved tier reward display so `EventDetailModal.vue` renders actual reward badges (Gold, Legend Coins, Ascension Coins, Emeralds, Keys) across all milestone cards and active summaries instead of falling back to generic "Standard Reward".
  - Added unit test coverage in `tests/event-detail-modal.test.mjs`.

## 0.11.117 — 2026-11-19

### Changed

- **Battle Pass Ladder Contrast & Multi-Column Track Layout (`BattlePassModal.vue`)**:
  - Replaced invalid `dark:bg-slate-850` background with theme-harmonized `dark:bg-slate-900/60` and `dark:border-slate-800/80` for completed milestone cards to eliminate glare and restore dark theme contrast.
  - Refactored milestone tier ladder into a clean responsive 3-column layout (`md:grid-cols-12`):
    - **Col 1 (Milestone & Status)**: Level badge, target points, progress status, and dedicated one-click claim action button.
    - **Col 2 (Free Tier)**: Dedicated sub-card with free track rewards, status badge (Claimed, Ready, or Locked), and reward badges.
    - **Col 3 (Gold Tier)**: Dedicated sub-card with golden track rewards, status badge (Claimed, Ready, Pass Required, or Locked), and reward badges.
  - Added desktop header row separating `Milestone & Status`, `Free: Rewards Track`, and `Golden: Pass Rewards`.

## 0.11.116 — 2026-11-19

### Fixed

- **Guild Versus Chest Ribbon Border Clipping & Z-Index Stacking (`GuildVersusModal.vue`)**:
  - Resolved border clipping on Quick Jump Ribbon buttons ("№ 1", "№ 2", etc.) caused by `overflow-x-auto` without vertical padding.
  - Added vertical padding `py-1.5 px-1` to the ribbon container so button outline rings (`ring-2`) and focus indicators render cleanly without getting cut off at the container bounds.
  - Set explicit stacking contexts with `relative z-10` on the ribbon container and elevated `z-20` on active buttons to prevent visual tucking underneath the Target progress banner above.
  - Added clear active ring states distinguishing the active chest selection and current target chest.

## 0.11.114 — 2026-11-19

### Added

- **Captured Event Data Export for Offline Analysis (`src/utils/eventExport.ts`)**:
  - Implemented structured JSON export bundling live event states, battle passes, clan versus, daily quests, and dynamic event catalog.
  - Added "📥 Export" and "📋 Copy" buttons to `EventsTab.vue` toolbar, `EventDetailModal.vue`, and `BattlePassModal.vue`.
  - Added unit test coverage in `tests/events-export.test.mjs`.

- **Enforced Production Build and Changelog Policy**:
  - Formally recorded and accepted System Decision `20261119-2059-always-build-production-extension-and-update-changelog-before-git-push-for-immediate-deployment`.
  - Compiled and packaged production artifacts directly into tracked `dist/` directory.

## 0.11.113 — 2026-11-19

### Fixed

- **Partial & Tier Claiming for Chained Daily Quests (`QuestDetailModal.vue`, `src/utils/tierHelper.ts`, `src/utils/popupData.ts`)**:
  - Resolved intermediate tier claimability for sequential chained quests (such as Clear Brigand Camp `#362`-`#364`, Map Gathering `#365`-`#367`, Defeat Boss `#368`-`#370`, and Barracks Troop Training).
  - Fixed quest state evaluation: automatically marks quest tier as `ready` (100%) when `progress >= target` and `!isCompleted`, displaying the active Claim button.
  - Dispatched dedicated `completeQuest` RPC (`feature: 'quest'`) instead of `quest_multiFarm` for daily 4X quests.
  - Added daily quest claim detection into `getPendingClaims` and automated claiming via `buildAutoClaimCalls`.
  - Added unit test coverage in `tests/chained-quest-claim.test.mjs`.

## 0.11.112 — 2026-11-19

### Added

- **In-Game Claim Synchronization into Extension Cache**:
  - Synchronized in-game quest completions (`completeQuest`, `questFarm`, `quest_multiFarm`, `dailyQuestFarm`) into `questGetAll`, `dailyQuests`, and `specialQuestStatus`.
  - Synchronized in-game mail claims and deletions (`mailFarm`, `readAndClaimAll`, `deleteAllRead`) into `mailStatus` and `mailGetAll`.
  - Synchronized in-game freebie claims (`zeppelinGiftFarm`, `offerFarmReward`, `cinemaGiveReward`, `attentionBonus_collectReward`).
  - Added 9 end-to-end sync test cases in `tests/ingame-claim-sync.test.mjs`.

## 0.11.108 — 2026-11-19

### Added

- **Dedicated BattlePassModal & EventDetailModal View Parity**:
  - Implemented dedicated `BattlePassModal.vue` with levels ladder, milestone reward previews, free vs golden track activations, and bulk claim action.
  - Refactored `EventDetailModal.vue` into rich Special Event Viewer with milestone progress, ladder targets, and reward previews.
  - Implemented dynamic event title mapping via `eventCatalogService.ts` and `battlepassCatalog.ts`.

## 0.11.90 — 2026-11-18

### Changed

- **Visual Theme Harmonization across Building and Research Components**:
  - Harmonized ResearchModal with the cool purple theme (status badges, active queue cards, target level badges, auto-advance queue items, and researching state in directory).
  - Harmonized QueuesOverview on Dashboard to use warm amber for Building and cool purple for Research (progress fills, timer badges, manage arrows).
  - Updated Header badges to highlight active Building in warm amber and active Research in cool purple.
  - Updated SpeedupControl to dynamically style research speedup with purple and building speedup with amber.
  - Recorded and accepted System Decision `20261118-1956-visual-theme-separation-warm-amber-for-building-and-cool-purple-for-research`.

- **Daily Activity Cards Loss Metrics & Layout Alignment (`IncomeOverview.vue`)**:
  - Added loss indicators (`⚠️ X loss(es)`) under rally, raid, and monster metrics.
  - Added fixed-height `h-4` slot with whitespace placeholder (`&nbsp;`) across all 5 activity cards to guarantee horizontal baseline alignment.

## 0.11.88 — 2026-11-18

### Fixed

- **World Energy Consumed Calculation (`src/utils/activityStats.ts`)**:
  - Restrict world energy consumption solely to player-organized/hosted rallies (`organizedRalliesCount * 25`).
  - Joining rallies (both extension auto-recall and game auto-join) does not consume World Energy.

### Added

- **Detailed Source Labels on Donut Hover (`IncomeOverview.vue`)**:
  - Display full source name (e.g. `Combat Reports`, `Emerald Exchange`, `Dungeon`, `Quests`) and icon in the donut center.
  - Display detailed colored indicator bar below donut with full amount and percentage on slice hover.

## 0.11.86 — 2026-11-18

### Added

- **Daily Progress & Automation Tracking (`src/utils/activityStats.ts`, `IncomeOverview.vue`)**:
  - Implemented 30-day activity tracking & persistence in `chrome.storage.local` under `dailyActivityHistory`.
  - Aggregates daily metrics: Raid Auto-Join (extension auto-recall vs in-game auto), Campaign sweep count, rallies, solo monsters, and brigand camps.
  - Aggregates total energy consumption across World Energy and Campaign Energy below activity indicators.
  - Added anti-jitter day navigator (`◀` and `▶`, `w-24 font-mono tabular-nums`, `w-12` jump container) allowing navigation back up to 30 days without UI jumping.

### Changed

- **Dashboard Income Overview Redesign (`IncomeOverview.vue`)**:
  - Completely removed "Multi-Day Historical Trends" collapsible section and Emerald charts.
  - Replaced Column 1 with an in-place view switcher (`🍩` / `📊`) toggling between Today Donut and Multi-Day Gold Trend bar chart (`7d`, `14d`, `30d` presets).
  - Adopted 1:2 layout ratio for Gold vs Daily Progress & Automation.

### Enforced

- **English-Only UI Standardization Across Extension Components**:
  - Replaced remaining Vietnamese text occurrences across UI dialogs, badges, and dropdowns.
  - Formally recorded and accepted system decision `20261118-1904-enforce-english-only-ui-language-across-extension-components`.

## 0.11.84 — 2026-11-18

### Fixed

- **Guild Member Role Mapping (`src/utils/guildData.ts`, `src/utils/popupData.ts`)**:
  - Corrected game role codes according to official client specification (`clan_role.json`):
    - `255` (or `member.id === guild.ownerId`): Guild Master / Leader (`UI_DIALOG_CLAN_INFO_ROLE_LEADER`).
    - `4`: Warlord (`UI_DIALOG_CLAN_INFO_ROLE_WARLORD`).
    - `3`: Officer (`UI_DIALOG_CLAN_INFO_ROLE_OFFICER`).
    - `2`: Member (`UI_DIALOG_CLAN_INFO_ROLE_MEMBER`).
  - Fixed issue where regular members (`clanRole: 2`) previously defaulted to `"Role unavailable"`, officers were shown as `"Member"`, and warlords were shown as `"Officer"`.
  - Updated `formatChatRole` in popup data to recognize `4` as Warlord, `3` as Officer, `2` as Member, and `255` as Leader.

### Added

- **Guild Role Caching in RPC Reducer (`src/core/cache/rpcCache.ts`)**:
  - In `guildRosterAction` reducer, automatically compute and store each member's resolved role title directly into `members[id].role` in the `guildStatus` cache.
  - Automatically compute and store the active player's role title directly into `guildStatus.data.selfRoleTitle`.
  - Updated `guildMembers` in `guildData.ts` to consume pre-computed `member.role` with fallback to `guildRole(member, data.guild)`.


## 0.11.83 — 2026-11-18

### Added

- **Auto Gather "Optimize Squad / Team" (`buildOptimizedGatheringTeam`)**:
  - Added "⚡ Tối ưu team (Lowest Power)" (`id: 'optimized'`) option to the Gathering Team selection dropdown in `GatheringModal.vue` and `useSquadTeams`.
  - Dynamically calculates the minimal lowest-power hero squad required to gather 100% of the target mine's resources.
  - Sorts all available heroes by power ascending (`power` lowest to highest) and greedily picks heroes starting from the lowest power.
  - Stops adding heroes as soon as the total troop capacity of the selected heroes is sufficient to carry all resources from the target mine, or when reaching 5 hero slots (max squad capacity).
  - Factored in exact troop cargo capacity by level (Level 1: 240, Level 2: 260, Level 3: 280, Level 4: 440, Level 5: 800, Level 6: 1200, Level 7: 1900, Level 8: 3000, Level 9: 6000, Level 10: 10000).
  - Factored in resource densities/weights per resource type: Food: 1, Wood: 1, Stone: 5, Iron: 20 (e.g. 1 Lv7 troop carries 1900 Food/Wood, 380 Stone, or 95 Iron).
  - Updated `autoGatherPlan` and `dispatchSquadToMine` to automatically build and dispatch optimized squads with exact required troop counts, conserving available heroes and troops for base defense.


### Added

- **Account Maximum Marches Capacity Calculation (`calculateAccountMaxMarches`)**:
  - Dynamically calculates true account march capacity based on base queue (1) + completed Academy researches (`Command Tactics I` id: 7 gives +1, `Command Tactics II` id: 94 gives +1) + active 30-day subscription (+1).
  - Ensures accurate ground-truth march capacity (e.g. exactly 3 squads for accounts with Tactics I & II completed).
  - Floored at current live deployed marches/squads to avoid under-counting during active operations.

### Changed

- **Auto Gather Squad Limits Clamped to Account Capacity**:
  - Bound Auto Gather settings in `GatheringModal.vue`, `GatheringTab.vue`, and `autoGatherPlan` service to never exceed the account's actual maximum marches limit.
  - Replaced arbitrary numeric inputs with bounded squad selectors showing the account limit (e.g., `3 squads (Account Max)`).
- **Dashboard Active Marches Dynamic Placeholders**:
  - Replaced hardcoded 4 placeholders with dynamic placeholders matching `Math.max(0, accountMaxMarches - marches.length)`.
  - Added march slot numbering (e.g. `Squad Slot 3`) and updated header indicator to `{{ marches.length }} / {{ maxMarches }} active` (e.g., `2 / 3 active`).

## 0.11.79 — 2026-11-18

### Added

- **Dashboard Queue Card Progress Fill**:
  - Implemented card background fill as an active progress bar for construction and research upgrades in `QueuesOverview.vue`.
  - Added `queueProgressPercent` calculation in `dashboardState.ts` accurately measuring elapsed progress from start to completion.
  - Rendered subtle dynamic fill layers (`bg-sky-500/10` while in progress, `bg-emerald-500/10` when ready) behind text content with `z-10` layer isolation.
  - Added tabular progress percentage indicator (e.g., `45.2%` / `Ready (100%)`) on line 2 of queue cards.

### Changed

- **Dashboard Active Marches 2-Column Grid**:
  - Arranged active march cards in a 2-column grid (`grid grid-cols-2 gap-2`) matching the 2-row `h-[160px]` height of the Queue Status column.
  - Displays up to 4 marches simultaneously without scrolling, completely eliminating the scrollbar for 3 or 4 active marches.
  - Added dynamic empty squad slot placeholders up to 4 slots to preserve symmetrical 2x2 grid alignment with the Queue Status section without layout shifts.
  - Automatically enables smooth scrolling (`overflow-y-auto`) only when more than 4 marches are active.

## 0.11.76 — 2026-11-18

### Changed

- **Dashboard Queue Status & Active Marches Unified Layout**:
  - Unified the design language across Building Queue, Research Queue, and March cards (Gathering, Raid, Monster) with a consistent 3-line structural layout:
    - Line 1: Icon and title on left, font-mono timer badge on right with state color coding.
    - Line 2: Entity / target name and level on left, secondary state or progress on right.
    - Line 3: Progress bar (for gathering) or status hint on left, action indicator on right.
  - Standardized card height to `h-[76px]` across all queue and march cards, ensuring exact visual balance and symmetry between the Queue Status and Active Marches columns.
  - Locked the Active Marches container height to exactly `h-[160px]` with smooth internal scrolling (`overflow-y-auto`), matching the 2 queue cards (`76px + 8px + 76px = 160px`).
  - Added an idle squad slot placeholder when exactly 1 march is active to preserve 2-card visual symmetry.
  - Prevented UI layout jitter and vertical shifts when a 3rd or subsequent march appears by keeping the section height strictly fixed at 160px.

## 0.11.73 — 2026-11-18

### Fixed

- **Dashboard Troops Section Status Layout**:
  - Moved the `healStatus` notification message from the bottom of `TroopsOverview.vue` up to the section header title bar, positioned directly to the left of the action buttons (`Sync Healed`, `Heal All`, `Refresh`) with a fixed right-anchored button group (`shrink-0`) to prevent buttons from jittering or jumping after clicking.
  - Removed the fixed `h-8` bottom container, eliminating the abnormal vertical gap between the Troops section and the subsequent Queues section on the Dashboard.

## 0.11.72 — 2026-11-18

### Added

- **Header Marches Auto-Join Differentiation (Extension vs. Game)**:
  - Distinguished Extension Priority Auto-Join from Native Game Auto-Join in Header march icons and tooltips.
  - **Icons**:
    - Extension Auto-Join: `🤖` (Helper robot icon).
    - Game Auto-Join: `⚡` (Game lightning auto-join icon).
    - Manual Rally: `⚔️` / `⏳` (Regular raid icons).
  - **Tooltips**:
    - Extension Auto-Join: `🤖 Helper Auto-Join Raid · ${targetLabel}`.
    - Game Auto-Join: `⚡ Game Auto-Join Raid · ${targetLabel}`.
    - Manual Rally: `⚔️ Rally Raid · ${targetLabel}`.
  - Tracked Extension Auto-Join rallies in `rpcCache` (`priorityAutoJoinedRallies`) and `backgroundRuntime.ts` (`evaluatePriorityAutoJoin`), tagging marches with `autoJoinSource: 'extension'` and `isHelperAutoJoin: true`.
  - Preserved native game auto-join source `autoJoinSource: 'game'` from websocket `socketAutojoined` (`rallyUserAutojoined`).
  - Added unit test coverage in `tests/wxt-vue-frontend.test.mjs` verifying distinct badge icons and tooltips.

## 0.11.66 — 2026-11-18

### Added

- **Free Skill Points Video Claim**:
  - Added a `+10 Free` claim button (`#claim-free-skill-points-btn` / `.btn-claim-free-skill-points`) next to the skill points counter `⚡ #/10` in `HeroDetailModal.vue` when the video bonus (refillable ID 55) is available and skill points are below capacity.
  - Sourced video claim protocol from network trace `hwa-game-record-202611181243_free_skillpoints.json`, dispatching `refillable_skillpointsUseVideo` with `{ type: 'skill_points' }` and syncing `userGetInfo` and `inventoryGet`.
  - Whitelisted `refillable_skillpointsUseVideo` in `interceptor.ts` and `backgroundRuntime.ts`.
  - Updated `rpcCache.ts` reducer to immediately set `refillable:2` (Skill Points) to 10 and mark `refillable:55` consumed upon successful response.

- **Hero Skill Max Upgrade & Batched RPC Dispatch**:
  - Added a global `Max All` button (`#upgrade-all-skills-max-btn`) in `HeroDetailModal.vue` skills header to allocate all available skill points across unlocked skills in a single click up to their maximum levels.
  - Added a per-skill `+Max` button (`.btn-upgrade-skill-max`) in each skill card allowing players to max a specific skill with one click.
  - Batched multiple `heroUpgradeSkill` calls into a single RPC POST payload alongside post-upgrade sync queries (`heroGetAll`, `inventoryGet`, `userGetInfo`), allowing seamless multi-point upgrades without individual request round-trip delays.
  - Added UI lock (`isUpgradingSkills`) to disable all upgrade buttons and display loading indicators during in-flight RPCs, preventing double-clicks and state race conditions.
  - Added unit test in `tests/hero-skill-upgrade-max.test.mjs` verifying max-point computation and batched RPC payload construction.

- **Header Account Level & EXP Hover Tooltip**:
  - Added account level pill badge (`Lv. {level}`) next to the account name on `Header.vue`.
  - Added visual EXP progress background fill (`#account-level-progress`) to the level badge displaying the exact percentage towards next level (`exp / nextLevelExp`).
  - Added EXP progress and level threshold tooltip on hover (`BaseTooltip`) showing `Team Level: {level} / {maxLevel}` and `EXP: {exp} / {nextLevelExp} ({percent}%)`, and `(Max Level)` when reaching level 120.
  - Sourced official team level progression delta tables (levels 1–120) from client game data (`splitlib/level_teamDelta.json`) into `src/data/teamLevelData.ts`.
  - Extracted `experience`, `maxLevel`, and `nextLevelExp` from `userGetInfo` in `rpcCache.ts` into `accountStatus` cache data.

### Fixed

- **Valkyrie Airship Gift Claim**:
  - Corrected claim RPC dispatch from query `zeppelinGiftGet` to actual server claim calls `subscriptionFarm` and `zeppelinGiftFarm` based on network tracking data.
  - Added automatic post-claim sync querying `zeppelinGiftGet`, `subscriptionGetInfo`, `inventoryGet`, and `userGetInfo`.
  - Allowed `subscriptionFarm`, `zeppelinGiftFarm`, and `subscriptionGetInfo` in background RPC whitelist and claim groups.
  - Optimistically updated `zeppelinGiftGet.data.available = false` in cache upon `zeppelinGiftFarm` response.

- **Event Milestone Precision & Claim Separation**:
  - Removed dynamic event quests and Battle Pass claims from the Dashboard quick actions button (`ClaimAllFreebiesButton.vue`), keeping Dashboard auto-claim strictly dedicated to fixed daily freebies.
  - Eliminated false event quest completions caused by synthetic ladders in `tierHelper.ts` (which previously produced 49 phantom claimable quests and `ValidationError` failures).
  - Restricted `resolveClaimableEventQuests` to only verified criteria: explicit server readiness (`state: 'ready'`), explicit condition targets (`quest.target`), or exact verified CDN targets (`knownQuestTargets`).
  - Enforced linear chain dependency so that only the first incomplete quest in each chain is evaluated (`break`), preventing subsequent locked tiers from being claimed out of order.
  - Maintained dedicated "Claim All" button on Events tab for verified event quests and battle pass tiers.


### Added

- **Legend Draft Candidate Hero Decoding (Option A)**:
  - Created `src/utils/legendDraftDecoder.ts` implementing direct stream cipher decoding and candidate hero extraction from server RPC `response.draft`.
  - Added session signature fingerprinting (8-byte hex prefix) and 14-byte KeyDelta stream cipher recovery ($K[i \pmod{14}] = \text{Cipher}[28..41] \oplus \text{RefCipher}[28..41]$) guaranteeing 100% exact candidate matching for both defense and attack phases.
  - Integrated `decodeDraftCandidatesDetailed` into `src/content/interceptor.ts` to decode candidates immediately upon `randomDraft_getInfo` response arrival, setting `win.__hwa_legend_draft_candidates` and broadcasting `legend-draft-hook-result` without WebAssembly memory scan delays.
  - Updated `DraftModal.vue` candidate pool display to show the full 15-hero pool with instant fallback to active draft choices.
  - Documented Option B (IL2CPP object graph pointer traversal) and WASM linear scan root cause analysis in `architecture/legend-draft-system`.
  - Added comprehensive unit test suite in `tests/legend-draft-decoder.test.mjs` verifying 100% exact match against in-game ground truth across matches #360504765 and #362824711.

## 0.11.1 — 2026-11-15

### Fixed

- **Free Spin Account Context Deadlock**:
  - Resolved "Free spin needs current account data; press F5 in the game tab" deadlock where uninitialized bridge account ID blocked sending and F5 reload could not recover.
  - Initialized and synced `freeSpinAccountId` in `extension/bridge.js` and `entrypoints/bridge.content.ts` from `chrome.storage.local` (`rpcCache.accountStatus` and `userGetInfo`), and captured account ID on login/clan RPCs (`userGetInfo`, `mobileLogin`, `user_getInfo`, `user_getClanInfo`).
  - Updated `runFreeSpin` in background to proactively dispatch `userGetInfo` and `user_getNextDayTime` to the game tab when bridge account context is unobserved rather than failing with an F5 reload prompt.
  - Added unit test in `tests/auto-free-spin.test.mjs` verifying proactive account resolution and seamless spin execution.

### Added

- **Interactive Refresh Action on Modal Error Banners**:
  - Created reusable `StatusAlertBanner.vue` component with inline refresh action button directly on the right side of error/status banners (`role="alert"`).
  - Button state transitions: idle refresh icon (🔄), loading spinner with disabled click and `aria-busy` during execution, green checkmark tick (✓) on success with confirmation message, and error icon (✕ / ⚠️) on failure with retry support.
  - Integrated `StatusAlertBanner` into `RaidModal.vue` and `MonsterModal.vue` to allow immediate in-dialog refresh of marches, troops, and hero roster without closing modal or navigating away.
  - Updated `refreshTroops` in `useSquadTeams.ts` to include `getMarches` alongside `getUnitSummary` and `heroGetAll`.
  - Added unit test suite `tests/status-alert-banner.test.mjs` verifying banner states and RPC dispatches.

### Refactored

- **Unified Single Source of Truth & Cleaned Redundant Fallback Chains**:
  - Removed duplicate `(globalThis as any).hwaHelperSpeedupData?.durations` check in `speedupService.duration()` since `getSpeedupDuration()` already encapsulates data and fallback resolution.
  - Streamlined `freeAlchemyAvailability` in `src/utils/freeAlchemySpin.ts` to re-export the typed implementation directly.
  - Simplified `speedup`, `mail`, and `towerRules` utilities to reference primary typed services directly without redundant global fallbacks.
  - Cleaned redundant global map/name fallbacks in `src/utils/marchRules.ts`, `src/utils/marchTooltip.ts`, `src/utils/metadata.ts`, and `src/utils/resourceData.ts`.
  - Replaced duplicate duration calculations in `buildingQueue.ts` and `researchQueue.ts` to rely solely on primary `calculateEffectiveDurationMs` and `normalizeQueuedDuration`.

## 0.11.0 — 2026-11-15

### Added

- Complete migration to WXT / TypeScript modern extension architecture:
  - Phase 1: Static Metadata & Type Schemas (`src/data/`, `src/types/game/`).
  - Phase 2: Pure Utilities, Rules & Isolated Automation Units (`src/utils/`, `src/services/`).
  - Phase 3: Complex Queue Runners & Modular RPC Cache Store (`src/services/queues/`, `src/core/cache/`).
  - Phase 4: WXT Extension Entrypoints (`entrypoints/background.ts`, `entrypoints/bridge.content.ts`, `entrypoints/interceptor.content.ts`).

### Removed

- Removed obsolete dead JavaScript artifacts (`extension/export-name.js` and superseded test suite).
- Cleaned up unreferenced legacy assets and build exclusions.

### Changed

- Minor version release marking full modernization, code cleanup, and zero-regression verification across 939 automated unit tests.

## 0.10.115 — 2026-11-15

### Added

- Typed WXT network interceptor content script entrypoint [entrypoints/interceptor.content.ts](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/entrypoints/interceptor.content.ts) utilizing `defineContentScript()` configured for `world: 'MAIN'`:
  - Implements `isTargetRpcUrl` for matching API RPC endpoints (`/api/rpc` and `api.hero-wars-alliance.com`).
  - Implements `isMqttUrl` for matching MQTT WebSocket endpoints (`emqx-hwmb-wss.nextersglobal.com/mqtt`).
  - Implements `createApiRecordMessage` and `createQueueStatusMessage` with bounds clamping (0–64) for standardized window messaging.
  - Listens to control configuration messages (`hwa-helper-config`) from the isolated-world bridge and broadcasts ready state on initialization.
- Unit test suite [tests/interceptor-entrypoint.test.mjs](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/tests/interceptor-entrypoint.test.mjs) testing URL evaluation, message formatting, queue clamping, and WXT MAIN-world configuration.

### Changed

- Preserved 100% backward compatibility for legacy MAIN-world network interception and MQTT capture across all 940 tests.

## 0.10.114 — 2026-11-15

### Added

- Typed WXT bridge content script entrypoint [entrypoints/bridge.content.ts](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/entrypoints/bridge.content.ts) utilizing `defineContentScript()` for isolated-world messaging:
  - Implements `createControlPayload` to construct standardized `hwa-helper-config` control messages.
  - Implements `createBridgeTimeoutManager` for safe lifecycle timer management with context invalidation protection.
  - Forwards `api-record` and `rpc-queue-status` between web page and background service worker.
  - Listens to chrome storage changes (`captureSettings`, `popupRpcEnabled`, `socketRefreshMode`, `recordingState`) and pushes live control messages to the game window.
- Unit test suite [tests/bridge-entrypoint.test.mjs](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/tests/bridge-entrypoint.test.mjs) testing control message serialization, timer management, and WXT content script configuration.

### Changed

- Preserved 100% backward compatibility for legacy isolated world bridge and VM tests across all 937 tests.

## 0.10.113 — 2026-11-15

### Added

- Typed WXT background entrypoint [entrypoints/background.ts](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/entrypoints/background.ts) utilizing `defineBackground()` with service integration:
  - Registers typed RPC cache (`rpcCacheService`) and queue controllers (`buildingQueueService`, `researchQueueService`, `raidQueueService`, `monsterQueueService`, `raidEnergyAutoService`, `autoGatherService`, `smartGatherService`, `towerAutomationService`, `towerRunnerService`, `dungeonAutomationService`, `dungeonRunnerService`).
  - Registers typed support services (`speedupService`, `freeAlchemyPolicy`, `mailService`, `mineDefenseService`, `worldReadService`).
  - Implements routine startup storage optimization (pruning RPC cache).
  - Handles recording controls (`record-start`, `record-stop`, `record-clear`, `start-recording`, `stop-recording`) with session/local synchronization.
- Unit test suite [tests/background-entrypoint.test.mjs](file:///C:/Projects/git/vplghost/VPL-HWA-Ext/tests/background-entrypoint.test.mjs) testing `isGameUrl` verification and typed service registration.

### Changed

- Preserved 100% backward compatibility for classic service worker and VM tests across all 934 tests.

## 0.10.112 — 2026-11-15

### Added

- Typed RPC Cache core architecture under `src/core/cache/`:
  - `src/core/cache/definitions.ts`: complete 80+ method definitions, resource sets, material names, type names, gold skill upgrade calculation, and resource label resolution.
  - `src/core/cache/extractors/baseExtractor.ts`: typed resource creation, inventory item extraction, resourceAction generation, reward/cost action delta extractions, and route distance/duration estimation.
  - `src/core/cache/extractors/socketExtractor.ts`: typed MQTT socket packet parsing for incoming attacks, attack terminations, route completions, gathering completions, chat messages, reports, and rally battle results.
  - `src/core/cache/reducers/accountReducer.ts`: account epoch handling and clean purge of account-scoped caches on user switch.
  - `src/core/cache/reducers/pruneReducer.ts`: cache pruning logic for mail receipts, 7-day guild chat cutoff, expired special quest events, and object claim normalization.
  - `src/core/cache/cacheStore.ts`: unified cache store providing atomic `merge`, `extract`, `pruneCache`, and global fallback `globalThis.hwaHelperRpcCache`.
- Strict TypeScript interfaces in `src/types/game/rpcCache.ts` (`RpcCall`, `RpcResult`, `RpcRecord`, `CacheEntry`, `RpcCacheState`, `MergeResult`, `PruneResult`, `RpcExtractor`, `DomainReducer`, `RpcCacheModule`).
- Comprehensive unit test suite `tests/cache-store-typed.test.mjs` verifying definitions, skill gold calculations, base extractions, socket extractions, account reset reducer, cache pruning, and atomic merge.

### Changed

- Re-exported `rpcCache` types through `src/types/index.ts`.
- Preserved 100% backward compatibility on `globalThis.hwaHelperRpcCache` across all 932 test cases and extension background service workers.

## 0.10.111 — 2026-11-15

### Added

- Typed Tower Automation controller `src/services/queues/towerAutomation.ts` providing buff prioritization, buff room selection, battle room candidate scoring, and floor automation plan execution.
- Typed Tower Runner service `src/services/queues/towerRunner.ts` managing tower run lifecycle (phases, room transitions, battle completion, floor progression, runner state persistence).
- Typed Dungeon Automation controller `src/services/queues/dungeonAutomation.ts` providing titan vitality evaluation, elemental pool lineup selection, door candidate scoring, casualty tracking, and dungeon automation plan execution.
- Typed Dungeon Runner service `src/services/queues/dungeonRunner.ts` managing dungeon run lifecycle (phases, door selections, gate coordinates, battle calls, casualty checks, runner state persistence).
- Strict TypeScript interfaces in `src/types/game/towerAutomation.ts` (`TowerBuffPriority`, `TowerAutomationPlanResult`, `TowerRunnerPhase`, `TowerRunnerState`, `TowerRunnerStepResult`) and `src/types/game/dungeonAutomation.ts` (`DungeonDoorEvaluation`, `DungeonDoorSelectionResult`, `DungeonPlanResult`, `DungeonRunnerPhase`, `DungeonRunnerState`, `DungeonRunnerStepResult`).
- Comprehensive unit test suite `tests/tower-dungeon-runners-typed.test.mjs` verifying tower buff selection, battle room planning, dungeon titan survival, and door prioritization.

### Changed

- Re-exported `towerAutomation` and `dungeonAutomation` types through `src/types/index.ts`.
- Preserved global backward compatibility on `globalThis.hwaHelperTowerAutomation`, `globalThis.hwaHelperTowerRunner`, `globalThis.hwaHelperDungeonAutomation`, and `globalThis.hwaHelperDungeonRunner`.

## 0.10.110 — 2026-11-15

### Added

- Typed Auto Gather controller `src/services/queues/autoGather.ts` providing settings normalization, resource type rotation, active march counting, game load / march return detection, and automated gathering dispatch planning.
- Typed Smart Gather controller `src/services/queues/smartGather.ts` providing return time calculation, daily quest chain baseline evaluation, nearest mine probing (> 1h requirement), interrupted mine resuming, skip mine tracking, rally/queue march recalling, and state synchronization.
- Combined queue service export `src/services/queues/gatherQueue.ts` re-exporting both autoGather and smartGather services.
- Typed Smart Gather metadata module `src/data/smartGatherData.ts` with remote config sources, daily quest targets, and 40 mine level configurations.
- Strict TypeScript interfaces in `src/types/game/gatherQueue.ts` (`AutoGatherSettings`, `AutoGatherPlanResult`, `SmartGatherNearestCandidate`, `SmartGatherNearestState`, `SmartGatherInterruptedMine`, `SmartGatherDailyRow`, `SmartGatherState`).
- Comprehensive unit test suite `tests/gather-queue-typed.test.mjs` verifying settings normalization, resource rotation, march counting, nearest probe sync, and skip mine tracking.

### Changed

- Re-exported `gatherQueue` types through `src/types/index.ts`.
- Preserved global backward compatibility on `globalThis.hwaHelperAutoGather`, `globalThis.hwaHelperSmartGather`, and `globalThis.hwaHelperSmartGatherData`.

## 0.10.109 — 2026-11-15

### Added

- Typed Raid Queue controller `src/services/queues/raidQueue.ts` providing rally creation, active rally tracking, member countdown check, battle result processing, active march detection, and step planning.
- Typed Monster Queue controller `src/services/queues/monsterQueue.ts` providing solo monster attack sequence, mob target selection, attack battle result processing, and step planning.
- Typed Raid Energy Auto controller `src/services/queues/raidEnergyAuto.ts` providing energy refill calculation clamped at cap, continuous observation state tracking, natural threshold crossing detection, and configuration validation.
- Strict TypeScript interfaces in `src/types/game/raidQueue.ts` (`RaidQueueOptions`, `RaidQueueState`, `RaidBossQueue`, `RaidCurrentTarget`, `RaidQueueStepResult`), `src/types/game/monsterQueue.ts` (`MonsterQueueOptions`, `MonsterQueueState`, `MonsterCurrentTarget`, `MonsterQueueStepResult`), and `src/types/game/raidEnergyAuto.ts` (`RaidEnergyRefillSource`, `RaidEnergyAutoConfig`, `RaidEnergyAutoObservationState`, `RaidEnergyAutoObservationResult`).
- Comprehensive unit test suite `tests/raid-monster-queue-typed.test.mjs` verifying raid queue lifecycle, monster attack planning, natural energy crossing, and configuration validation.

### Changed

- Re-exported `raidQueue`, `monsterQueue`, and `raidEnergyAuto` types through `src/types/index.ts`.
- Preserved global backward compatibility on `globalThis.hwaHelperRaidQueue`, `globalThis.hwaHelperMonsterQueue`, and `globalThis.hwaHelperRaidEnergyAuto`.

## 0.10.108 — 2026-11-15

### Added

- Typed Building Queue controller `src/services/queues/buildingQueue.ts` providing simulated levels, queue timeline calculation, eligible candidate selection (excluding landmarks), step planning, and queue state mutations.
- Typed Research Queue controller `src/services/queues/researchQueue.ts` providing simulated levels, queue timeline calculation, research level extraction, step planning, and queue state mutations.
- Strict TypeScript interfaces in `src/types/game/buildingQueue.ts` (`BuildingQueueState`, `BuildingQueueCandidate`, `BuildingQueueTimeline`, `BuildingQueuePlanResult`) and `src/types/game/researchQueue.ts` (`ResearchQueueState`, `ResearchQueueTimeline`, `ResearchQueuePlanResult`).
- Comprehensive unit test suite `tests/queues-typed-migration.test.mjs` verifying building and research queue simulation, candidate eligibility, queue mutations, timeline calculations, and RPC planning.

### Changed

- Updated `BuildingModal.vue` and `ResearchModal.vue` to import and consume typed queue services directly while preserving test harness fallbacks.
- Re-exported queue types through `src/types/index.ts`.
- Preserved global backward compatibility on `globalThis.hwaHelperBuildingQueue` and `globalThis.hwaHelperResearchQueue`.

## 0.10.107 — 2026-11-15

### Added

- Typed Speedup service `src/services/speedupService.ts` providing definition lookup, suggested amounts, call validation, target extraction, stock filtering, and quote calculation.
- Typed World Read service `src/services/worldReadService.ts` providing `incomingTtl`, cache key derivation, freshness checks, wake calculation, and throttled RPC planning.
- Strict TypeScript interfaces in `src/types/game/speedup.ts` (`SpeedupKind`, `SpeedupKindDef`, `SpeedupTargetInfo`, `SpeedupQuote`, `SpeedupValidationResult`) and `src/types/game/worldRead.ts` (`WorldReadEntry`, `WorldReadState`, `WorldReadPlanOptions`, `WorldReadPlanResult`).
- Comprehensive unit test suite `tests/speedup-world-read-typed.test.mjs` verifying speedup durations, suggested amounts, validation, and world-read TTL/key/planning logic.

### Changed

- Updated `src/utils/speedup.ts` to export directly from `src/services/speedupService.ts`.
- Re-exported `worldRead` types from `src/types/index.ts`.
- Preserved global backward compatibility for legacy worker contexts.

## 0.10.106 — 2026-11-15

### Added

- Typed Free Alchemy service `src/services/freeAlchemy.ts` providing `freeAlchemyDay`, `freeAlchemyAvailability`, `freeAlchemyCycle`, and `freeAlchemyPolicy`.
- Typed Mine Defense data and service in `src/data/mineDefenseData.ts` and `src/services/mineDefense.ts` providing hospital capacities, unsafe mine detection, defense planning, and sync helpers.
- Typed Mail service `src/services/mailService.ts` providing letter/report row extraction, unclaimed reward calculation, prune, compactReports, and claim validation.
- Strict TypeScript interfaces in `src/types/game/`: `freeAlchemy.ts`, `mineDefense.ts`, and `mail.ts`.
- Unit test suite `tests/services-typed-migration.test.mjs` verifying Free Alchemy, Mine Defense, and Mail Service functionality.

### Changed

- Updated `src/utils/freeAlchemySpin.ts` to consume `src/services/freeAlchemy.ts`.
- Updated `src/utils/mail.ts` to re-export `mailService` from `src/services/mailService.ts`.
- Preserved 100% backward compatibility globals for background service workers and VM tests.

## 0.10.105 — 2026-11-15

### Added

- Typed march rules utility `src/utils/marchRules.ts` with mine resource types, rally targets, route speeds, and safe typed accessors (`getMineResourceType`, `getRallyTargetName`, `getRouteSpeed`).
- Typed tracking filter utility `src/utils/trackingFilter.ts` with `isTrackingUrl` and `TRACKING_HOSTS` set.
- Typed mission costs module `src/data/missionCostData.ts` with campaign mission start and win costs and accessors (`getMissionCosts`, `getMissionStartCost`, `getMissionWinCost`).
- Strict TypeScript interfaces in `src/types/game/march.ts` (`BasicResourceType`, `RouteType`, `MineTypesMap`, `RallyTargetsMap`, `RouteSpeedsMap`) and `src/types/game/tracking.ts` (`TrackingUrlChecker`).
- Comprehensive unit test suite `tests/march-rules-tracking-filter.test.mjs` verifying mine types, rally targets, route speeds, tracking URL detection, and mission costs.

### Changed

- Updated `src/components/dialogs/CampaignRaidModal.vue` to consume `getMissionCosts` from `src/data/missionCostData.ts`.
- Re-exported march and tracking types from `src/types/index.ts`.

## 0.10.104 — 2026-11-15

### Added

- Typed game metadata modules in `src/data/`: `questData.ts`, `towerData.ts`, `refillableData.ts`, `speedupData.ts`, and `clanVersusData.ts`.
- Strict TypeScript interfaces in `src/types/game/`: `quest.ts`, `tower.ts`, `refillable.ts`, `speedup.ts`, and `clanVersus.ts`.
- Unit test suite `tests/quest-tower-refillable-typed-data.test.mjs` verifying quest definitions/titles/resets, tower buff metadata and floor rules, refillable intervals/caps, speedup durations, and clan versus milestone thresholds/rewards.

### Changed

- Refactored `src/utils/towerRules.ts` and `src/utils/speedup.ts` to consume typed metadata with relative module imports compatible with Node ESM test runners.
- Updated `ActivityGoals.vue`, `QuestDetailModal.vue`, `TowerModal.vue`, `EventsTab.vue`, and `GuildVersusModal.vue` to integrate typed modules while maintaining backwards-compatible global fallbacks.
- Updated `tests/daily-quest-config.test.mjs` and `tests/guild-versus-unknown.test.mjs` SFC transpile mocks for typed metadata resolution.

## 0.10.103 — 2026-11-15

### Added

- Add Free Video Box rewards feature with `src/components/dashboard/FreeBoxButton.vue` mounted on Dashboard adjacent to `FreeAlchemySpinButton`.
- Add Cinema type definitions in `src/types/game/cinema.ts` (`CinemaPlacementReward`, `CinemaCountersData`, `CinemaGiveRewardResult`).
- Add RPC cache reducer handling for `cinemaGetCounters` and `cinemaGiveRewardAction` in `extension/rpc-cache.js`, tracking remaining box counts and updating reward balances.
- Add unit test suite `tests/free-boxes.test.mjs` verifying counter reduction, sequential reward updates, account switch cache clearing, and SFC button element contract.

### Changed

- Add `cinemaGiveReward` and `cinemaGetCounters` to permitted helper action methods in `extension/intercept.js`.

## 0.10.102 — 2026-11-15

### Fixed

- Fix `lastRpcUrl` endpoint poisoning in `extension/intercept.js` where `/oauth/refresh` requests contaminated dispatch targeting, strictly validating all RPC URLs against `/api/rpc`.
- Fix priority auto-join rally stall by including `{ name: 'getUnitSummary', feature: 'unit' }` in `socketRefreshCalls` for `rallyCreated` and `rallyUserAutojoined`, ensuring fresh troop capacity and squad state are loaded immediately upon rally discovery.

### Changed

- Optimize `rallyCreated` dispatch in `extension/background.js` and `extension/world-read.js` to immediately send `getRallyById` under `priority-rally` group without stale read suppression.
- Add unit test suite `tests/rally-created-auto-join.test.mjs` verifying RPC endpoint purity, complete refresh calls, and immediate `rallyCreated` dispatch permissions.

## 0.10.101 — 2026-11-15

### Added

- Typed game metadata modules `src/data/nameData.ts`, `src/data/itemData.ts`, and `src/data/campaignData.ts` with strict TypeScript interfaces (`ItemCategory`, `ItemResourceMetadata`, `ItemResourcesData`, `CampaignMission`, `CampaignMissionDrops`, `MissionProgress`, `MissionTriesInfo`).
- Comprehensive unit test suite `tests/item-campaign-typed-data.test.mjs` verifying hero/item/category name resolution, item resource icons and expiry checks, campaign missions drops, heroic tries calculations, and raidable mission discovery.

### Changed

- Refactor `src/utils/itemResources.ts`, `src/utils/resourceData.ts`, `src/utils/recipeTree.ts`, and `src/utils/metadata.ts` to consume typed name, item, and campaign data with seamless fallback for VM test harnesses and backward compatibility.

## 0.10.100 — 2026-11-15

### Added

- Typed hero and titan metadata modules `src/data/heroMetadata.ts` and `src/data/titanMetadata.ts` with strict TypeScript interfaces (`HeroRole`, `HeroClass`, `HeroFaction`, `HeroMetadataItem`, `TitanRole`, `TitanElement`, `TitanMetadataItem`, artifact evolve and level costs).
- Comprehensive unit test suite `tests/hero-titan-typed-data.test.mjs` verifying hero name resolution, titan data, artifact costs, and march tooltip integrations across 83 heroes and 29 titans.

### Changed

- Refactor `src/utils/metadata.ts`, `src/utils/marchTooltip.ts`, and `src/composables/activityState.ts` to consume typed hero and titan data directly while maintaining runtime backward compatibility.

## 0.10.99 — 2026-11-15

### Added

- Typed game metadata modules `src/data/buildingData.ts` and `src/data/researchData.ts` with TypeScript interfaces `BuildingLevelMeta`, `ResearchLevelMeta`, `ResearchTechMeta`, and cost/requirement interfaces.
- Unit test suite `tests/building-research-typed-data.test.mjs` verifying parity and calculations across 154 building types and 229 research technologies.

### Changed

- Refactor `BuildingModal.vue` and `ResearchModal.vue` to use direct typed imports for building and research metadata, requirement checks, and cost calculations while preserving test harness compatibility.

## 0.10.98 — 2026-11-15

### Added

- Add Gold and Emerald Income Analytics to Dashboard with Today's earnings breakdown by source (Emerald Exchange/alchemy, combat reports, mail, tower, campaign, dungeon, brigands, quests).
- Add interactive SVG Daily Income Trend Chart with date-range filters, defaulting to previous 7 days (excluding current day), with 14-day/30-day presets, custom date inputs and hover tooltips.

### Fixed

- Prevent TypeError accessing `battleReportSummary.data` in `mail.rows` when account is undefined on popup startup.

## 0.10.97 — 2026-11-15

### Changed

- Replace claimed battle-report details with account-scoped daily totals for the last 30 UTC days. Keep compact replay guards and aggregate confirmed claim rewards once; discard duplicate canonical/raw report payloads and full report-claim receipts.
- Group pending report rewards by type in Mail and show daily counts, known wins/losses and observed collected rewards. Preserve operational battle-result processing and claim confirmation; late report pages can enrich unknown outcomes without recounting reports.

## 0.10.96 — 2026-11-15

### Changed

- Reduce idle incoming-march monitoring to a 60-second fallback while active attacks retain 15-second freshness and immediate MQTT defense handling. Reuse native snapshots and omit incoming reads from mine-return notifications.
- Coalesce rally-detail push bursts with a five-second read window and one persisted trailing refresh for newer versions. Native details can satisfy the refresh; explicit join and raid cancellation checks remain immediate.

## 0.10.95 — 2026-11-15

### Added

- Header Mail opens a reward-first inbox dialog with deadlines, single/bulk mail claims and report rewards. Claims retain account-scoped pending state until game confirmation.
- Automatically remove mail/report entries with explicit expired deadlines from canonical/raw caches and badge counts; preserve unknown expiry and replace full inbox snapshots without retaining absent mail.

### Changed

- Show Dashboard marches in two compact columns with k/M gathering amounts and no repeated resource labels.
- Prefer passive RPC/MQTT march observations, coalesce automatic march/troop reads and request only missing snapshots. Energy refresh no longer triggers march bootstrap; stable deployed gatherers wait until their next route transition before polling.
- Apply captured mine return routes/completion pushes directly to marches while requiring fresh troop evidence before releasing recalled teams.

## 0.10.94 — 2026-11-15

### Changed

- Replace expanded speedup forms with borderless fast-forward icons beside queue progress and healing timers. Open stacked forms on demand; Escape preserves the parent dialog and explicit confirmation remains mandatory.
- Auto-select speedup quantities as min(stock, ceil(remaining time / item duration) - 1), clamped to zero, when opening the form or changing item type.

## 0.10.93 — 2026-11-15

### Added

- Manual construction, research and hospital speedups with item/quantity preview and mandatory confirmation before spending. Pending spends are shared and persisted to prevent duplicate requests.
- Confirmed native/helper speedups reduce matching timers and known item inventory once; stale or newer authoritative snapshots retain precedence. Training, universal-item exchange and overrun/refund payloads remain gated on capture evidence.

## 0.10.92 — 2026-11-15

### Changed

- Dashboard Refresh All prioritizes Energy and World Energy snapshots, reports queued or failed requests, and prevents overlapping refresh clicks.

## 0.10.91 — 2026-11-15

### Fixed

- Require five distinct heroes for hero-based expeditions even when fewer heroes already meet the power target. Reject incomplete helper start requests in Direct and Piggyback modes; preserve the hero-free Video Expedition exception.

## 0.10.90 — 2026-11-15

### Fixed

- Smart gathering skips mines rejected with MineNotFound and continues with another target. Exhausted nearest searches retry after a minute, and the specific missing-mine stop saved by older versions recovers automatically.

## 0.10.89 — 2026-11-15

### Added

- Monster dialog compares selected heroes and allocated troop power with both verified solo monster variants at the searched level, warning about weaker squads or missing data before attack. Unidentified target variants remain explicit; power is advisory.

## 0.10.88 — 2026-11-15

### Fixed

- Normalize object-shaped custom/server team members before rendering, editing and calculating power, preventing the Teams tab reduce crash after hero cache updates.

## 0.10.87 — 2026-11-15

### Added

- Opt-in Auto Free Spin in Settings: background scheduling after cooldown or daily reset, quota refresh before sending, and a shared manual/automatic confirmation lock that works with the popup closed.

## 0.10.86 — 2026-11-15

### Fixed

- Skip occupied interrupted/nearest mines reported by getMineById instead of attempting a PvE gather against another player.
- Recognize errorCode-only RPC rejections immediately. BattleTypeMismatch excludes the rejected mine and continues toward a different free target; other mutation errors stop with the actual code.

## 0.10.85 — 2026-11-15

### Fixed

- Wait for Chrome's asynchronous tab-query callback before selecting the game tab, restoring Auto-Gather start and periodic processing that synchronous test mocks previously hid.
- Show the pending RPC/mode, retry expired read-only requests up to three times, and keep unconfirmed gathering mutations protected from automatic retry.
- Allow feature-bounded mine probes and incoming-march reads in Piggyback/MQTT queues; clarify the F5 recovery message when the game RPC bridge is unavailable.

## 0.10.84 — 2026-11-15

### Fixed

- Restore own base coordinates from the game-load outpost summary so Smart gathering can replenish configured teams after reload without waiting for world-map chunks.
- Prefer the active player's known base over viewport/mine coordinates when searching gathering targets; retain sequential server-confirmed squad dispatch.

## 0.10.83 — 2026-11-15

### Changed

- Recall threatened gathering squads in the final 10 seconds only when wounded troops exceed 50% of total Infirmary capacity. Exactly 50% does not trigger; squad size no longer sets the hospital threshold.

## 0.10.82 — 2026-11-14

### Fixed

- Display unknown Guild Versus metrics and eligibility when server data is missing, preserve reported zero/false values, and require verified rules and eligibility before showing chest readiness.
- Remove invented guild, league, battle/round, participation and schedule fallback values.
- Extract daily quest names from verified remote configuration and English locale: #364 is “Clear Brigand Camp 10 times”, with captured progress shown as 5 / 10. Correct adjacent training, gathering, boss and research labels; stop treating #365 gathering as a Tower chest quest.
- Add accessible dialog titles/close labels and reusable isolated Chrome acceptance checks for both extension artifacts.


## 0.10.81 — 2026-11-14

### Added

- Detect incoming mine attacks from RPC snapshots and MQTT events; recall threatened gathering squads in the final 10 seconds only when hospital space is insufficient.
- Schedule deadline-checked defensive recalls, retain independent confirmations for simultaneous attacks, and avoid resuming mines with hostile or unknown occupancy.
- Document both supplied attack captures, exact impact timing and verified cumulative Infirmary capacity.


## 0.10.80 — 2026-11-14

### Added

- Add opt-in Smart gathering: current-day quest priorities with a 2% final-chain margin, nearest mines with estimated gathering time over one hour, queue slot release and confirmed interrupted-mine resumption.
- Allow Priority Rally Auto Join to recall a gathering squad with estimated return under 29 seconds, then recheck the rally before joining.
- Track smart gathering requirements, sequential tasks and the incoming-attack capture still needed for attack avoidance.

### Fixed

- Keep Smart gathering state scoped to the current account, require fresh march/troop snapshots and identify the actual outpost endpoint when estimating return travel.

## 0.10.79 — 2026-11-14

### Added

- Compare Rally / Boss heroes, troops and total power in raid tooltips, using verified boss presets and observed rally troops. Show known hero subtotals with `+` when other participants' power is unavailable.

## 0.10.78 — 2026-11-14

### Added

- Add Collect to ready expeditions, with confirmed in-game collection sync, released heroes, exactly-once returned rewards and quest progress updates.
- Record captured rally RPC/MQTT membership and departure contracts, and refresh tracked rallies when rallyStarted arrives.

### Fixed

- Use authoritative rally departure/arrival routes instead of obsolete planned start times, reject lower-version details and avoid membership cancellation after departure.
- Preserve expedition observation dates across overnight collection so unrelated stale slots cannot start.

## 0.10.77 — 2026-11-14

### Added

- Add an Expeditions card to Dashboard Activities and a dialog with per-expedition progress, countdowns, finish times, hero assignments and visible VIP/subscription lock reasons.
- Start eligible expeditions with automatically selected owned heroes, preventing overlapping teams and waiting for each server confirmation before continuing.

### Fixed

- Recognize a completed boss room on the final Tower floor as Done, including existing caches and getAll snapshots that omit the top-level win state.
- Refresh complete Tower and expedition snapshots through the shared RPC policy.

## 0.10.76 — 2026-11-14

### Fixed

- Show a live countdown in the Free Spin tooltip and disable the button until the observed eight-hour refill or daily game reset, whichever comes first.
- Handle captured top-level free-spin quota errors, retain authoritative refill timing, and clear stale availability when switching accounts.

## 0.10.75 — 2026-11-14

### Added

- Add a Guild tab with captured member basics, official/custom roles, activity, Titanite, last login and recorded outpost levels/coordinates, plus search, sorting, filters, refresh and JSON export.
- Estimate gathered resources from getMineSummary server start/duration/planned totals, with resource type, percentage, remaining time and overall collection progress across Gathering cards, Dashboard and march tooltips.

### Changed

- Move API Log into a dialog launched from the FAB, preserving its log/filter/sort/clear/export controls; remove Tower and Dungeon FAB shortcuts while keeping Dashboard launchers.
- Hide internal mine/squad/target identifiers from march information, preserve collection estimates at recall time, and distinguish estimates from delivered inventory balances.
- Scope recorded Guild members/outposts to the active account and Guild, clearing former associations on transitions and retaining observation timestamps.

## 0.10.74 — 2026-11-14

### Added

- Add a compact Free Spin icon button to Dashboard Quick Actions for the captured free Emerald Exchange video RPC, with queued/pending/error feedback and duplicate-click protection.

### Fixed

- Credit confirmed free-spin gold once and update quest progress without claiming quest rewards or multiplying the returned prize again by crit.
- Refresh authoritative gold, free-attempt quota and quest snapshots after successful spins under the shared RPC policy; restrict the new action to the exact free alchemy arguments.

## 0.10.73 — 2026-11-14

### Fixed

- Detect successful Guild Clash reward claims and refresh authoritative inventory, currency and refillable balances under the configured RPC dispatch policy.
- Deduplicate claim receipts and follow-up reads; ignore rejected, missing or truncated responses. Empty claim acknowledgements never invent reward amounts.
- Apply supported explicit reward payloads through the existing deduplicated resource-delta pipeline when present.

## 0.10.72 — 2026-11-14

### Changed

- Replace Brigand Camp individual hero picking with the shared saved-team options and a read-only hero preview, preserving remembered choices.
- Replace Campaign Mission ID entry with chapter-name and mission dropdowns; show possible item drops with bundled images and names on hover or keyboard focus.
- Show the five most recently successfully farmed missions when no target item is selected, saved separately per account.

### Added

- Generate campaign picker names and positive-chance item drops for 13 chapters and 190 missions from checksum-verified locale and splitlib data.

## 0.10.71 — 2026-11-14

### Changed

- Display titan roles below the element on grid cards using the same metadata as the table, with a tooltip for truncated text.

## 0.10.70 — 2026-11-14

### Changed

- Show one stylized Absolute star for six-star heroes and titans across roster cards/tables, hover cards, hero details, Draft and Dungeon enemy lineups, matching the legacy HTML icon.
- Share unit-star rendering and accessible rating labels while preserving lower ratings and artifact/battle-result stars.

## 0.10.69 — 2026-11-14

### Changed

- Use synced resource images for pinned header badges when available, with fixed icon sizing and symbolic fallback for missing or failed images.

## 0.10.68 — 2026-11-14

### Added

- Add 65 verified server images for observed inventory/resources, including relic shards, skin fragments, frames, lootboxes, materials, speedups and teleporters.
- Resolve the 16 previously unnamed inventory entries from verified locale/library references and share bundled image lookup with Items and Resources.
- Record per-item coverage, image checksums and unresolved mappings in a public audit report.

### Changed

- Hide 27 expired event resources and 27 technical reset/cooldown counters from Resources and header selection, preserving active daily quotas and raw game data.
- Fall back to category symbols when an item/resource image is unavailable or fails to load.

## 0.10.67 — 2026-11-14

### Changed

- Move healing feedback below the Troops cards into a fixed-height status area, preventing messages from shifting the Dashboard heading and troop controls.

## 0.10.66 — 2026-11-14

### Changed

- Hide Resources entries already listed in Items using exact category/ID and positive inventory quantity, retaining unmatched balances and header pin preferences.
- Keep search, pinned counts and JSON export consistent with the deduplicated Resources view.
- Fit resource cards to the available width with an automatic compact grid, a wrapping toolbar and smaller accessible pin controls.

## 0.10.65 — 2026-11-14

### Fixed

- Refresh verified English names for game client 1.293.1010 and add 236 item/resource names, including `lootboxChanced #27` → Tomes Casket.
- Resolve lootboxes, materials, construction/research/training/healing/general speedups, teleporters and talismans consistently in Items and Resources.
- Keep newly named resources visible while preserving fallbacks for untranslated IDs; require an explicit current capture when regenerating names.

## 0.10.64 — 2026-11-14

### Fixed

- Display enemy Titans from each current-floor Dungeon door's actual team data, with names, portraits, elements, levels and stars.
- Keep each door's roster separate and provide clear fallbacks when enemy data or metadata is unavailable.

## 0.10.63 — 2026-11-13

### Fixed

- Preserve day components in server Building duration strings, correcting 102 upgrade estimates including Hall of Heroes 20 → 21 (about 2d 14h instead of 2h 56m).
- Repair matching legacy estimates in saved building queues and future RPC/timeline calculations while retaining authoritative running durations and in-flight payloads.
- Display multi-day durations and dated finish estimates in Building and Research dialogs; verify all current Research duration values remain correct.

## 0.10.62 — 2026-11-13

### Fixed

- Prevent uncaught “Extension context invalidated” errors from game-page queue wake timers after extension reloads or updates.
- Catch synchronous messaging failures and asynchronous rejections, cancel stale bridge timers, and prevent late callbacks from rescheduling automation.

## 0.10.61 — 2026-11-13

### Fixed

- Prevent the popup auto-join team selector from crashing when stored custom team hero IDs are an object instead of an array.
- Normalize custom team collections in both shared option builders, preserving hero order and existing validation; skip malformed teams safely.

## 0.10.60 — 2026-11-13

### Fixed

- Refresh an existing game tab when Building or Research cannot start the next queued upgrade within 60 seconds after the previous upgrade ends.
- Share recovery across both queues and persist one attempt per stalled handoff to avoid repeated reloads; log refreshes and failures while preserving pending RPC confirmation and queued work.
- Cancel recovery when progress is confirmed, no pending targets remain, or automation is disabled.

## 0.10.59 — 2026-11-13

### Fixed

- Use the verified splitlib Tower layout (23 floors, final boss template 12) for Dashboard and Tower dialog progress.
- Remove guessed 25/26 floor sentinels and late-floor victory completion; require server completion or a win in the configured final boss room.
- Add reproducible Tower configuration extraction, source hashes, public fixtures and refresh documentation.

## 0.10.58 — 2026-11-13

### Fixed

- Correct troop stock caps to use only completed Drill Grounds; exclude legacy Camp bonuses. Level 19 + level 14 now yields 14,230 for every troop type.
- Scale troop progress against the true cap, clip visual segments at 100%, and show actual occupancy and excess troop count instead of renormalizing to current stock.
- Keep unknown and zero-cap progress explicit; training remains blocked while the cap is unknown or reached.

## 0.10.57 — 2026-11-13

### Changed

- Combine Raid auto-cancel and minimum-member controls into one compact input group, with the shorter label “Auto-cancel · last 10s”.

## 0.10.56 — 2026-11-13

### Fixed

- Derive troop stock limits from verified cumulative bonuses at each completed Drill Grounds and Camp level.
- Count all three Drill Grounds independently and use the matching Camp for Marksmen, Spearmen and Infantry.
- Remove guessed linear limits and training-batch research bonuses from stock capacity; existing excess troops no longer inflate the displayed limit.
- Show unknown limits and block training until building data is synchronized; troop refresh now includes the building summary.

## 0.10.55 — 2026-11-13

### Fixed

- Restore the last selected team separately for each account and dialog: Guild Raid, Solo Monster, Gathering, Brigand Camp and Tower.
- Preserve team choices across popup reloads and unrelated option saves; prevent stale storage reads from overwriting a newer choice.
- Remember Brigand custom teams and manual hero selections, and Tower's selected hero slots.
- Keep dialogs open when clicking the backdrop; explicit close buttons and Escape remain available.

## 0.10.54 — 2026-11-13

### Added

- Optional automatic Guild Raid when World Energy naturally rises from below to exactly a configurable threshold.
- Reuse the Raid dialog's team, boss level, count, troop limit and rally settings; keep monitoring while the popup is closed.
- Skip startup/reload, item gains, offline catch-up, energy above the threshold and conflicting queues; report skipped triggers in the dialog.

### Fixed

- Automatically search and continue when a selected boss is missing or the cached search is older than five minutes.
- Search again after target-not-found/expired boss rejections, preserving remaining raid count and excluding failed targets.
- Keep Raid preferences account-bound and respect global RPC settings when saving or starting raids.

## 0.10.53 — 2026-11-13

### Added

- Search Brigand camps from the server, filter levels 1–3 and select a target directly.
- Show camp defenders and the next respawn time; remove defeated and expired targets.
- Support camp discovery through the shared Direct and Piggyback RPC settings.

### Fixed

- Mark Tower complete on Dashboard after a confirmed final boss victory, including responses without optional completion fields (`086fb77`).
- Recognize cached boss victories while respecting daily reset and newer Tower runs.

### Build

- Synchronize package, lockfile and extension manifest versions for each committed release build.
- Keep the prepared version when repeating verification builds before the same commit.

Validation: 618 tests, 606 passed, 12 optional private-data skips; typecheck and production build passed.
