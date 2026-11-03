---
id: doc-5e8425dc5b6bbedc140f08bbabb316ab
title: Tower RPC Session and Progress Model
description: Observed Tower route, choices, rewards, assets and cache representation
createdAt: '2026-11-03T05:51:31.632Z'
updatedAt: '2026-11-03T05:51:31.632Z'
tags:
  - tower
  - rpc
  - tracking
---

# Tower RPC session 2026-11-03

## Evidence and scope
Source: `temp/tracking-data/hwa-api-202611031237_tower_session.json` (203 network entries; 149 POSTs to `/api/rpc`). The Tower sequence runs 05:32:52–05:37:01 UTC. This is one observed run, not a universal game rule. The first recorded Tower call is `magicTower_enterRoom(number:1)`; initial `magicTower_getAll` and floor-1 room choices are absent.

## Observed process
1. Enter odd floor's battle room with `magicTower_enterRoom`, submit the five heroes with `magicTower_startBattle`, and receive result/reward/current room from `magicTower_endBattle`.
2. At odd floors 1–21, room 2 is a buff choice. `magicTower_activateBuff(id)` records the chosen buff, then `magicTower_enterNextFloor` returns the next even floor.
3. Each even floor 2–22 has one chest room. `magicTower_openChest(number)` identifies the opened chest and reveals a reward. `magicTower_enterNextFloor` returns the next odd floor and its room graph.
4. Floor 23 is `boss_battle`. The final `magicTower_endBattle` response contains `magicTower_completion` and `magicTower_briefInfo.state = win`; all five player heroes survived and `deadHeroesCount = 0`.

Team IDs 79, 72, 16, 70, 60 map through `extension/data-names.js` to Leonel, Byrna, Dante, Somna, Octavia. Final opponent ID 5267 maps to Jorge Boundless. The source has no localized Tower buff names, so buff IDs remain authoritative. CDN requests for buff icons are present, but their `.img` files do not provide names here.

## Route and choices
| Battle floor | Offered buff IDs at room 2 | Chosen buff | Next chest floor / number | Revealed chest reward |
|---|---|---:|---|---|
| 1 | not captured | 17 | 2 / 2 | 100,000 gold |
| 3 | 29, 28, 30 | 29 | 4 / 3 | 100,000 gold |
| 5 | 13, 16, 1 | 13 | 6 / 2 | 140 Tower coins |
| 7 | 7, 44, 2 | 7 | 8 / 1 | 100,000 gold |
| 9 | 36, 42, 34 | 34 | 10 / 2 | 4 Advisor fragments (gear 97) |
| 11 | 5, 18, 32 | 32 | 12 / 1 | 8 World Tremor recipe fragments (scroll 161) |
| 13 | 2, 28, 39 | 2 | 14 / 3 | 200,000 gold |
| 15 | 42, 38, 36 | 38 | 16 / 1 | 8 Flaming Heart fragments (gear 91) |
| 17 | 46, 31, 5 | 5 | 18 / 3 | 280 Tower coins |
| 19 | 35, 10, 12 | 10 | 20 / 1 | 280 Tower coins |
| 21 | 30, 16, 39 | 30 | 22 / 2 | 280 Tower coins |
| 23 | boss room, no buff | — | — | 38,200 gold, 300 Tower coins, 8 Giant-Slayer fragments (gear 92) |

Some odd floors expose extra battle and buff rooms 3/4. The recorded route always used room 1 battle and room 2 buff; alternate rooms are options, not completed steps.

Even-floor `rooms[1].openCosts` lists chest 1 as free and chests 2/3 as 70 Emeralds on floors 2–10 or 135 on floors 12–22. `rewards[]` gives a possible reward pool before opening; its array order is not proof that a given chest number contains that reward. The actual reward comes from `openChest.response.reward`. `rewardIndex` is a separate response field and should not be interpreted as the chosen chest number.

The completion summary reports total clears 30, streak 15, battle rewards 171,100 gold plus the boss's 300 Tower coins and 8 Giant-Slayer fragments, and chest rewards 500,000 gold, 980 Tower coins, 4 Advisor fragments, 8 Flaming Heart fragments, and 8 World Tremor recipe fragments. These are server-provided aggregate totals.

## UI and cache
`towerSession` in the passive RPC cache stores the current floor/room graph, selected team, compact action history, and completion payload. `towerStatus` still supplies the existing Goals cleared state. The Tower FAB sub button opens a read-only dialog; current choices come from the latest floor's room graph, and prior choices come from action history. A complete run shows completion and suppresses current choices. Missing initial snapshot means earlier opponent or buff options can remain unknown.
