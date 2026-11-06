---
id: doc-a4f2d4f11ec3a31786de64585124abf4
title: Observed Protocol Index
description: Entry point for observed HTTP/RPC and MQTT contracts, source hashes, evidence rules and future implementation guidance
createdAt: '2026-11-06T04:06:01.651Z'
updatedAt: '2026-11-06T04:32:24.170Z'
tags:
  - api
  - rpc
  - mqtt
  - reference
---

# Observed Protocol Index

## Scope and evidence

Audited on 2026-11-06 from all 15 JSON files currently available in `temp/tracking-data`: 177 distinct RPC method/feature pairs and 9 MQTT event types. JSON parsing encountered 0 failures. Counts describe this local corpus, not the complete game API. Captures span 2026-11-02 through 2026-11-06; asset paths include client versions 1.292.0 and 1.293.0.

This reference preserves structure, never authentication headers, token values, player identities, chat contents or raw account payloads. Examples use placeholders. The source files may be local-only or later removed; their hashes below identify the exact evidence. An older test referring to a missing trace is not capture evidence.

## Catalog navigation

| Document | Captured method/event types |
|---|---:|
| @doc/api/account-system-rpc-catalog | 40 |
| @doc/api/battles-rpc-catalog | 27 |
| @doc/api/events-guild-rpc-catalog | 44 |
| @doc/api/roster-inventory-rpc-catalog | 34 |
| @doc/api/world-map-rpc-catalog | 32 |
| @doc/api/captured-mqtt-event-catalog | 9 |

Operational references:
- @doc/api/world-map-rpc-contracts — rally, boss/mine search, gathering, recall, route timing and config mappings.
- @doc/api/mqtt-processing-and-refresh — capture versus reducer support, event handling and refresh requests.
- @doc/architecture/rpc-cache-pipeline — cache architecture and piggyback dispatch.
- @doc/architecture/auto-claim-automation-bridge — dispatch opt-in and request-ID caveats.
- @doc/architecture/tower-rpc-session-and-progress-model — Tower state and room lifecycle.
- @doc/architecture/evolution-and-soul-stones — evolution costs and inventory deltas.

## HTTP and RPC envelope

| Endpoint | Observation and role |
|---|---|
| POST `https://api.hero-wars-alliance.com/api/rpc` | Batched game RPC; catalogs key methods by `name:feature`. Feature is optional and must not be discarded when routing. |
| POST `https://api.hero-wars-alliance.com/oauth/refresh` | One HTTP 200 exchange in S02. Request fields `deviceId: string`, `refreshToken: string`; response `value.accessToken: string`, `value.refreshToken: string`. Values deliberately excluded. No extension refresh implementation is established by this observation. |
| GET `https://api.aghanim.com/sdk/v1/items` | SDK item requests observed; response contract not established by these GET records. |
| GET `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/{version}/v0001/...` | Asset requests: `.img`, `.unity3d`, `.xrsx`. Resource/visual evidence, not game action RPCs. Query strings and authentication parameters are omitted. |
| WSS `wss://emqx-hwmb-wss.nextersglobal.com/mqtt` | MQTT PUBLISH event transport; see MQTT references. |

```json
{"calls":[{"name":"METHOD","feature":"FEATURE","args":{},"ident":"CALL_ID"}]}
```

```json
{"results":[{"ident":"CALL_ID","result":{"response":{}}}],"date":"SERVER_DATE"}
```

Correlate results by `ident`, not array position. A result can contain `error`; HTTP 200 alone does not prove an action succeeded. Catalog success counts mean a matched result had a `response` and no truthy `error`, not proof that every feature-specific invariant held.

## Reading structural contracts

Catalogs report observed field paths and type unions through two nesting levels. They do not assert required versus optional fields, value ranges, enum completeness or server defaults. `<key>` denotes dynamic dictionaries or high-cardinality enum maps; nested object/array contents can be intentionally collapsed. Empty arrays do not establish element types. Request root `null` can also mean the captured call omitted `args`. Numeric strings remain strings in the catalog.

Methods seen once or only during bootstrap have less evidence than repeated action traces. Names alone do not establish side effects or replay safety. Auth, consent, billing, settings and telemetry calls are indexed for discovery, not prescribed for automation.

For a future implementation: locate the pair and sources, read the complete source exchange locally, identify IDs and resource effects, check result errors, compare MQTT follow-ups, then add a focused test and update this reference. Keep one-time action reduction idempotent. Do not treat an estimated return ETA as authoritative.

## Source manifest

Hashes are SHA-256 of the complete local JSON file bytes. RPC counts count calls, MQTT counts count decoded event types. Non-record exports can have zero protocol entries.

| ID | File under temp/tracking-data | Records/export rows | RPC calls | MQTT events | SHA-256 |
|---|---|---:|---:|---:|---|
| S01 | `hwa-api-202611021116.json` | 1 | 1 | 0 | `286560b8b4d4dbb2972dafebf25a22fe373b10620c7bb0c48bb9a5bf7f0861d1` |
| S02 | `hwa-api-202611021137_guild_versus.json` | 38 | 174 | 0 | `d68ed6d589facd73076c93d75c1ce123f226b2609c044fe7b8007320685b7702` |
| S03 | `hwa-api-202611021200_evolution.json` | 7 | 7 | 0 | `a1d17c346220964782ee56262a95da842917fff9b0e4b6cc250bed9cb62f4075` |
| S04 | `hwa-api-202611021203_rally_turnback.json` | 4 | 5 | 0 | `161ccf61111281b3b81896152530d5db1f64a3a1fbd8afe94b19e9354ffe88d0` |
| S05 | `hwa-api-202611021227_titan_dungeon.json` | 40 | 40 | 0 | `28d66b7f0f57d68dad57c8c644d68f41eb9861db0344a6a4703f0c83e6a6e51e` |
| S06 | `hwa-api-202611021309_titan_evolve.json` | 4 | 4 | 0 | `aefcdfeb9b862b4abccbc00da2eae8029116d5c0fe8c46e64fb60de7d271457b` |
| S07 | `hwa-api-202611021658_chest_opening.json` | 45 | 12 | 0 | `a4f379c0ff00d2e2478c5b3842b6f4f745875b7a4e4f86a4ca72fc84352dfb77` |
| S08 | `hwa-api-202611031237_tower_session.json` | 203 | 176 | 0 | `47dfb45a81d466844b1c810ec8e62a76d30473a26197ca446334068b00f7d9b0` |
| S09 | `hwa-api-202611040956_hero_levelup.json` | 2 | 2 | 0 | `aca1cf0cca12b059f389e5da0ddaca0638e9b1b91aafeb1ad148d854dbf09618` |
| S10 | `hwa-game-record-202611041431_new_tracking.json` | 96 | 193 | 0 | `7001d99a79567bf5d5da9dd700973b8387837300f4a67b6e8d4b7a1075459ce6` |
| S11 | `hwa-game-record-202611051201_attack_monster.json` | 11 | 11 | 0 | `93f15d84a69bc08255368d8b8cd7afde6eb35583fad6a431b1b3998a48ab225b` |
| S12 | `hwa-game-record-202611061038_start_raid_rally.json` | 28 | 8 | 13 | `4771f40c46f8231fa05709cf89c3e9277c857dcae0091cfb6ab7d417683c597c` |
| S13 | `hwa-game-record-202611061040_gathering.json` | 120 | 23 | 55 | `677a299651bd56ddb5a47d1148229cc80322aba081616a7e935c8a60df6ed5e2` |
| S14 | `hwa-game-record-202611061045_search_mines.json` | 38 | 11 | 17 | `abffc9e4beb21f0592cb45456e3e7e25ab920c6f3dd2fad25322975ef6dade8f` |
| S15 | `hwa-titans-202611051321.json` | 20 | 0 | 0 | `1f08b296edfce7856a1cd566aa3fb1f1b6097652b3b2291467fc4c9ae54ac1b0` |

## Implementation anchors and maintenance

`hwaHelperRpcCache.extract`, `extractSocket`, `merge` in `extension/rpc-cache.js`; `socketRefreshCalls` in `extension/background.js`; MQTT framing in `extension/mqtt-capture.js`; popup RPC capture/dispatch in `extension/intercept.js` and `extension/bridge.js`.

Source task: @task-VHE-68C0H0. This is a descriptive evidence snapshot; future captures may extend or contradict it. Update source provenance, type unions and workflow notes together.

## Implementation-only RPC follow-up list

The following names appear in current reducer/dispatch code but have no matching raw call in the available corpus. They need a new capture before their complete wire contracts are considered documented. This list is deliberately separate from the 177 captured pairs.

| Area | Implemented names to investigate | Evidence anchor |
|---|---|---|
| Rally cancellation | `cancelRally:rally` | `hwaHelperRpcCache.extract` / `worldEnergyAction` |
| Research | `startResearch:personalResearch`, `completeResearch:personalResearch` | `hwaHelperRpcCache.extract` research branches |
| Report and mail claims | `readAndClaimAll:report`, `claimReward:report`, `mailFarm` | Reducer and `buildAutoClaimCalls` |
| Quest claims | `quest_multiFarm`, `quest_farm`, `questFarm`, `dailyQuestFarm`, `completeQuest` | Quest delta extraction and popup claim construction |
| Missions | `missionStart`, `missionRaid`, `missionEnd` | Mission progress/resource branches |
| Draft commands | `randomDraft_register`, `randomDraft_saveDefence`, `randomDraft_saveAttack`, `randomDraft_startBattle`, `randomDraft_result` | Legend Draft action extraction |
| Other actions | `shopBuy` | Resource/shop extraction |

Internal names such as `rallyAction`, `marchStatus` and `resourceAction` are cache events, not server RPC methods. Feature-less fallback aliases in the reducer are not independent evidence that the server accepts a call without its feature.

Wheel methods `alchemyUseFree` and `refillable_alchemyUseVideo` were previously interpreted but are now shelved, with no active feature tracking. See @doc/archive/shelved-wheel-of-fortune.

## Shared dispatch policy

Future consumers of these contracts must follow @doc/architecture/shared-rpc-settings: every extension-generated RPC inherits the global enable switch and Piggyback/Direct mode. A captured payload does not authorize bypassing those settings; feature exceptions require an explicit feature setting.
