---
id: doc-b5d0b09b59083e59cc496129ad5ef3cd
title: Sample Data Catalog
description: 'Curated sample-data/ catalog extracted from temp/tracking-data/** (241 RPCs, 38 MQTT events, 19 errors), file roles, captured schemas, and SOP for ingesting future logs or adding new domains'
createdAt: '2026-11-25T05:31:57.875Z'
updatedAt: '2026-11-25T05:31:57.875Z'
tags:
  - api
  - sample-data
  - rpc
  - mqtt
  - catalog
---

# Sample Data Catalog & Ingestion Guide

> **Canonical Reference**: Always consult `sample-data/index.json` and this document **before** scanning raw logs under `temp/tracking-data/**`. The curated `sample-data/` folder distills **144 raw capture files (42.80 MB)** into **25 clean, deduplicated, redacted JSON files (~708.8 KB — 98.4% smaller)** covering **241 RPC methods**, **38 MQTT event types**, **19 observed RPC errors**, **8 Legends Draft lifecycle stages**, and **6 exported snapshot schemas**.

Related references: `@doc/api/observed-protocol-index`, `@doc/api/captured-mqtt-event-catalog`, `@doc/architecture/legend-draft-system`.

---

## 1. Directory Map & Role of Each Sample File

`sample-data/index.json` (`_schema: hwa-sample-data-index/v1`) is the machine-readable manifest listing every file, domain, method list, byte size, and source stats.

| Domain | File | Role & Captured Scope | Count |
|---|---|---|---|
| `account-session` | `account-session/bootstrap-fresh-reload.json` | Login, migrations, `remoteConfigInit`, `splitGetMap`, time sync, server list, `stashClient`, `getPushdCredentials` | 15 RPCs |
| `account-session` | `account-session/user-profile-and-settings.json` | User profile (`userGetInfo`), avatars, settings, chat, consent/cookies, activity markers | 21 RPCs |
| `arena-grand-arena` | `arena-grand-arena/arena-session.json` | Arena matchmaking (`arenaFindEnemies`, `arenaGetAll`), `League_getInfo`, custom arena, brawl, battle teams & rankings | 15 RPCs |
| `arena-grand-arena` | `arena-grand-arena/grand-arena-session.json` | Grand Arena 3-team matchmaking (`grandFindEnemies`) | 1 RPC |
| `city-buildings-research` | `city-buildings-research/buildings-and-queue.json` | City construction start/complete/speedup and resident summary | 4 RPCs |
| `city-buildings-research` | `city-buildings-research/research-and-queue.json` | City research start/complete/speedup | 3 RPCs |
| `city-buildings-research` | `city-buildings-research/troops-train-and-heal.json` | Unit summary, training queue, hospital healing queue & speedups | 8 RPCs |
| `dungeon-titans` | `dungeon-titans/dungeon-session.json` | Titan Dungeon info, start/end battle, save progress | 4 RPCs |
| `events-rewards-mail` | `events-rewards-mail/claims-and-rewards.json` | Quests, daily/growth/special quests, mail claim/delete, battlepass, zeppelin gift, cinema/video rewards, subscriptions | 28 RPCs |
| `events-rewards-mail` | `events-rewards-mail/events-and-expeditions.json` | Expeditions, special events, offers, monthly hero, liveOps, billing & webshop | 15 RPCs |
| `guild-hydra-war` | `guild-hydra-war/guild-and-versus.json` | Guild/Clan info (`user_getClanInfo`), Clan Clash, Clan War, Global Championship, Clan Trainings, Clan Inventory | 13 RPCs |
| `guild-hydra-war` | `guild-hydra-war/hydra-samples.json` | Guild Hydra (`clanBoss_getAll`, `clanBoss_getDayHistory`, `clanBoss_getHistory`) and boss encounters | 7 RPCs |
| `legends-draft` | `legends-draft/draft-lifecycle-samples.json` | Legends Draft RPCs (`randomDraft_getInfo`, `register`, `saveDefence`, `saveAttack`, `startBattle`, `result`) | 6 RPCs |
| `legends-draft` | `legends-draft/draft-verified-rounds.json` | Stage 0..7 summaries + **pre-`JSON.parse()` decrypted raw-order hero IDs** (preserving exact 5 rounds x 3 cards) + verified in-game `.md` notes (`draft_3/4/5`) | 8 stages |
| `roster-inventory` | `roster-inventory/heroes-and-upgrades.json` | Hero roster (`heroGetAll`), evolve/promote/insertItem/upgradeSkill, skins, runes, artifacts, talismans, hero chest | 22 RPCs |
| `roster-inventory` | `roster-inventory/titans-and-evolution.json` | Titan roster (`titanGetAll`), evolve, summoning circle, titan artifacts | 4 RPCs |
| `roster-inventory` | `roster-inventory/inventory-resources-chests.json` | Inventory, fragment/recipe crafting, shops, refillables, lootboxes, lucky chest, gacha | 17 RPCs |
| `roster-inventory` | `roster-inventory/exported-snapshots-preview.json` | Compact previews & top-level schemas of exported hero, titan, inventory, resource, and full-data snapshots | 6 snapshots |
| `tower-frontier` | `tower-frontier/tower-session.json` | Magic Tower floors, rooms, buffs, chests, and battles | 8 RPCs |
| `tower-frontier` | `tower-frontier/frontier-and-campaign.json` | Campaign missions/raids, Eternal Story (Frontier), Adventure, IsometricRPG, Town Gate, Hero Story | 20 RPCs |
| `world-map-gather-rally` | `world-map-gather-rally/gather-and-mines.json` | Mine search, gathering, stop gathering, mine/outpost summary, collect resource | 8 RPCs |
| `world-map-gather-rally` | `world-map-gather-rally/rally-and-raid.json` | Rally create/join/query, rally/solo defenders, fortresses, brigand camps, shields, garrison wall | 11 RPCs |
| `world-map-gather-rally` | `world-map-gather-rally/monsters-and-march-events.json` | Mob search/attack, marches, incoming marches, routes, map chunks, markers, highwaymen (`robberGetAll`) | 11 RPCs |
| `mqtt-events` | `mqtt-events/mqtt-events-by-type.json` | Deduplicated sanitized MQTT payloads grouped by `eventType` (rally, march, clanWar, clanBoss, draft, mail, chat, quests) | 38 event types |
| `errors-diagnostics` | `errors-diagnostics/observed-errors.json` | Observed RPC failure payloads (gather deadlock, invalid heroes, healing/claim errors, etc.) + markdown error notes | 19 RPC errors + 3 notes |

---

## 2. Captured Data Schemas & Conventions

### 2.1. Standard Envelope (`_schema: hwa-sample-data/v1`)
- **RPC domain files (`kind: rpc-domain`)**:
  ```json
  {
    _schema: hwa-sample-data/v1,
    kind: rpc-domain,
    domain: <domain-name>,
    description: ...,
    methodCount: 15,
    methods: {
      <rpcMethodName>: {
        _meta: {
          sourceFile: temp/tracking-data/...,
          capturedAt: 2026-11-24T...,
          status: 200,
          hasResponse: true,
          hasError: false,
          truncated: false
        },
        args: { ...: ... },
        response: { ...: ... }
      }
    }
  }
  ```
- **MQTT file (`kind: mqtt-events`)**: keyed by `eventType` under `eventsByType`, with `topic` anonymized (`hwm/user/<REDACTED_USER_ID>`, `hwm/account/<REDACTED_ACCOUNT_ID>`, `hwm/pub/clan/<REDACTED_CLAN_ID>`, `hwm/pub/global-map/<REDACTED_MAP_UUID>`).
- **Compaction markers**: Oversized arrays and dictionaries are trimmed with explicit `_truncatedArrayItems` / `_truncatedKeys` / `_totalKeys` markers so schemas remain complete while keeping files tiny.
- **Security redaction**: Keys matching `x-auth-token`, `x-auth-session-id`, `x-auth-signature`, `authorization`, `cookie`, `accessToken`, `refreshToken`, `sessionId`, `token`, `signature`, `email`, etc. are replaced with `[REDACTED]`.

### 2.2. Notable Protocol Nuances Preserved in Samples
- **HTTP RPC Batching**: Game requests batch multiple calls in `calls: [{ ident, name, args }]` and return `results: [{ ident, result: { response } }]` matched by `ident`.
- **Legends Draft (`legends-draft/draft-verified-rounds.json`)**: `draft.base` (15 heroes) and `draftEnemy` (Stage 2: 15-hero enemy attack pool; Stage 4: 5-hero enemy defense team) encode exact 5-round x 3-card order in raw JSON key order before `JSON.parse()` re-sorts numeric keys. `draft-verified-rounds.json` stores `decryptedRawOrderBaseHeroIds`, `decryptedRawOrderSwapHeroIds`, and `decryptedRawOrderEnemyHeroIds`.
- **Guild Membership**: Authoritative guild data comes from `user_getClanInfo` (`guild-hydra-war/guild-and-versus.json`), whereas `getSummary` (`world-map-gather-rally/monsters-and-march-events.json`) covers city/map state.

---

## 3. SOP: Adding New Logs or Creating New Domains

Tooling lives in `scripts/curate-sample-data.mjs` with 3 npm scripts:
- `npm run sample-data:build` — Full rebuild from `temp/tracking-data/**` (including `archived/`).
- `npm run sample-data:ingest -- <path-to-log>` — Incrementally merge a new log file (or folder) into existing `sample-data/` without losing verified samples.
- `npm run sample-data:verify` — Validate JSON integrity, index consistency, and zero leaked auth secrets.

### Workflow A: Ingesting a New Log into Existing Domains
1. Run incremental ingestion:
   ```powershell
   npm run sample-data:ingest -- temp/tracking-data/<new-log>.json
   ```
2. Review console output for `+N new RPCs`, `+M new MQTT types`, and check whether any RPC landed in `Unclassified RPCs`.
3. Run verification:
   ```powershell
   npm run sample-data:verify
   npm test
   ```
4. If new RPC methods or MQTT event types were added, update the counts/tables in this Knowns doc (`knowns doc edit api/sample-data-catalog ...`).
5. Archive the raw user log into `temp/tracking-data/archived/` per `ext-backlog` hygiene rules.

### Workflow B: Adding a New Functional Domain
1. Open `scripts/curate-sample-data.mjs` and add a new entry to `CATEGORY_RULES`:
   ```js
   {
     domain: '<new-domain-slug>',
     file: '<sample-file-name>.json',
     description: '<short English description of captured RPCs>',
     match: (name) => /^(prefixA_|prefixB_)/i.test(name),
   }
   ```
2. Run `npm run sample-data:build` (or `sample-data:ingest -- <log>`) to generate `sample-data/<new-domain-slug>/<sample-file-name>.json` and update `sample-data/index.json`.
3. Run `npm run sample-data:verify` and `npm test` (which executes `tests/sample-data-catalog.test.mjs`).
4. Add the new domain row and any protocol nuances to this Knowns doc (`api/sample-data-catalog`) and cross-link from `api/observed-protocol-index` if appropriate.
