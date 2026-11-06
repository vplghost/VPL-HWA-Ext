---
id: doc-39b2720d921b7d7766abc655f7f8889c
title: Roster Inventory Rpc Catalog
description: Observed 34 RPC method contracts with request/response field types, counts and source evidence
createdAt: '2026-11-06T04:06:01.908Z'
updatedAt: '2026-11-06T04:06:01.908Z'
tags:
  - api
  - rpc
  - catalog
  - captured
---

# Roster Inventory Rpc Catalog

Captured evidence catalog, audited 2026-11-06. See @doc/api/observed-protocol-index for source IDs, transport envelope, redaction and interpretation rules.

34 distinct method/feature pairs. Fields below are observed type unions through two nesting levels; they are not required-field definitions or complete server schemas. `<key>` means dynamic dictionary key; empty arrays reveal no element contract. Counts include repeated calls and bootstrap batches.

## artifactGetChestLevel

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.level: number
$.starmoneySpent: number
$.xp: number
```

## artifact_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.<key>: object
```

## artifact_getExpeditionCapSession

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.didReachCapYesterday: boolean
```

## battle_teamGetClient

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.arena: array
$.arena[]: array
$.bossFight: array
$.bossFight[]: array
$.brawl_71: array
$.brawl_71[]: array
$.brawl_72: array
$.brawl_72[]: array
$.clanBossHead_1: array
$.clanBossHead_10: array
$.clanBossHead_10[]: array
$.clanBossHead_13: array
$.clanBossHead_13[]: array
$.clanBossHead_1[]: array
$.clanBossHead_2: array
$.clanBossHead_2[]: array
$.clanBossHead_3: array
$.clanBossHead_3[]: array
$.clanBossHead_4: array
$.clanBossHead_4[]: array
$.clanBossHead_5: array
$.clanBossHead_5[]: array
$.clanBossHead_6: array
$.clanBossHead_6[]: array
$.clanBossHead_7: array
$.clanBossHead_7[]: array
$.globalMapCamp: array
$.globalMapCamp[]: array
$.globalMapRallyAutoJoinTeamKey: array
$.globalMapRallyAutoJoinTeamKey[]: array
$.globalMapTeamKey: array
$.globalMapTeamKey[]: array
$.misiions: array
$.misiions[]: array
```

## battle_teamSet

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S13.

Request `args` fields:
```text
$: object
$.key: string
$.units: array
$.units[]: array
```

Successful `result.response` fields:
```text
$: null
```

## clan_getInventory

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.clanBorder: object
$.clanBorder.<key>: number
```

## getHeroSummary:hero

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.squadHeroSkills: array
$.squadHeroSkills[]: object
```

## getInventory:inventory

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.inventory: object
$.inventory.items: array
```

## heroChest_getInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.factionId: number
$.opensCount: number
$.startRewardLineupCompleted: boolean
$.videoCooldown: number
```

## heroEvolve

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S03.

Request `args` fields:
```text
$: object
$.heroId: number
```

Successful `result.response` fields:
```text
$: null
```

## heroGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.artifacts: array
$.<key>.baseSkinId: number
$.<key>.color: number
$.<key>.currentSkin: number
$.<key>.currentSkinRank: number
$.<key>.hero_runes: array|object
$.<key>.id: number
$.<key>.level: number
$.<key>.patronLevel: number
$.<key>.power: number
$.<key>.runes: array
$.<key>.skills: object
$.<key>.skins: array|object
$.<key>.skinsInfo: array
$.<key>.slots: array|object
$.<key>.star: number
$.<key>.titanCoinsSpent: null|object
$.<key>.titanGiftLevel: number
$.<key>.upgradedSkills: array
$.<key>.xp: number
```

## heroStatsBonus_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.statsBonusIds: array
$.statsBonusIds[]: number
```

## heroStoryChapter_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.available: array
$.farmed: array
$.farmed[]: number
```

## heroUpgradeSkill

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.heroId: number
$.skill: number
```

Successful `result.response` fields:
```text
$: null
```

## heroWay_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## inventoryGet

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.border: object
$.border.<key>: number
$.coin: object
$.coin.<key>: number
$.consumable: object
$.consumable.<key>: number
$.fragmentArtifact: object
$.fragmentArtifact.<key>: number
$.fragmentGear: object
$.fragmentGear.<key>: number
$.fragmentHero: object
$.fragmentHero.<key>: number
$.fragmentScroll: object
$.fragmentScroll.<key>: number
$.fragmentSkin: object
$.fragmentSkin.<key>: number
$.fragmentTitan: object
$.fragmentTitan.<key>: number
$.gear: object
$.gear.<key>: number
$.patron: object
$.patron.<key>: number
$.scroll: object
$.scroll.<key>: number
```

## inventory_use

Occurrences: 7; response present without error: 7; RPC errors: 0; missing/unmatched response: 0. Sources: S05, S07, S09, S10.

Request `args` fields:
```text
$: object
$.amount: number
$.libId: number
$.params: object
$.params.choice: number
$.params.unitId: number
```

Successful `result.response` fields:
```text
$: array|object
$.consumable: object
$.consumable.<key>: number
$.heroXp: object
$.heroXp.<key>: number
$.titanXp: object
$.titanXp.<key>: number
$[]: object
$[].consumable: object
$[].fragmentGear: object
$[].gear: object
$[].scroll: object
```

## monthlyHero_getServerDatetimeData

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.monthNumber: number
$.nextMonthStartTS: number
```

## openLootboxChanced:lootbox

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S07.

Request `args` fields:
```text
$: object
$.amount: number
$.lootBoxId: number
$.reward: array
```

Successful `result.response` fields:
```text
$: object
$.reward: array
$.reward[]: object
```

## refillableGetAll:refillable

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.getAt: number
```

Successful `result.response` fields:
```text
$: object
$.refillables: array
$.refillables[]: object
```

## refillable_getAllUpgrades

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## rune_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.classRunes: array
$.heroesRunes: array
$.heroesRunes[]: object
```

## set_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].id: number
$[].level: number
```

## shopGetMany

Occurrences: 5; response present without error: 5; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S03, S10.

Request `args` fields:
```text
$: object
$.shopIds: array
$.shopIds[]: number
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.availableUntil: number
$.<key>.id: number
$.<key>.refreshTime: number
$.<key>.slots: object
```

## skin_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.currentSkin: number
$.<key>.currentSkinColorId: number
$.<key>.currentSkinRank: number
$.<key>.skins: array|object
$.<key>.skinsInfo: array
```

## skin_upgrade

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.skinId: number
$.unitId: number
```

Successful `result.response` fields:
```text
$: object
$.reward: array
```

## talisman_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## talisman_getLastRolledTraits

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.rollResults: array
```

## teamGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.adventure_battle: array
$.adventure_battle[]: number
$.arena: array
$.arena[]: number
$.boss_fight: array
$.boss_fight[]: number
$.brawl: array
$.brawl[]: number
$.champClanDefence_heroes: array
$.champClanDefence_heroes[]: array
$.champClanDefence_titans: array
$.champClanDefence_titans[]: number
$.clanDefence_heroes: array
$.clanDefence_heroes[]: number
$.clanDefence_titans: array
$.clanDefence_titans[]: number
$.clan_boss: array
$.clan_boss[]: array
$.clan_pvp_hero: array
$.clan_pvp_hero[]: number
$.clan_pvp_titan: array
$.clan_pvp_titan[]: number
$.dungeon_earth: array
$.dungeon_earth[]: number
$.dungeon_fire: array
$.dungeon_fire[]: number
$.dungeon_neutral: array
$.dungeon_neutral[]: number
$.dungeon_water: array
$.dungeon_water[]: number
$.global_clan_pvp_hero: array
$.global_clan_pvp_hero[]: number
$.grand: array
$.grand[]: array
$.magicTower: array
$.magicTower[]: number
$.mission: array
$.mission[]: number
```

## titanEvolve

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S06.

Request `args` fields:
```text
$: object
$.titanId: number
```

Successful `result.response` fields:
```text
$: object
$.consumable: object
$.consumable.<key>: number
```

## titanGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.artifacts: array
$.<key>.currentSkin: number
$.<key>.currentSkinRank: number
$.<key>.id: number
$.<key>.level: number
$.<key>.power: number
$.<key>.skills: object
$.<key>.skins: array|object
$.<key>.skinsInfo: array
$.<key>.star: number
$.<key>.xp: number
```

## titanGetSummoningCircle

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.starmoneySpent: number
```

## titan_artifactGetCounters

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.x10Opened: number
```

## upsaleHeroBundle_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```
