# Titans, Teams, and Other Data Catalog

Source: `temp/tracking-data/hwa-game-record-202611211122.json`. This is a single-account snapshot extracted from RPC responses; display names are resolved using the bundled CDN locale; missing names retain the ID. Tokens, player names, chat, and mail are omitted.

## Titans

RPC `titanGetAll`; updated at `2026-11-21T04:12:34.291Z`.

| Titan ID | Name | Level | Star | Power | Current skin ID |
| ---: | --- | ---: | ---: | ---: | ---: |
| 4000 | Sigurd | 60 | 4 | 15,797 | 10,001 |
| 4001 | Nova | 50 | 5 | 12,816 | 10,002 |
| 4002 | Mairi | 50 | 5 | 12,578 | 10,003 |
| 4004 | Tydus | 55 | 3 | 7,341 | 10,044 |
| 4010 | Moloch | 60 | 3 | 11,200 | 10,005 |
| 4011 | Vulcan | 50 | 3 | 7,631 | 10,006 |
| 4012 | Ignis | 50 | 3 | 7,742 | 10,007 |
| 4013 | Araji | 60 | 3 | 10,987 | 10,008 |
| 4014 | Asherona | 50 | 3 | 5,923 | 10,043 |
| 4020 | Angus | 60 | 4 | 13,955 | 10,009 |
| 4021 | Sylva | 50 | 3 | 7,631 | 10,010 |
| 4022 | Avalon | 50 | 3 | 8,341 | 10,011 |
| 4023 | Eden | 60 | 3 | 11,005 | 10,012 |
| 4024 | Verdoc | 50 | 3 | 6,233 | 10,040 |
| 4030 | Brustar | 2 | 3 | 230 | 0 |
| 4031 | Keros | 1 | 3 | 227 | 0 |
| 4032 | Mort | 1 | 3 | 195 | 0 |
| 4034 | Umbra | 1 | 3 | 144 | 0 |
| 4040 | Rigel | 35 | 3 | 5,262 | 10,031 |
| 4041 | Amon | 1 | 3 | 225 | 0 |
| 4042 | Iyari | 31 | 3 | 4,446 | 10,018 |
| 4044 | Lumira | 1 | 3 | 145 | 0 |
| 4050 | Pallant | 60 | 3 | 10,435 | 10,062 |
| 4052 | Orm | 40 | 2 | 4,104 | 10,060 |
| 4053 | Metida | 60 | 5 | 19,750 | 10,064 |

## Teams

RPC `teamGetAll`; updated at `2026-11-21T04:12:34.291Z`. Each nested squad has its own row. Names resolved by ID from bundled locale; missing names shown as `#ID`.

| Mode | Team | Members | Hero/Titan names |
| --- | ---: | ---: | --- |
| `mission` | — | 5 | Leonel, Byrna, Dante, Iris, Octavia |
| `arena` | — | 5 | Leonel, Byrna, Dante, Iris, Octavia |
| `boss_fight` | — | 5 | Aurora, Galahad, Folio, Ginger, Thea |
| `magicTower` | — | 5 | Dante, Octavia, Leonel, Iris, Byrna |
| `clanDefence_heroes` | — | 5 | Leonel, Byrna, Dante, Iris, Octavia |
| `clanDefence_titans` | — | 5 | Sigurd, Nova, Tydus, Mairi, Metida |
| `dungeon_water` | — | 5 | Sigurd, Nova, Orm, Tydus, Mairi |
| `dungeon_neutral` | — | 5 | Sigurd, Nova, Tydus, Mairi, Metida |
| `adventure_battle` | — | 5 | Dante, Byrna, Leonel, Octavia, Iris |
| `dungeon_fire` | — | 5 | Moloch, Vulcan, Araji, Asherona, Ignis |
| `clan_boss` | 1 | 5 | Mushy and Shroom, Alvanor, Maya, Iris, Xe'Sha |
| `clan_boss` | 2 | 5 | Julius, Astaroth, Jhu, Mojo, Thea |
| `clan_boss` | 3 | 5 | Corvus, Leonel, Byrna, Dante, Octavia |
| `brawl` | — | 5 | Corvus, Dante, Morrigan, Iris, Octavia |
| `dungeon_earth` | — | 3 | Verdoc, Eden, Sylva |
| `grand` | 1 | 5 | Maya, Byrna, Alvanor, Leonel, Mushy and Shroom |
| `grand` | 2 | 5 | Dorian, Polaris, Somna, Xe'Sha, Electra von Grave |
| `grand` | 3 | 5 | Octavia, Iris, Morrigan, Dante, Corvus |
| `champClanDefence_heroes` | 1 | 5 | Leonel, Byrna, Dante, Iris, Octavia |
| `champClanDefence_heroes` | 2 | 5 | Astaroth, Galahad, Alvanor, Somna, Thea |
| `champClanDefence_heroes` | 3 | 5 | Electra von Grave, Maya, Xe'Sha, Polaris, Cornelius |
| `champClanDefence_titans` | — | 5 | Sigurd, Nova, Tydus, Mairi, Metida |
| `clan_pvp_hero` | — | 5 | Octavia, Iris, Dante, Byrna, Leonel |
| `clan_pvp_titan` | — | 5 | Metida, Mairi, Tydus, Nova, Sigurd |
| `global_clan_pvp_hero` | — | 5 | Leonel, Byrna, Dante, Iris, Octavia |
| `global_clan_pvp_titan` | — | 5 | Sigurd, Nova, Tydus, Mairi, Metida |

## Other Snapshots

| RPC | Group | Observed Data Shape | Updated UTC |
| --- | --- | --- | --- |
| `questGetAll` | Quests | array of 42 quests | 2026-11-21T04:20:15.000Z |
| `missionGetAll` | Missions | array of 221 missions | 2026-11-21T04:12:34.291Z |
| `shopGetMany` | Shop | 17 shops | 2026-11-21T04:19:21.340Z |
| `offerGetAll` | Offers | array of 78 offers | 2026-11-21T04:19:16.757Z |
| `artifact_getAll` | Artifacts | 94 entries | 2026-11-21T04:19:16.757Z |
| `skin_getAll` | Skins | 94 entries | 2026-11-21T04:19:16.757Z |
| `getInventory:inventory` | Inventory (other subsystem) | inventory | 2026-11-21T04:19:16.757Z |
| `clanBoss_getAll` | Clan boss | headsBestResults, heads, tries, superTries, endDay | 2026-11-21T04:19:16.757Z |
| `clanWarGetBriefInfo` | Clan war | nextWarTime, tries, hasActiveWar, nearestWarEndTime, arePointsMax | 2026-11-21T04:12:34.291Z |

## Data Collection & Update Methodology

1. The extension observes `POST https://api.hero-wars-alliance.com/api/rpc`, without sending its own RPC requests. Requests contain `calls[{name, feature?, args, ident}]`; responses contain `results[{ident, result.response}]`. Calls and results are matched by `ident`.
2. Only complete responses are captured (HTTP 200, readable and untruncated JSON body). Each method retains the latest snapshot by timestamp. Tables are point-in-time snapshots, not canonical dictionaries.
3. In the extension, cache auto-updates when the game issues matching RPCs. When empty, popup reloads once from saved session logs. The extension only updates cache from passive RPC events; no scheduled requests, polling, or page reloading.
4. To refresh docs, export JSON log and run `npm run docs:data -- <path-to-log.json>`. Only selected fields are documented; review tables before committing.

Limitation: log currently does not capture response body for GET endpoints like `api.aghanim.com/sdk/v1/items`.
