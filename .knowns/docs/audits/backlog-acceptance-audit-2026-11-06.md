---
id: doc-9343764e49eb9a9d093157a25c89082d
title: Backlog Acceptance Audit 2026-11-06
description: Evidence-led reconciliation of 79 completed tasks, 40 unchecked criteria, archived supersessions and rally lifecycle remediation
createdAt: '2026-11-06T10:32:42.954Z'
updatedAt: '2026-11-06T10:34:26.742Z'
tags:
  - audit
  - tasks
  - acceptance
  - backlog
---

# Backlog Acceptance Audit 2026-11-06

## Outcome and method

Audit task: @task-VHE-MRH4NM. Important remediation: @task-VHE-MACK1D.

All **79 pre-existing tasks** were already marked done. **10 tasks retained 40 unchecked acceptance criteria**; **21 tasks had no original AC list**. Task validation initially reported 40 warnings.

After matching the outstanding criteria to current code/tests, **37 fulfilled criteria were checked** and **3 obsolete/unverifiable criteria were removed** with explicit notes/history. All 79 original tasks were archived through Knowns `tasks.batch_archive`, preserving descriptions, plans, notes, references and lifecycle history. No task was hard-deleted. Tasks without original ACs are archived historical records, not retroactively certified against invented requirements.

The 48 tasks whose criteria were already checked retain their historical acceptance status. Current feature regressions and relevant superseding implementations were reviewed; this does not claim every historic live-game scenario was re-run. Complete code-level checks: **283 passed, 10 explicitly optional private-trace replays skipped, 0 failures**. Build: **0.9.78**.

## Important actual gap fixed

The audit found that legacy `returnRoute` and `battleReport` branches updated **every cached rally**, including unrelated or foreign return routes. @task-VHE-MACK1D now requires a unique positive rally/squad/route/own-boss match. Shared-target ambiguity and foreign route leaders are rejected. Boss configuration/level alone is not rally instance identity. Anonymous old reports continue feeding mail/rewards but no longer alter ETAs.

The same task removes hardcoded player IDs/display-name ownership, preserves the player's auto-joined team when member detail is absent, retains return-route IDs across snapshots/MQTT, and permits same-timestamp details to enrich a snapshot. Three new regression groups cover simultaneous rallies, ownership and ambiguity; the old test now supplies explicit identity instead of asserting unsafe singleton behavior. Shared RPC policy and confirmed-return raid-queue rules remain in force. No live game RPC was issued.

## Outstanding-criterion evidence

### VHE-0SD4FR

Verified clanVersus extract/merge and claimChest reducers in rpc-cache; Events and Guild Versus modal plus cap styling in popup; regressions: rpc-cache.test.mjs clanVersus/claimChest tests and events-ui.test.mjs renderEvents/openGuildVersusModal/header capped styling.

Original ACs checked: 1, 2, 3, 4.

### VHE-WABVR0

English Draft labels/lock statuses verified in renderDraft and legend-draft-ui.test.mjs. Existing user preference memory hedex0 reviewed with its original Why/source and activated; no new language preference inferred from this audit request.

Original ACs checked: 1, 2, 3.

### VHE-8RNWEA

heroEvolve star/fragment regression passes; report/return-route handling corrected under @task-VHE-MACK1D to avoid updating unrelated rallies. Only positive identities update a march; anonymous legacy reports still feed mail but cannot supply rally ETA. Expiry verified by isMarchExpired and header march UI regression.

Original ACs checked: 1, 2, 3.

### VHE-BTT7V8

Verified renderDraft five-step picking, createHeroInline detailed cards, buildingTooltip/researchTooltip, bridge helper injection, heroUpgradeSkill and mission raid cache reducers. Evidence: legend-draft-ui, popup-hero-view, popup-data, bridge and rpc-cache tests, all passing.

Original ACs checked: 1, 2, 3, 4, 5.

### VHE-257GHV

Verified createUnityInstance/setter/Module/canvas/SendMessage hooks, engine-status forwarding and safe degradation in intercept/bridge/background. Removed original AC #2 as obsolete/unproven: private Nexters dispatcher/RPC-queue discovery was never verified and is no longer the selected transport. Current authorized mechanisms are shared RPC interception and MQTT-assisted piggyback (@task-VHE-62VVG5, @task-VHE-6PCSC3), not a private dispatcher claim. Tests: intercept.test.mjs engine hook/scanner cases and bridge.test.mjs engine command forwarding.

Original ACs checked: 1, 3, 4. Original AC 2 removed as obsolete/unverifiable, with its text and rationale preserved in task history.

### VHE-SC6B8F

Verified table-export-btn precedes row/status count in popup.html and uses exportTableData/exportTableFilename. Rich hero/titan/item/resource/team/other snapshots covered by popup-data.test.mjs; visibility covered by events-ui.test.mjs.

Original ACs checked: 1, 2, 3.

### VHE-96PA6T

Verified markGuildChatAsRead stores max ctime in guildChatLastReadTime, getUnreadChatCount compares timestamps, updateGuildChatBadge hides zero and chat opening marks read. Evidence: guild-chat-ui.test.mjs unread/persist/read tests and popup-data.test.mjs unread count.

Original ACs checked: 1, 2, 3, 4.

### VHE-M2T34S

Verified 15-hero 5x3 matrix/lock tests, hero/titan soul stone progress and upgradable highlights. Removed original AC #2 navigation-tab requirement as superseded by the Guild Chat FAB/dialog (@task-VHE-GSFVHT, @task-VHE-ARSAFV, @task-VHE-Q1PGF6). Sender roles, search and messages remain implemented/tested inside that dialog; no obsolete tab is reintroduced.

Original ACs checked: 1, 3, 4. Original AC 2 removed as obsolete/unverifiable, with its text and rationale preserved in task history.

### VHE-9DYH5V

Verified context-invalidation recovery, dungeonEndBattle/dungeonSaveProgress/inventory_use reducers and reward balances, Events card and Dungeon modal floor/checkpoint/elements/doors/titan state. Evidence: bridge, rpc-cache, events-ui tests. Full suite: 283 passed, 10 explicitly optional historical trace replays skipped; 0 failures. Build is verified in final audit pass, not claimed as a live browser test.

Original ACs checked: 1, 2, 3, 4, 5, 6.

### VHE-46QD1A

Verified rallyUserAutojoined reducer/refresh, own squad/team/ETA preservation and Auto-Join Raid tooltip. Evidence: background.test.mjs auto-join push and rpc-cache transition/ownership tests plus popup-data march tooltip. Removed original AC #1 requiring a specific absent private file hwa-api-202611022205_auto_joi_raid.json: original raw replay is unavailable, not re-analysed; current deterministic RPC/MQTT regressions cover the maintained contract. Optional private replay stays explicitly skipped.

Original ACs checked: 2, 3, 4. Original AC 1 removed as obsolete/unverifiable, with its text and rationale preserved in task history.

## Superseded requirements retained as history

- @task-VHE-H21N2H: Wheel tracking portion is explicitly shelved by @task-VHE-8D82V9; do not resume it during backlog cleanup. Draft coin/shop portions remain covered by rpc-cache tests.
- @task-VHE-NW3DPW: Historical Wheel work is retired by @task-VHE-8D82V9 and @doc/archive/shelved-wheel-of-fortune. Existing historical completion is preserved; no Wheel development or tracking is restarted.
- @task-VHE-Y5EAR4: The original passive-only/no-refresh policy has been superseded by optional authorized RPC features and the shared gate/modes in @task-VHE-62VVG5. Passive observation still works when helper RPC is off; this archive does not restore the obsolete prohibition on opt-in refresh.
- @task-VHE-1K5J8J: Explicit hero/base inputs and missing-capacity blocking in the original notes are superseded by @task-VHE-NFV32J Settings defaults and observed-load inference. Queue identity/return/loss rules remain active; lifecycle identity gap is fixed under @task-VHE-MACK1D.
- @task-VHE-QEWSHW: Original 1.292 avatar inventory/fallback assumptions are superseded by @task-VHE-JTJQJK: all 83 heroes now have verified CDN PNGs including hero 78. Current avatar/hover behavior passes updated UI tests.
- @task-VHE-0CMY12: The old pinned 1.292 name/asset source is historical; @task-VHE-JTJQJK refreshes verified 1.293 manifest/catalog/locale. Current provenance lives in @doc/workflows/versioned-cdn-asset-synchronization.
- @task-VHE-C0GGBR: Initial pending-payload and direct-dispatch notes are historical, not open work: payloads were supplied and the feature completed. Global RPC policy is now @task-VHE-62VVG5; queue/capacity UI is superseded by @task-VHE-1K5J8J and @task-VHE-NFV32J.

In particular, Wheel remains shelved under @task-VHE-8D82V9. No Wheel implementation or tracking was resumed. Draft/Chat navigation requirements are evaluated against their newer dialogs; old capacity-input and 1.292-asset assumptions are superseded by @task-VHE-NFV32J and @task-VHE-JTJQJK. Private dispatcher discovery is not claimed as implemented.

Existing English preference `hedex0` was reviewed/activated with its original user-request provenance and current renderer/test evidence. Other draft decisions were not accepted and unreviewed Memories were not mass-promoted.

## Original task ledger

| Task | Historical title | Disposition before archival |
| --- | --- | --- |
| @task-VHE-03MH3T | Config refresh buttons, soul stone evolution badges on Heroes and Titans tabs, and new mail resource alert header icon | Historical done; no original AC supplied |
| @task-VHE-07RNX3 | Safely handle extension context invalidated on bridge window message | Historical done; no original AC supplied |
| @task-VHE-0CMY12 | Do CDN assets va hien thi ten heroes items | Historical completion; superseded parts annotated |
| @task-VHE-0SD4FR | Guild Versus modal, Events tab, chest rewards, and header cap glow | 4 verified |
| @task-VHE-1898K3 | Hero favorite star toggle, favorite priority sorting, and default power sort | Historical done; no original AC supplied |
| @task-VHE-1K5J8J | Add troop optimization and sequential raid queue | Historical completion; superseded parts annotated |
| @task-VHE-257GHV | Implement in-game engine probe and automation dispatcher bridge | 3 verified; 1 obsolete criterion removed |
| @task-VHE-2D129Z | Them ten doi hinh, tien do soul stone va nut mo popup trong tab | 4/4 already checked; current feature regressions pass |
| @task-VHE-36TQJZ | Fix tab detection for refresh, fix mail alert retention, and track titan evolve | Historical done; no original AC supplied |
| @task-VHE-3EN247 | Hero artifact 5-color breakpoints, capped resource ping highlight, and item assets in inventory | Historical done; no original AC supplied |
| @task-VHE-3MW0HZ | Accurate Legend Draft extraction, defense/attack review switcher, and active-only pick matrix | Historical done; no original AC supplied |
| @task-VHE-434QVD | Lap bang du lieu game va them cache tabs | 4/4 already checked; current feature regressions pass |
| @task-VHE-46QD1A | Track guild rally creation and auto-join raid in marchStatus | 3 verified; 1 obsolete criterion removed |
| @task-VHE-4VAA2V | Resolve Legend Draft false lock, display 15-hero candidate matrix for calculation, and poll canvas engine status | 5/5 already checked; current feature regressions pass |
| @task-VHE-62VVG5 | Enforce shared RPC settings for every extension RPC | 3/3 already checked; current feature regressions pass |
| @task-VHE-68C0H0 | Document observed RPC and MQTT protocol catalog | 3/3 already checked; current feature regressions pass |
| @task-VHE-6PCSC3 | Add MQTT-assisted piggyback RPC dispatch option | 4/4 already checked; current feature regressions pass |
| @task-VHE-7RYK7E | Extract and sync resources from openLootboxChanced and inventory_use chest openings | 5/5 already checked; current feature regressions pass |
| @task-VHE-8D82V9 | Fix Draft dialog isolation and show RPC queue count | 4/4 already checked; current feature regressions pass |
| @task-VHE-8RNWEA | Hero evolution tracking and rally return route handling | 3 verified |
| @task-VHE-96PA6T | Track last read guild chat timestamp and compute accurate unread badge count | 4 verified |
| @task-VHE-9DYH5V | Titan Dungeon tracking, detail modal, and bridge context invalidation recovery | 6 verified |
| @task-VHE-A8JK1B | Enhance capped resource highlight with vibrant pulsing glow effect | 4/4 already checked; current feature regressions pass |
| @task-VHE-AA50M9 | Add Titan Dungeon FAB dialog shortcut | 3/3 already checked; current feature regressions pass |
| @task-VHE-ARSAFV | Integrate quest tracking into goals and bottom-to-top guild chat dialog ordering | Historical done; no original AC supplied |
| @task-VHE-AX880Z | Show live march icons and remaining time in header | 4/4 already checked; current feature regressions pass |
| @task-VHE-B51R3D | Titan evolve tracking, extension version bump automation, and knowledge extraction | Historical done; no original AC supplied |
| @task-VHE-BTR30J | Sync research start and raid World Energy from live RPC | 3/3 already checked; current feature regressions pass |
| @task-VHE-BTT7V8 | Legend draft UI, hero stat cards, queue tooltips, and raid campaign tracking | 5 verified |
| @task-VHE-C0GGBR | Add experimental rally and gather tab | Historical completion; superseded parts annotated |
| @task-VHE-CE8PPK | Track gathering spots and return route to clear header icon | 3/3 already checked; current feature regressions pass |
| @task-VHE-DBAYGG | Event resource stock display and Goals roadmap tracking tab | Historical done; no original AC supplied |
| @task-VHE-DVWXWW | Track solo monster attack march, World Energy, and battle result | 5/5 already checked; current feature regressions pass |
| @task-VHE-E2CHEH | Investigate and resolve Unity instance detection in automation bridge | 4/4 already checked; current feature regressions pass |
| @task-VHE-E2DQRW | Fix Energy cap and numeric table alignment | 4/4 already checked; current feature regressions pass |
| @task-VHE-E85RA5 | Chi lang nghe API va them cong tac tracking/log | 4/4 already checked; current feature regressions pass |
| @task-VHE-EBNKTR | Luu body request va response cho POST tracking | 3/3 already checked; current feature regressions pass |
| @task-VHE-EZ49PN | Fix Resources sort and require version bump per build | 4/4 already checked; current feature regressions pass |
| @task-VHE-F99XNX | Cau hinh popup Tailwind, sap xep va hien energy | 7/7 already checked; current feature regressions pass |
| @task-VHE-FD2PKK | Add pulsing animation effect to raid and rally march icons | 4/4 already checked; current feature regressions pass |
| @task-VHE-FF9GNN | Legend Draft modal dialog, cache reset on match start, candidate matrix fix, remove redundant version, and abbreviate Dodge as Ddg | Historical done; no original AC supplied |
| @task-VHE-FXHQJY | Refine Goals UI padding, deduplicate Guild Versus round/daily goals, and handle Tower cleared status | 3/3 already checked; current feature regressions pass |
| @task-VHE-FZRFSN | Sync spend and mail rewards from live RPC | 4/4 already checked; current feature regressions pass |
| @task-VHE-GQ0290 | Phan loai API log va loc tracking | 4/4 already checked; current feature regressions pass |
| @task-VHE-GS0FA2 | Guild Versus challenge step denominators, Dante Dodge skin stat, and hide empty log buttons | Historical done; no original AC supplied |
| @task-VHE-GSFVHT | Guild chat FAB with reverse scroll, other section in config, in-game recording controls, and draft candidates matrix | Historical done; no original AC supplied |
| @task-VHE-H04RE2 | Configurable tab order/visibility and power-up onload analysis | Historical done; no original AC supplied |
| @task-VHE-H21N2H | Track Wheel of Fortune free spin, Legend Draft coin deduction, and Shop purchase updates | Historical completion; superseded parts annotated |
| @task-VHE-H817RH | Implement Auto-Claim automation for Mail rewards, Battle Reports, and Completed Quests | 4/4 already checked; current feature regressions pass |
| @task-VHE-J3V9WJ | Hide Hero and Titan IDs on tables, move to hover cards, and display version in header | 4/4 already checked; current feature regressions pass |
| @task-VHE-J76S7K | Document Tower session and add Tower FAB dialog | 4/4 already checked; current feature regressions pass |
| @task-VHE-JTJQJK | Audit and refresh assets for live game 1.293 | 4/4 already checked; current feature regressions pass |
| @task-VHE-M2T34S | Legend draft matrix, guild chat tab, titan soul stones, and upgradable row highlights | 3 verified; 1 obsolete criterion removed |
| @task-VHE-M9EXXH | Investigate refresh API errors in call_error trace | Historical done; no original AC supplied |
| @task-VHE-MDNR3V | Compact resource values and show renewable tooltip rate | 4/4 already checked; current feature regressions pass |
| @task-VHE-MKKGFK | Show verified production rates for Realm materials | 3/3 already checked; current feature regressions pass |
| @task-VHE-N00E64 | Fix hero glyph labels and implement quest & mail claim tracking | Historical done; no original AC supplied |
| @task-VHE-N8QQGB | Khoi tao HWA Helper va theo doi API | 3/3 already checked; current feature regressions pass |
| @task-VHE-NFV32J | Simplify rally troops and learn capacity from squads | 4/4 already checked; current feature regressions pass |
| @task-VHE-NW3DPW | Fix Wheel of Fortune free spin state and commit workspace | Historical completion; superseded parts annotated |
| @task-VHE-PJJD5V | Sync x-request-id counter to prevent server rejection, fix auto-claim UI update, and implement inventory grid view for items | Historical done; no original AC supplied |
| @task-VHE-PKDENV | Resources, hoi theo thoi gian va header account/timers | 5/5 already checked; current feature regressions pass |
| @task-VHE-Q1PGF6 | Prevent guild chat from overwriting main view content and status on FAB opening | Historical done; no original AC supplied |
| @task-VHE-Q9KVJD | Titan hover card enrichment, favorite titans toggle, and artifact column with upgrade highlighting | Historical done; no original AC supplied |
| @task-VHE-QEWSHW | Hero avatars beside names with hover card and hidden foreign key columns | Historical completion; superseded parts annotated |
| @task-VHE-R2634G | Stabilize resource tooltips and display rounded refill time | 3/3 already checked; current feature regressions pass |
| @task-VHE-RH2Z4P | Support all resources for header selection, group by renewable, and toggle inactive/test items | 4/4 already checked; current feature regressions pass |
| @task-VHE-SC6B8F | Table JSON export button for heroes, titans, items, and resources | 3 verified |
| @task-VHE-SFXGCP | Fix challenge resource stock zero inventory resolution for summoning and elemental spheres | 4/4 already checked; current feature regressions pass |
| @task-VHE-TCQV7Q | English UI and timed resource eligibility | 6/6 already checked; current feature regressions pass |
| @task-VHE-VEH80A | Record game UI interactions and exposed engine calls alongside API capture | 5/5 already checked; current feature regressions pass |
| @task-VHE-VXZJZG | Fix HTTP 500 on RPC dispatch by cleaning headers and sequential sequence | Historical done; no original AC supplied |
| @task-VHE-WABVR0 | Standardize all user-facing content and UI text in English | 3 verified |
| @task-VHE-X1SQQH | Phan biet log API cu va ban tracking hien tai | 4/4 already checked; current feature regressions pass |
| @task-VHE-XN88Z0 | Display export button across list views and refine titan dungeon display | Historical done; no original AC supplied |
| @task-VHE-XTBH0Y | Search gathering mines by level and move Draft alert to header | 4/4 already checked; current feature regressions pass |
| @task-VHE-XY1PEC | Guild Versus stacked chest cards and daily challenge point conversion | 3/3 already checked; current feature regressions pass |
| @task-VHE-Y5EAR4 | Bo nut refresh cache, giu cap nhat thu dong | Historical completion; superseded parts annotated |
| @task-VHE-ZFAXZJ | Enrich rally marches with target team and leg times | 4/4 already checked; current feature regressions pass |

## Validation limits and non-task warnings

- Task validation after reconciliation: **0 errors, 0 warnings**.
- Full Knowns validation: **0 errors, 45 warnings** concerning old Memory trust metadata/source/TTL fields. Those are not unchecked task ACs. This audit does not manufacture confidence/source/TTL data or silently promote unreviewed entries to suppress them.
- Ten optional historical raw captures are absent. Synthetic contract/state/UI regressions run; a skipped original-file replay is not reported as executed.
- Live in-game timing/dispatch and two upstream missing consumable textures (103/104) remain previously documented external limitations, not falsely closed new implementation tasks.
- Canonical task archives preserve all references; latest source-of-truth guidance remains in docs and active verified memory.

## Final archive state

All **81 tasks** (79 original records plus the audit and remediation tasks) are archived as completed. The active task backlog is empty; history and references remain accessible. Final source/dist build is **0.9.78**, with 283 passing checks and 10 explicitly optional private-trace skips. Task/doc validation has no errors or warnings; the 45 legacy Memory metadata warnings described above remain outside task-acceptance debt.
