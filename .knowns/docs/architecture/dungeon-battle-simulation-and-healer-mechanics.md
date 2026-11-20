---
id: doc-7e0698c660e9ed62113bd9fd39867b6c
title: Dungeon battle simulation and healer mechanics
description: Verified dungeon battle simulation rules, major vs minor healer categorization, pre-battle HP/energy correlation, fatal damage handling, and separate saveProgress dispatch
createdAt: '2026-11-20T13:02:25.214Z'
updatedAt: '2026-11-20T13:04:14.018Z'
tags:
  - dungeon
  - simulation
  - healing
  - rpc
---

# Dungeon Battle Simulation and Healer Mechanics

Verified rules, contracts, and mechanics for Hero Wars Alliance Dungeon battle simulation, healer synergy, pre-battle state correlation, and checkpoint dispatch.

## Provenance and Sources
- Tasks: @task-VHE-M1Y8P7, @task-VHE-PQ14JB
- Real-game captures and error traces:
  - `temp/dungeon/hwa-game-record-202611201830_dungeon_errors.json`: Proves `dungeon_saveProgress` failure when batched together with `dungeonEndBattle` in a single HTTP POST.
  - `temp/dungeon/hwa-game-record-202611201909_dungeon_3.json`: Proves server validation failure (`Invalid battle`) when client reports a severely wounded frontline tank surviving with 3 stars instead of dying with 2 stars.
  - `temp/dungeon/hwa-dungeon-battle-history-20261120_2.json`: 60-battle dataset proving mortality thresholds, duration distribution (Stars 2 average 22.62s vs Stars 3 average 30.35s), and major vs minor healing values.

---

## 1. Checkpoint Dispatch Separation

### Problem
When the client dispatched `dungeonEndBattle` and `dungeonSaveProgress` concurrently or batched within the same RPC POST call (`calls: [{ name: 'dungeonEndBattle' }, { name: 'dungeonSaveProgress' }]`), the server rejected `dungeonSaveProgress`:
```json
{"error":{"name":"NotAvailable","description":"Complete battle first in /app/classes/RPCRequest.php (1325); rpc=`dungeon_saveProgress`"}}
```

### Protocol Rule
1. `dungeonEndBattle` must be dispatched and awaited first.
2. If `dungeonEndBattle` returns an error (e.g. `Invalid battle`), the sequence must halt immediately without dispatching `dungeonSaveProgress`.
3. Only after `dungeonEndBattle` succeeds may `dungeonSaveProgress` be called on floor checkpoints (`floorNumber % 10 === 0 && floorNumber > respawnFloor`).

---

## 2. Healer Classification & Synergy

In Hero Wars Alliance Dungeon battles, healing capability is strictly partitioned:

### Major Healers (`MAJOR_HEALING_TITAN_IDS = { 4003, 4004, 4042, 4043 }`)
- **Tydus (4004, Water Summoner):** When deployed with 5 Water Titans (Tydus's summoned *Child of Water* counts as the 5th Water Titan), his first cast of *Deep Current* heals **30% Max Health** to the entire team. In addition, the *Child of Water* steals enemy HP to heal allies.
- **Hyperion (4003, Water Supertitan):** *Compassion* heals the ally with the lowest current HP for massive amounts (+200k to +600k HP).
- **Iyari (4042, Light Support):** *Beacon of Light* heals the ally with lowest HP.
- **Solaris (4043, Light Supertitan):** *Solar Embrace* provides shielding and team heal.
- **Outcome Rule:** Teams containing at least one Major Healer can recover injured HP back toward 100% `maxHp`.

### Minor Healers (`MINOR_HEALING_TITAN_IDS = { 4022, 4024, 4052 }`)
- **Avalon (4022, Earth Support):** *Overgrowth* nature shield and minor team regeneration.
- **Verdoc (4024, Earth Summoner):** *Verdant Guard* summons nature spirits providing minor heals.
- **Orm (4052, Spirit Support):** *Echo of Spirit* minor recovery.
- **Outcome Rule:** Real-game captures prove minor healers restore a flat nature heal of only **~15,000 - 16,000 HP** (~1.5% - 2% of max HP). They cannot restore wounded titans back to full health.

### Non-Healer Teams (e.g. Pure Fire `{ 4010..4014 }`)
- Zero healing events across all captured battles.
- **Outcome Rule:** For teams without any healers, post-battle HP is strictly capped at pre-battle HP:
  $$\text{finalHp} \le \text{curHp}$$
  HP cannot increase without a healing titan.

---

## 3. Pre-Battle Correlation & Fatal Damage Handling

### Frontline Mortality Threshold
- In 60 captured battles, all 2-star victories occurred when the frontline tank (position 0) entered with **$\le 35\%$ HP** (or $< 400,000$ HP against ~40k enemy power) without a major healer.
- Enemy basic attacks focus heavily on position 0. When frontline HP is too low to survive the opening attack rounds, the tank inevitably dies.

### Payload Schema for Casualties
1. **Omission of Dead Titans:** When a titan dies in battle, it is **completely omitted** from the `attackers.heroes` dictionary in `dungeonEndBattle` progress:
   ```json
   "attackers": {
     "heroes": {
       "4021": { "isDead": false, "hp": 796742, "energy": 500 },
       "4022": { "isDead": false, "hp": 756236, "energy": 400 }
     },
     "input": []
   }
   ```
2. **Star Rating:**
   - 0 casualties: `stars = 3`
   - 1 casualty: `stars = 2`
   - 2 casualties: `stars = 1`
3. **Spillover Damage:** Excess fatal damage spills over to position 1 (the next living titan).
4. **Duration Adaptation:** Because the frontline fell and DPS was lost, battle duration is extended from the normal ~13s to **~22s - 26s** (observed 2-star average: 22.62s).
