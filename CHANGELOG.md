# Changelog

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
