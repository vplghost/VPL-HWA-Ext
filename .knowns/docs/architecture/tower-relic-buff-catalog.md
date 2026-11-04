---
id: doc-6c9a83ae040faa001d135754128201c9
title: Tower Relic Buff Catalog
description: Names and effects for all Tower relic buffs from the game English locale
createdAt: '2026-11-04T12:42:35.779Z'
updatedAt: '2026-11-04T12:43:15.678Z'
tags:
  - tower
  - buffs
---

# Tower relic buffs

Source: English game locale at https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0092/f11aa6e51569c59486b30f2d3a4415e4/locale/en.json.gz. Each row uses MAGIC_TOWER_BUFF_<ID>_NAME and MAGIC_TOWER_BUFF_<ID>_DESC. Color formatting tags are removed. These descriptions do not supply numerical effect values.

The notes in temp/tracking-data/tower-buffs.md identify 26 IDs. The locale identifies 14 more: 3, 5, 14, 15, 17, 26, 31, 32, 33, 34, 35, 39, 40, 45. IDs 19–24 have no MAGIC_TOWER_BUFF entries in this locale. They should not be assumed to be selectable relics.

Tower RPC buff IDs are the lookup key. The Tower popup displays the names and effects from generated extension/tower-buffs.js; unknown IDs fall back to Buff #ID. See @doc/architecture/tower-rpc-session-and-progress-model for the observed route and buff choices.

| ID | Name | Effect |
|---:|---|---|
| 1 | Exploding Morningstar | Deals damage to enemies each time an enemy dies |
| 2 | Razor Flurry | Turns every 5th attack into a Critical Hit |
| 3 | Hypno-Staff | Stuns enemies at the start of the battle |
| 4 | Deafening Resonance | Increases damage to stunned enemies |
| 5 | Shockstrike | Applies stun after every 4 attacks |
| 6 | Euphoria Crystal | Grants Energy at the start of the battle |
| 7 | Heart-Seeking Dagger | Increases damage from Critical Hits |
| 8 | Berserker Ring | Temporarily increases Physical Attack at the start of the battle |
| 9 | Sage Ring | Temporarily increases Magic Attack at the start of the battle |
| 10 | Everwood Buckler | Blocks the first 5 hits |
| 11 | Vampiric Charm | Grants additional Vampirism |
| 12 | Spelldance Boots | Increases Dodge based on Magic Defense |
| 13 | Executioner's Fervor | Increases Сritical Hit Chance based on Physical Attack |
| 14 | Bladehoner | Increases Armor Penetration over time |
| 15 | Arcane Drain | Lowers enemies' Magic Defense over time |
| 16 | Soulreaver | Grants temporary Vampirism after using the first skill |
| 17 | Siphoning Gauntlet | Restores Health when applying Control Effects |
| 18 | Hushing Scepter | Silences enemies periodically |
| 25 | Bottle of Vitality | Grants Energy to the leftmost Hero at the start of the battle |
| 26 | Evil Eye | Increases Physical damage |
| 27 | Arcane Pendant | Increases Magic damage |
| 28 | Piranha Knives Kit | Turns the first 2 attacks into Critical Hits |
| 29 | Deathsong | Makes all attacks of the rightmost Hero Critical Hits |
| 30 | Aggravating Duo | Increases Hero's Physical damage with each attack on enemies |
| 31 | The First Light | Blinds enemies affected by stun |
| 32 | Voidsong | Silences enemies that received a Critical Hit |
| 33 | Sorcerer's Wrath | Increases Magic damage with each skill used |
| 34 | Packleader's Helm | Increases Health |
| 35 | Bulwark of Vitality | Doubles Health of the rightmost Hero |
| 36 | Horns of Persistence | Blocks the next 3 enemy attacks after using the first skill |
| 37 | Restoration Circlet | Periodically heals the Hero with the lowest Health |
| 38 | Pain-charged Shoulderplate | Grants extra Energy upon receiving damage |
| 39 | Thunderbringer | Grants extra Energy with attacks on enemies |
| 40 | Necklace of Revenge | Increases Damage based on lost Health |
| 41 | Hermit's Ring | Solo Faction Heroes have higher Physical and Magic attack |
| 42 | Reflector | A part of Shielded or Blocked damage is reflected back to enemies |
| 43 | Defender's Glove | Heroes affected by an allied Buff can Block 1 hit |
| 44 | Arrows of Doom | Enemies can't Dodge |
| 45 | Magic Tamer | A part of Heroes' Magic damage is redirected to the furthest enemy |
| 46 | Wand of Despair | Burns a part of enemy team Energy on killing any Hero |
