import { titanMetadata, titanArtifactEvolveCost, titanArtifactLevelCosts } from '../data/titanMetadata.ts';
import { heroMetadata } from '../data/heroMetadata.ts';
import { getItemName, getHeroName } from '../data/nameData.ts';
import {
  clanVersusRoundQuests,
  clanVersusChallengeNames,
  clanVersusChallengePoints,
  clanVersusChallengeSteps,
} from '../data/clanVersusData.ts';
import { questData } from '../data/questData.ts';

// enum_evolutionStar.json and enum_titanEvolutionStar.json from verified 1.293.0 (client 1.293.1010) splitlib asset.
// Each value is the cost to evolve TO that star, not the current star.
export const evolveFragmentCost: Record<number, number> = { 2: 20, 3: 50, 4: 100, 5: 150, 6: 300 };
export const evolveTitanFragmentCost: Record<number, number> = { 2: 50, 3: 150, 4: 500, 5: 900, 6: 1500 };

export function heroSoulProgress(id: number | string, hero: any, inventory: any): { owned: number | null; needed: number | 'Max' | null } {
  const fragments = inventory?.fragmentHero;
  const quantity = fragments && Object.hasOwn(fragments, id) ? fragments[id] : 0;
  const owned = fragments && Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
  const star = hero?.star;
  const needed = star === 6 ? 'Max' : (evolveFragmentCost[star + 1] ?? null);
  return { owned, needed };
}

export function titanSoulProgress(id: number | string, titan: any, inventory: any): { owned: number | null; needed: number | 'Max' | null } {
  const fragments = inventory?.fragmentTitan;
  const quantity = fragments && Object.hasOwn(fragments, id) ? fragments[id] : 0;
  const owned = fragments && Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
  const star = titan?.star;
  const needed = star === 6 ? 'Max' : (evolveTitanFragmentCost[star + 1] ?? null);
  return { owned, needed };
}

export function isSoulUpgradeReady(soulStringOrOwned: string | number | null | undefined, needed?: string | number | null | undefined): boolean {
  if (soulStringOrOwned == null) return false;
  if (typeof soulStringOrOwned === 'string' && soulStringOrOwned.includes('/')) {
    const [ownedStr, neededStr] = soulStringOrOwned.split('/').map((s) => s.trim().replaceAll(',', ''));
    const o = Number(ownedStr);
    const n = Number(neededStr);
    return Number.isFinite(o) && Number.isFinite(n) && o >= n;
  }
  if (needed == null) return false;
  const o = Number(soulStringOrOwned);
  const n = Number(needed);
  return Number.isFinite(o) && Number.isFinite(n) && o >= n;
}

export function countEvolvableHeroes(heroGetAllData: any, inventoryData: any): number {
  if (!heroGetAllData || typeof heroGetAllData !== 'object') return 0;
  let count = 0;
  for (const [idStr, hero] of Object.entries(heroGetAllData)) {
    const id = Number(idStr);
    const { owned, needed } = heroSoulProgress(id, hero, inventoryData);
    if (needed !== 'Max' && needed != null && isSoulUpgradeReady(owned, needed)) {
      count++;
    }
  }
  return count;
}

export function countEvolvableTitans(titanGetAllData: any, inventoryData: any): number {
  if (!titanGetAllData || typeof titanGetAllData !== 'object') return 0;
  let count = 0;
  for (const [idStr, titan] of Object.entries(titanGetAllData)) {
    const id = Number(idStr);
    const { owned, needed } = titanSoulProgress(id, titan, inventoryData);
    if (needed !== 'Max' && needed != null && isSoulUpgradeReady(owned, needed)) {
      count++;
    }
  }
  return count;
}

// IDs and names follow enum_heroColor.json from the game assets.
export const heroEquipmentRanks = [
  null, 'White', 'Green', 'Green+', 'Blue', 'Blue+', 'Blue++',
  'Purple', 'Purple+', 'Purple++', 'Purple+++',
  'Orange', 'Orange+', 'Orange++', 'Orange+++', 'Orange++++', 'Red'
];
export const heroEquipmentRankColors = [
  '#B7B0B3', '#74CE5B', '#719FFF', '#E46DFE', '#E58E04', '#FD6C6C'
];

export interface HeroEquipmentRankInfo {
  label: string;
  color: string;
  textShadow: string;
}

export function heroEquipmentRank(color: number | string): HeroEquipmentRankInfo | null {
  const rank = Number(color);
  if (!Number.isInteger(rank) || rank < 1 || rank >= heroEquipmentRanks.length) return null;
  const label = heroEquipmentRanks[rank];
  if (!label) return null;
  const tier = rank === 1 ? 0 : rank <= 3 ? 1 : rank <= 6 ? 2 :
    rank <= 10 ? 3 : rank <= 15 ? 4 : 5;
  const colorHex = heroEquipmentRankColors[tier];
  if (!colorHex) return null;
  const red = parseInt(colorHex.slice(1, 3), 16);
  const green = parseInt(colorHex.slice(3, 5), 16);
  const blue = parseInt(colorHex.slice(5, 7), 16);
  const glow = `rgba(${red}, ${green}, ${blue}, ${(0.14 + rank * 0.035).toFixed(3)})`;
  const radius = (2 + rank * 0.8).toFixed(1);
  return {
    label,
    color: colorHex,
    textShadow: `1px 0 1px rgba(15, 23, 42, 0.9), -1px 0 1px rgba(15, 23, 42, 0.9), 0 1px 1px rgba(15, 23, 42, 0.9), 0 -1px 1px rgba(15, 23, 42, 0.9), 0 0 ${radius}px ${glow}, 0 0 ${(Number(radius) * 1.8).toFixed(1)}px ${glow}`
  };
}

export function getUnreadChatCount(messages: any[], lastReadTime: number | string, referenceTimeSec: number | null = null): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  const refSec = Number(referenceTimeSec);
  const cutoffSec = Number.isFinite(refSec) && refSec > 0 ? refSec - (3 * 24 * 60 * 60) : 0;
  const active = cutoffSec > 0 ? messages.filter((m) => !m.ctime || Number(m.ctime) >= cutoffSec) : messages;
  const threshold = Number(lastReadTime) || 0;
  if (threshold <= 0) return active.length;
  return active.filter((m) => Number(m.ctime || 0) > threshold).length;
}

export function formatChatRole(role: string | number): { label: string; badgeClass: string } {
  const r = String(role ?? '');
  if (r === '255') return { label: 'Leader', badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' };
  if (r === '4') return { label: 'Officer', badgeClass: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300' };
  if (r === '3') return { label: 'Member', badgeClass: 'bg-slate-100 text-slate-700' };
  return { label: r ? `Role #${r}` : 'Member', badgeClass: 'bg-slate-100 text-slate-600' };
}

export function formatChatTime(ctimeSec: number | string): string {
  if (!Number.isFinite(Number(ctimeSec))) return '—';
  const d = new Date(Number(ctimeSec) * 1000);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

export function formatCountdown(finishTs: number, nowSec: number = Math.floor(Date.now() / 1000)): string {
  if (!Number.isFinite(finishTs)) return '—';
  const remaining = Math.max(0, finishTs - nowSec);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function draftStageDescription(stageId: number): string {
  if (stageId === 1) return 'Matching...';
  if (stageId === 2 || stageId === 3) return 'Defense Draft';
  if (stageId === 4) return 'Attack Draft';
  if (stageId === 5) return 'Ready for Battle';
  if (stageId === 6) return 'Battle in Progress';
  if (stageId === 7) return 'Match Completed';
  return 'Not in match';
}

export function isDraftActive(stageId: number): boolean {
  return Number.isInteger(stageId) && stageId >= 1 && stageId <= 6;
}

export function defaultDraftCandidates(mode = 'defense'): Array<Array<number | null>> {
  return Array.from({ length: 5 }, () => [null, null, null]);
}

export function observedDraftChoices(matchId: number | string): { defense: number[][]; attack: number[][]; enemyDefence: Array<Array<number | null>> } | null {
  const id = Number(matchId);
  if (id === 358789279) {
    return {
      defense: [
        [4, 500, 8], [62, 19, 55], [501, 52, 25],
        [70, 22, 10], [12, 26, 67]
      ],
      attack: [
        [11, 1, 5], [24, 502, 70], [56, 33, 45],
        [57, 62, 23], [3, 50, 73]
      ],
      enemyDefence: [
        [null, 69, null], [10, null, null], [null, null, 53],
        [75, null, null], [null, null, 71]
      ]
    };
  }
  if (id === 360504765) {
    return {
      defense: [
        [11, 2, 6],
        [75, 54, 25],
        [71, 77, 18],
        [66, 67, 36],
        [16, 1, 78]
      ],
      attack: [
        [55, 14, 62],
        [61, 36, 16],
        [5, 501, 37],
        [15, 503, 64],
        [72, 8, 45]
      ],
      enemyDefence: [
        [null, null, null],
        [null, null, null],
        [null, null, null],
        [null, null, null],
        [null, null, null]
      ]
    };
  }
  return null;
}

export function validateDraftPicks(picks: any[]): { valid: boolean; count: number; missingSteps: number[]; heroes: number[] } {
  if (!Array.isArray(picks)) {
    return { valid: false, count: 0, missingSteps: [1, 2, 3, 4, 5], heroes: [] };
  }
  const missingSteps: number[] = [];
  const heroes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const h = picks[i];
    if (Number.isInteger(h) && h > 0) {
      heroes.push(h);
    } else {
      missingSteps.push(i + 1);
    }
  }
  return {
    valid: heroes.length === 5 && missingSteps.length === 0,
    count: heroes.length,
    missingSteps,
    heroes
  };
}

export function getDraftActiveStep(picks: any[]): number {
  if (!Array.isArray(picks)) return 0;
  for (let i = 0; i < 5; i++) {
    if (!Number.isInteger(picks[i]) || picks[i] <= 0) return i;
  }
  return 4;
}

export const questLocaleMap: Record<string, { key: string; title: string; category: string; unit: string; amount: number }> = {
  QUEST_TAB_NAME_SKINSTONES_SPEND: { key: 'res:hero_skin_stones', title: 'Spend Hero Skin Stones', category: 'Resources', unit: 'stones', amount: 100 },
  QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND: { key: 'res:titan_skin_stones', title: 'Spend Titan Skin Stones', category: 'Resources', unit: 'stones', amount: 15 },
  LIB_PSEUDO_STAMINA: { key: 'res:energy', title: 'Spend Energy', category: 'Resources', unit: 'energy', amount: 100 },
  LIB_PSEUDO_STARMONEY: { key: 'res:emerald_spend', title: 'Spend Emeralds', category: 'Resources', unit: 'emeralds', amount: 100 },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_SPEEDUP: { key: 'res:training_speedups', title: 'Use Training Speedups', category: 'Resources', unit: 'speedups', amount: 1 },
  RECOMMENDATION_RUNES_NEW: { key: 'res:rune_stones', title: 'Upgrade Runes', category: 'Resources', unit: 'runes', amount: 1 },
  QUEST_TAB_NAME_TOWER_CHESTS: { key: 'act:tower', title: 'Open 1 Tower Chest', category: 'Activities', unit: 'chests', amount: 1 },
  UI_FEATURE_HUB_ARENA_TITLE: { key: 'act:arena', title: 'Fight 1 Arena Battle', category: 'Activities', unit: 'battles', amount: 1 },
  STRATEGIC_GLOBAL_MAP_RALLY_POPUP_TITLE: { key: 'act:map_boss', title: 'Defeat 1 Map Boss / Rally', category: 'Activities', unit: 'bosses', amount: 1 },
  QUEST_TAB_NAME_GET_VIP: { key: 'act:vip_points', title: 'Obtain 1 VIP Point', category: 'Activities', unit: 'points', amount: 1 },
  QUEST_TAB_NAME_LOGIN: { key: 'act:login', title: 'Daily Sign In', category: 'Activities', unit: 'days', amount: 1 },
  UI_DIALOG_HERO_ARTIFACTS_ARTIFACT_EVOLUTION: { key: 'act:artifact_evolution', title: 'Evolve Hero Artifacts', category: 'Activities', unit: 'evolutions', amount: 1 },
  QUEST_TAB_NAME_ARTLEVEL: { key: 'act:artifact_level', title: 'Level Up Artifacts', category: 'Activities', unit: 'levels', amount: 1 },
  QUEST_TAB_NAME_HERO_RANK: { key: 'act:hero_rank', title: 'Promote Hero Rank', category: 'Activities', unit: 'ranks', amount: 1 },
  QUEST_TAB_HERO_LEVEL: { key: 'act:hero_level', title: 'Level Up Heroes', category: 'Activities', unit: 'levels', amount: 1 },
  UI_CLANBOSS_MENU_ALTAR: { key: 'act:clan_altar', title: 'Pray at Clan Altar', category: 'Activities', unit: 'prayers', amount: 1 },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_LOSEUNITS: { key: 'act:pvp_clash', title: 'PvP Unit Battles', category: 'Activities', unit: 'units', amount: 1 },
  LIB_TEST_BP_DAILY_QUESTS: { key: 'act:battle_pass_daily', title: 'Battle Pass Daily Quests', category: 'Activities', unit: 'quests', amount: 1 },
  LIB_TEST_BP_SINGLE_QUESTS: { key: 'act:battle_pass_milestone', title: 'Battle Pass Milestones', category: 'Activities', unit: 'milestones', amount: 1 },
  LIB_SEASONAL_EVENT_NAME_FACTION_1: { key: 'act:seasonal_faction_1', title: 'Faction Quests: Honor', category: 'Activities', unit: 'quests', amount: 1 },
  LIB_SEASONAL_EVENT_NAME_FACTION_2: { key: 'act:seasonal_faction_2', title: 'Faction Quests: Mastery', category: 'Activities', unit: 'quests', amount: 1 },
  STRATEGIC_BASE_INTERFACE_BUTTON_SPEEDUPS: { key: 'res:city_speedups', title: 'Use Speedups in City', category: 'Resources', unit: 'speedups', amount: 1 },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_TROOPS: { key: 'act:train_troops', title: 'Train Troops in Barracks', category: 'Activities', unit: 'troops', amount: 100 },
  STRATEGIC_RESOURCE_12_NAME: { key: 'res:iron_gather', title: 'Gather Iron / Ore on Map', category: 'Resources', unit: 'iron', amount: 1000 },
  LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_PVPKILLUNITS: { key: 'act:pvp_kills', title: 'Defeat Enemy Units in PvP', category: 'Activities', unit: 'units', amount: 50 },
  UI_DIALOG_BOSS_TITLE: { key: 'act:world_boss', title: 'Defeat World Map Bosses', category: 'Activities', unit: 'bosses', amount: 1 },
  UI_HEROIC_CHEST_MAIN_TITLE: { key: 'act:heroic_chest', title: 'Open Heroic Chests', category: 'Activities', unit: 'chests', amount: 1 },
  QUEST_TAB_NAME_SPEND_ARTCOINS: { key: 'res:artifact_coins', title: 'Spend Artifact Coins', category: 'Resources', unit: 'coins', amount: 100 },
  LIB_AGGREGATOR_BUTTON_LADDER_HERO_RELIC: { key: 'act:hero_relics', title: 'Upgrade Hero Relics', category: 'Activities', unit: 'relics', amount: 1 },
  QUEST_TAB_NAME_SPEND_RUNE_SPHERES: { key: 'res:rune_spheres', title: 'Spend Rune Spheres', category: 'Resources', unit: 'spheres', amount: 1 },
};

export function getHeroArtifactTier(level: number | string): number {
  const lvl = Number(level) || 0;
  if (lvl <= 25) return 1;
  if (lvl <= 50) return 2;
  if (lvl <= 70) return 3;
  if (lvl <= 85) return 4;
  return 5;
}

export function getHeroArtifactTierStyle(level: number | string): { tier: number; badge: string; color: string; starColor: string } {
  const tier = getHeroArtifactTier(level);
  switch (tier) {
    case 1:
      return {
        tier,
        badge: 'bg-slate-700/80 text-slate-300 ring-1 ring-slate-600/60',
        color: 'text-slate-300',
        starColor: 'text-slate-400'
      };
    case 2:
      return {
        tier,
        badge: 'bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-500/40',
        color: 'text-emerald-300',
        starColor: 'text-green-500'
      };
    case 3:
      return {
        tier,
        badge: 'bg-sky-950/60 text-sky-300 ring-1 ring-sky-500/40',
        color: 'text-sky-300',
        starColor: 'text-blue-500'
      };
    case 4:
      return {
        tier,
        badge: 'bg-purple-950/60 text-purple-300 ring-1 ring-purple-500/40',
        color: 'text-purple-300',
        starColor: 'text-violet-500'
      };
    case 5:
    default:
      return {
        tier,
        badge: 'bg-amber-950/60 text-amber-300 ring-1 ring-amber-500/40',
        color: 'text-amber-300',
        starColor: 'text-orange-400'
      };
  }
}

export function isTitanArtifactUpgradable(titanId: number | string, slotIndex: number, titan: any, cache: any): boolean {
  if (!titan) return false;
  const meta = (titanMetadata as any)?.[titanId];
  const artifactId = meta?.artifacts?.[slotIndex];
  const art = titan.artifacts?.[slotIndex];
  if (!art) return false;

  const currentLevel = Number(art.level) || 1;
  const currentStar = Number(art.star) || 0;
  const titanLevel = Number(titan.level) || 120;

  let canLevelUp = false;
  if (currentLevel < 120 && currentLevel < titanLevel) {
    const nextLevel = currentLevel + 1;
    const cost = titanArtifactLevelCosts[nextLevel];
    if (cost) {
      const [dustNeeded, goldNeeded] = cost;
      const fairyDust = Number(cache?.inventoryGet?.data?.coin?.['18'] ?? 0);
      const userGold = Number(
        cache?.['resource:gold']?.value ??
        cache?.userGetInfo?.data?.gold ??
        cache?.inventoryGet?.data?.coin?.['1'] ??
        Infinity
      );
      if (fairyDust >= dustNeeded && userGold >= goldNeeded) {
        canLevelUp = true;
      }
    }
  }

  let canEvolveStar = false;
  if (currentStar < 6 && artifactId) {
    const nextStar = Math.max(1, currentStar + 1);
    const fragmentsNeeded = (titanArtifactEvolveCost as any)?.[nextStar] ?? Infinity;
    const fragmentsOwned = Number(cache?.inventoryGet?.data?.fragmentArtifact?.[String(artifactId)] ?? 0);
    if (fragmentsOwned >= fragmentsNeeded) {
      canEvolveStar = true;
    }
  }

  return canLevelUp || canEvolveStar;
}

export function getChallengeResourceStock(cache: any, target: string | number): number | null {
  if (!cache) return null;
  const invData = cache.inventoryGet?.data;
  const coins = invData?.coin;
  const consumables = invData?.consumable;
  const fragments = invData?.fragmentHero || {};
  const tStr = String(target || '').toLowerCase().trim();
  const tId = Number.parseInt(String(target), 10);

  const getCoin = (id: string) => {
    if (coins && typeof coins === 'object') {
      const val = coins[id];
      return val != null ? (Number(val) || 0) : 0;
    }
    return cache[`resource:coin:${id}`]?.data?.amount ?? 0;
  };

  const getConsumable = (id: string) => {
    if (consumables && typeof consumables === 'object') {
      const val = consumables[id];
      return val != null ? (Number(val) || 0) : 0;
    }
    return cache[`resource:consumable:${id}`]?.data?.amount ?? 0;
  };

  if (tId === 37 || tStr.includes('hero skin stone')) return getCoin('8') + getCoin('9') + getCoin('10');
  if (tId === 54 || tStr.includes('titan skin stone')) return getCoin('20');
  if (tId === 40 || tStr.includes('titan potion')) return getConsumable('20');
  if (tId === 29 || tStr.includes('elemental sphere')) return getConsumable('46');
  if (tId === 28 || tStr.includes('summon 1 titan') || tStr.includes('summoning sphere') || (tStr.includes('titan') && tStr.includes('circle'))) return getCoin('13');
  if (tId === 55 || tStr.includes('relic shard')) {
    const c = getCoin('40065');
    if (c > 0) return c;
    const con = getConsumable('24');
    if (con > 0) return con;
    return c || con;
  }
  if (tId === 57 || tStr.includes('chaos core')) return getConsumable('44');
  if (tId === 38 || tStr.includes('artifact chest')) return getConsumable('45');
  if (tId === 34 || tStr.includes('heroic chest')) return getConsumable('5');
  if (tId === 50 || tStr.includes('rune sphere')) return getCoin('40078');
  if (tId === 51 || tStr.includes('rune stone')) return getCoin('40077') || getCoin('1051');
  if (tId === 56 || tStr.includes('mastery crystal')) return getCoin('40067');
  if (tId === 49 || (tStr.includes('spend') && tStr.includes('energy'))) {
    return cache['resource:energy']?.data?.amount ?? cache.energyStatus?.data?.energy ?? 0;
  }
  if (tId === 47 || tStr.includes('hero soul stone')) {
    return Object.values(fragments).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
  }
  if (tId === 16 || tStr.includes('skill book')) return getConsumable('16');
  if (tId === 92 || tStr.includes('honor mark')) return cache['resource:material:12']?.data?.amount ?? 0;
  if (tId === 114 || tStr.includes('outland chest')) return getCoin('2');
  if (tStr.includes('emerald') || tStr.includes('starmoney')) {
    return cache['resource:starMoney']?.data?.amount ?? cache.userGetInfo?.data?.user?.starMoney ?? null;
  }
  return null;
}

export function normalizeGoalKey(target: any): string {
  const s = String(target || '').toLowerCase();
  if (s.includes('titan skin stone')) return 'res:titan_skin_stones';
  if (s.includes('hero skin stone')) return 'res:hero_skin_stones';
  if (s.includes('titan potion')) return 'res:titan_potions';
  if (s.includes('elemental sphere')) return 'res:elemental_spheres';
  if (s.includes('summoning sphere')) return 'res:summon_titan';
  if (s.includes('summon') || s.includes('circle')) return 'res:summon_titan';
  if (s.includes('relic shard')) return 'res:relic_shards';
  if (s.includes('chaos core')) return 'res:chaos_cores';
  if (s.includes('artifact chest')) return 'res:artifact_chests';
  if (s.includes('heroic chest')) return 'res:heroic_chests';
  if (s.includes('rune sphere')) return 'res:rune_spheres';
  if (s.includes('rune stone')) return 'res:rune_stones';
  if (s.includes('mastery crystal')) return 'res:mastery_crystals';
  if ((s.includes('spend') && s.includes('energy')) || s.includes('pseudo_stamina')) return 'res:energy';
  if (s.includes('emerald') || s.includes('starmoney')) return 'res:emerald_spend';
  if (s.includes('hero soul stone')) return 'res:hero_soul_stones';
  if (s.includes('skill book')) return 'res:skill_books';
  if (s.includes('honor mark')) return 'res:honor_marks';
  if (s.includes('outland chest')) return 'res:outland_chests';
  if (s.includes('building speedup')) return 'res:building_speedups';
  if (s.includes('research speedup')) return 'res:research_speedups';
  if (s.includes('training speedup') || s.includes('train_speedup')) return 'res:training_speedups';
  if (s.includes('healing speedup')) return 'res:healing_speedups';

  // Activities
  if (s.includes('tower')) return 'act:tower';
  if (s.includes('bandit camp')) return 'act:bandit_camp';
  if (s.includes('boss') || s.includes('rally')) return 'act:map_boss';
  if (s.includes('monster')) return 'act:map_monster';
  if (s.includes('expedition')) return 'act:expedition';
  if (s.includes('daily quest') || s.includes('claim completed')) return 'act:daily_quest';
  if (s.includes('grand arena')) return 'act:grand_arena';
  if (s.includes('arena')) return 'act:arena';
  if (s.includes('login') || s.includes('sign in')) return 'act:login';
  if (s.includes('vip')) return 'act:vip_points';
  if (s.includes('artlevel') || s.includes('artifact level')) return 'act:artifact_level';
  if (s.includes('artifact evolution') || s.includes('artifact_evolution')) return 'act:artifact_evolution';
  if (s.includes('hero rank') || s.includes('hero_rank')) return 'act:hero_rank';
  if (s.includes('hero level') || s.includes('hero_level')) return 'act:hero_level';
  if (s.includes('altar')) return 'act:clan_altar';
  if (s.includes('battle pass') || s.includes('bp_daily')) return 'act:battle_pass_daily';
  if (s.includes('gather') || s.includes('food') || s.includes('wood') || s.includes('stone') || s.includes('iron')) return 'act:gathering';
  if (s.includes('titan power')) return 'act:titan_power';
  if (s.includes('hero power')) return 'act:hero_power';
  if (s.includes('building power')) return 'act:building_power';
  if (s.includes('research power')) return 'act:research_power';
  if (s.includes('train') && s.includes('troop')) return 'act:train_troops';
  if (s.includes('unit in pvp') || s.includes('loseunits') || s.includes('pvp unit')) return 'act:pvp_clash';
  if (s.includes('equip') && s.includes('item')) return 'act:equip_items';
  if (s.includes('dungeon')) return 'act:dungeon';
  if (s.includes('guild war')) return 'act:guild_war';

  return `misc:${s.replace(/[^a-z0-9]+/g, '_')}`;
}

export const goalIconMap: Record<string, string> = {
  'res:titan_skin_stones': '💎',
  'res:hero_skin_stones': '💎',
  'res:titan_potions': '🧪',
  'res:elemental_spheres': '🔮',
  'res:summon_titan': '🌀',
  'res:relic_shards': '💠',
  'res:chaos_cores': '⚡',
  'res:artifact_chests': '🗝️',
  'res:heroic_chests': '📦',
  'res:rune_spheres': '🟣',
  'res:rune_stones': '🪨',
  'res:mastery_crystals': '🔶',
  'res:energy': '⚡',
  'res:emerald_spend': '💎',
  'res:hero_soul_stones': '✨',
  'res:skill_books': '📖',
  'res:honor_marks': '🎖️',
  'res:outland_chests': '🎁',
  'res:building_speedups': '⏩',
  'res:research_speedups': '⏩',
  'res:training_speedups': '⏩',
  'res:healing_speedups': '⏩',
  'act:tower': '🗼',
  'act:bandit_camp': '⛺',
  'act:map_boss': '👹',
  'act:map_monster': '👾',
  'act:expedition': '⛵',
  'act:daily_quest': '📜',
  'act:arena': '⚔️',
  'act:grand_arena': '🛡️',
  'act:gathering': '🌾',
  'act:titan_power': '💪',
  'act:hero_power': '⭐',
  'act:building_power': '🏛️',
  'act:research_power': '🔬',
  'act:train_troops': '🛡️',
  'act:pvp_clash': '⚔️',
  'act:equip_items': '🗡️',
  'act:dungeon': '🏰',
  'act:guild_war': '🏆',
  'act:login': '📅',
  'act:vip_points': '⭐',
  'act:artifact_level': '⚔️',
  'act:artifact_evolution': '🌟',
  'act:hero_rank': '🎖️',
  'act:hero_level': '📈',
  'act:clan_altar': '🙏',
  'act:battle_pass_daily': '🎟️',
  'act:battle_pass_milestone': '🏅',
  'act:seasonal_faction_1': '🛡️',
  'act:seasonal_faction_2': '⚔️',
  'act:claim_completed_quests': '🎁',
};

export const dailyLimitedKeys = new Set([
  'act:tower',
  'act:expedition',
  'act:daily_quest',
  'act:arena',
  'act:grand_arena',
  'act:guild_war',
  'act:dungeon',
  'act:login',
  'act:claim_completed_quests',
  'act:clan_altar',
]);

export const knownEventNames: Record<string | number, string> = {
  100273: 'Demon Skin Festival',
  100292: 'Soleil Upgrade Event',
  100309: 'Battle Pass Daily',
  100344: 'Titan & Combat Event',
  100347: 'Hero Advancement Festival',
  100351: 'Faction Clash',
  100353: 'Battle Pass Daily',
  100356: 'Battle Pass Season',
  90249: 'Soleil Upgrade Event',
  97682: 'Demon Skin Festival',
  ADVENTURE_HERO62_TITLE_EVENT_UPGRADE: 'Soleil Upgrade Event',
  DAEMONSKIN22_UI_TITLE: 'Demon Skin Festival',
};

export function isTowerCleared(cache: any): boolean {
  if (cache?.towerStatus?.data?.isCleared) return true;
  if (cache?.towerStatus?.data?.state === 'win' || cache?.towerStatus?.data?.state === 'completed') return true;
  if (cache?.magicTower_briefInfo?.data?.state === 'win') return true;
  if (cache?.['magicTower_briefInfo']?.data?.state === 'win') return true;
  if (cache?.['magicTower_briefInfo']?.state === 'win') return true;
  if (cache?.towerSession?.data?.completed) return true;
  return false;
}

export function extractEventGoals(cache: any, now = Date.now()): {
  all: any[];
  activities: any[];
  resources: any[];
  metrics: { totalGoals: number; synergiesCount: number; readyCount: number };
} {
  const goalsMap = new Map<string, any>();
  const towerCleared = isTowerCleared(cache);

  const challengeNames = clanVersusChallengeNames || {};
  const challengePoints = clanVersusChallengePoints || {};
  const challengeSteps = clanVersusChallengeSteps || {};
  const roundQuestsMap = clanVersusRoundQuests || {};

  function addOrMergeGoal({ key, title, category, eventName, amount = 1, unit = '', points = 0, stock = null, hint = '' }: any) {
    const isTowerChest = key === 'act:tower' ||
      (typeof key === 'string' && key.startsWith('act:daily_quest_') && (
        [10019, 10082, 10083, 10084, 10085, 10107].includes(Number(key.replace('act:daily_quest_', ''))) ||
        (typeof title === 'string' && /tower/i.test(title) && /chest/i.test(title))
      )) ||
      (typeof title === 'string' && /tower/i.test(title) && /chest/i.test(title));

    const isUnavailable = isTowerChest && towerCleared;
    const finalHint = (isTowerChest && towerCleared)
      ? 'Tower cleared today • No more chests available until daily reset'
      : hint;
    const isLimited = (isTowerChest && towerCleared) ? false :
      dailyLimitedKeys.has(key) || key.startsWith('act:daily_quest_');

    if (!goalsMap.has(key)) {
      const icon = goalIconMap[key] || (category === 'Resources' ? '💎' : '🎯');
      goalsMap.set(key, {
        key,
        title,
        icon,
        category,
        needed: amount,
        unit,
        stock,
        inStock: stock != null ? stock >= amount : null,
        isLimited,
        isUnavailable,
        totalPoints: points,
        overlapCount: 1,
        events: [{ name: eventName, amount, points, unit }],
        hint: finalHint
      });
    } else {
      const existing = goalsMap.get(key);
      existing.overlapCount += 1;
      existing.totalPoints += points;
      if (amount > existing.needed) existing.needed = amount;
      if (existing.stock != null && existing.needed != null) {
        existing.inStock = existing.stock >= existing.needed;
      }
      if (isTowerChest && towerCleared) {
        existing.isLimited = false;
        existing.isUnavailable = true;
        existing.hint = finalHint;
      }
      existing.events.push({ name: eventName, amount, points, unit });
    }
  }

  // 1. Guild Versus
  const vsStatus = cache?.clanVersusStatus?.data;
  if (vsStatus) {
    const battle = vsStatus.battle || {};
    const info = vsStatus.info || {};
    const rounds = Array.isArray(battle.rounds)
      ? battle.rounds
      : (battle.rounds && typeof battle.rounds === 'object' ? Object.values(battle.rounds) : []);
    const liveRound: any = rounds.find((r: any) => r && r.status === 'inProgress') || rounds[0] || { index: 1 };
    const roundConfig: any = (roundQuestsMap as any)[liveRound.index] || (roundQuestsMap as any)[1] || {};
    const roundName = `Guild Versus Round ${liveRound.index}`;

    const rawChallenges = Array.isArray(info.challenges)
      ? info.challenges
      : (info.challenges && typeof info.challenges === 'object' ? Object.values(info.challenges) : []);
    const activeChallenges = rawChallenges.length > 0 ? rawChallenges : null;

    if (activeChallenges) {
      for (const ch of activeChallenges) {
        const name = challengeNames[ch.id] || `Daily Challenge #${ch.id}`;
        const stock = getChallengeResourceStock(cache, ch.id);
        const isRes = stock !== null;
        const key = normalizeGoalKey(name);
        const step = challengeSteps[ch.id] || 1;
        const points = challengePoints[ch.id] || 0;

        addOrMergeGoal({
          key,
          title: name.replace(/\s*\(\d+[\d,]*\)$/, ''),
          category: isRes ? 'Resources' : 'Activities',
          eventName: roundName,
          amount: step,
          points,
          stock,
          hint: `Guild Versus challenge for ${roundName}`
        });
      }
    } else if (Array.isArray(roundConfig.quests)) {
      for (const q of roundConfig.quests) {
        const stock = getChallengeResourceStock(cache, q.label);
        const isRes = stock !== null;
        const key = normalizeGoalKey(q.label);
        const matchNum = q.label.match(/\b(\d+[\d,]*)\b/);
        const amount = matchNum ? Number.parseInt(matchNum[1].replace(/,/g, ''), 10) : 1;

        addOrMergeGoal({
          key,
          title: q.label.replace(/\s*\(\d+[\d,]*\)$/, ''),
          category: isRes ? 'Resources' : 'Activities',
          eventName: roundName,
          amount,
          points: q.points || 0,
          stock,
          hint: `Guild Versus quest for ${roundName}`
        });
      }
    }
  }

  // 2. Titan Dungeon
  const dungeon = cache?.dungeonStatus?.data;
  if (dungeon && (dungeon.floorNumber || dungeon.maxFloorPassed)) {
    const floor = dungeon.floorNumber || (dungeon.maxFloorPassed + 1);
    addOrMergeGoal({
      key: 'act:dungeon',
      title: 'Titan Dungeon Exploration',
      category: 'Activities',
      eventName: 'Titan Dungeon',
      amount: 1,
      unit: 'floor',
      points: 0,
      stock: null,
      hint: `Floor ${floor} • Prime element: ${dungeon.elements?.prime ? dungeon.elements.prime.charAt(0).toUpperCase() + dungeon.elements.prime.slice(1) : 'Earth'}`
    });
  }

  // 3. Guild War Championship
  const gwStatus = cache?.clanWarChampStatus?.data;
  if (gwStatus) {
    const tries = gwStatus.tries ?? 2;
    addOrMergeGoal({
      key: 'act:guild_war',
      title: 'Guild War Championship Attacks',
      category: 'Activities',
      eventName: 'Guild War',
      amount: tries > 0 ? tries : 1,
      unit: 'attack',
      points: 0,
      stock: null,
      hint: `${tries} war attacks remaining today`
    });
  }

  // 4. Special Quest Events
  const qData = questData;
  const questEvents = qData?.visibleMetadata?.(cache, now);
  if (Array.isArray(questEvents)) {
    for (const qe of questEvents) {
      const title = knownEventNames[qe.name_localeKey] || knownEventNames[qe.id] || qe.name_localeKey?.replace(/_/g, ' ') || `Special Event #${qe.id}`;
      const hasDetailedGroups = Array.isArray(cache?.specialQuestStatus?.data?.events)
        && cache.specialQuestStatus.data.events.some((e: any) => e.id === qe.id && Array.isArray(e.groups) && e.groups.length > 0);
      if (hasDetailedGroups) continue;

      addOrMergeGoal({
        key: `act:special_event_${qe.id}`,
        title: `Special Quest: ${title}`,
        category: 'Activities',
        eventName: title,
        amount: 1,
        unit: 'quest',
        points: 0,
        stock: null,
        hint: 'Active special event quests and milestones'
      });
    }
  }

  // 5. Special Quest Status
  const specialEvents = qData?.visibleEvents?.(cache, now);
  if (Array.isArray(specialEvents)) {
    for (const ev of specialEvents) {
      const evTitle = qData.title(ev);
      for (const group of ev.groups || []) {
        if (group.hide) continue;
        const questsList = Array.isArray(group.quests) ? group.quests : [];
        const activeQ = questsList.find((q: any) => q.state === 'inProgress');
        const completedCount = questsList.filter((q: any) => q.state === 'completed').length;
        if (!activeQ) continue;

        const mapping = group.localeKey ? questLocaleMap[group.localeKey] : undefined;
        const repeatLabel = group.repeatType === 'daily' ? 'Daily' : 'Chain';
        const subEventName = `${evTitle} (${repeatLabel})`;

        if (mapping) {
          const stock = mapping.category === 'Resources'
            ? getChallengeResourceStock(cache, mapping.title)
            : null;
          const progress = activeQ?.progress || 0;
          const hint = activeQ
            ? `Tier progress: ${progress.toLocaleString()} (${completedCount}/${questsList.length} completed)`
            : `${completedCount}/${questsList.length} completed`;

          addOrMergeGoal({
            key: mapping.key,
            title: mapping.title,
            category: mapping.category,
            eventName: subEventName,
            amount: mapping.amount || 1,
            unit: mapping.unit || '',
            points: 0,
            stock,
            hint: `${hint} · Ends ${new Date(ev.end).toLocaleString()}`
          });
        } else if (group.localeKey) {
          const humanTitle = group.localeKey
            .replace(/^(LIB_SPECIAL_QUEST_EVENT_|LIB_SEASONAL_EVENT_NAME_|QUEST_TAB_|UI_)/, '')
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          const key = normalizeGoalKey(group.localeKey);
          addOrMergeGoal({
            key,
            title: humanTitle,
            category: 'Activities',
            eventName: subEventName,
            amount: 1,
            unit: 'tier',
            points: 0,
            stock: null,
            hint: `${activeQ ? `In progress (${completedCount}/${questsList.length})` :
              `${completedCount} completed`} · Ends ${new Date(ev.end).toLocaleString()}`
          });
        }
      }
    }
  }

  for (const quest of qData?.dailyQuests?.(cache, now) || []) {
    if ((quest as any).state !== 'inProgress' && (quest as any).state !== 1) continue;
    const resetAt = qData?.nextReset?.(cache, now);
    addOrMergeGoal({
      key: `act:daily_quest_${quest.id}`,
      title: qData?.dailyTitle ? qData.dailyTitle(quest) : `Daily Quest #${quest.id}`,
      category: 'Activities',
      eventName: 'Daily Quests',
      amount: 1,
      unit: 'quest',
      hint: `Progress: ${quest.progress ?? 0} · ${resetAt ? `Resets at ${new Date(resetAt).toLocaleString()}` : 'Resets daily'}`
    });
  }

  // 6. Game Quests (questGetAll)
  const allQuests = Array.isArray(cache?.questGetAll?.data)
    ? cache.questGetAll.data
    : (Array.isArray(cache?.questGetAll) ? cache.questGetAll : []);
  const readyQuests = allQuests.filter((q: any) => q.state === 2);
  if (readyQuests.length > 0) {
    addOrMergeGoal({
      key: 'act:claim_completed_quests',
      title: `Claim Completed Quests (${readyQuests.length} ready)`,
      category: 'Activities',
      eventName: 'Daily Quests',
      amount: readyQuests.length,
      unit: 'quests',
      points: 0,
      stock: null,
      hint: `${readyQuests.length} completed quest${readyQuests.length > 1 ? 's' : ''} waiting to collect rewards in game`
    });
  }

  function compareGoals(a: any, b: any) {
    const aOverlap = a.overlapCount > 1 ? a.overlapCount : 0;
    const bOverlap = b.overlapCount > 1 ? b.overlapCount : 0;
    if (aOverlap !== bOverlap) return bOverlap - aOverlap;

    const aUrgent = a.category === 'Resources'
      ? Boolean(a.inStock)
      : (Boolean(a.isLimited) && !a.isUnavailable && !a.isCompleted);
    const bUrgent = b.category === 'Resources'
      ? Boolean(b.inStock)
      : (Boolean(b.isLimited) && !b.isUnavailable && !b.isCompleted);
    if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

    const aPts = a.totalPoints || 0;
    const bPts = b.totalPoints || 0;
    if (aPts !== bPts) return bPts - aPts;

    return a.title.localeCompare(b.title);
  }

  const allGoals = Array.from(goalsMap.values());
  const activities = allGoals.filter((g) => g.category === 'Activities').sort(compareGoals);
  const resources = allGoals.filter((g) => g.category === 'Resources').sort(compareGoals);

  return {
    all: allGoals.sort(compareGoals),
    activities,
    resources,
    metrics: {
      totalGoals: allGoals.length,
      synergiesCount: allGoals.filter((g) => g.overlapCount > 1).length,
      readyCount: allGoals.filter((g) =>
        (g.category === 'Resources' && g.inStock) ||
        (g.category === 'Activities' && g.isLimited && !g.isUnavailable && !g.isCompleted)
      ).length
    }
  };
}

export const BATTLE_REPORT_CLAIM_TYPES = [
  'soloMobAttackResult',
  'rallyMobAttackResult',
  'rallyCancelled',
  'mineGatheringResult',
  'outpostScoutResult',
  'outpostAttackResult',
  'outpostScoutDenied',
  'mineAttackResult',
  'mineDefendResult',
  'rallyMemberKicked',
  'mineScoutResult',
  'presidentAssign',
  'outpostAttackDenied',
] as const;

export interface PendingClaimsResult {
  letterIds: Array<string | number>;
  hasReports: boolean;
  questIds: Array<string | number>;
  totalCount: number;
}

export function getPendingClaims(cache: any): PendingClaimsResult {
  if (!cache || typeof cache !== 'object') {
    return { letterIds: [], hasReports: false, questIds: [], totalCount: 0 };
  }

  const letters = Array.isArray(cache.mailStatus?.data?.letters)
    ? cache.mailStatus.data.letters
    : Array.isArray(cache.mailGetAll?.data?.letters)
    ? cache.mailGetAll.data.letters
    : Array.isArray(cache.mailGetAll?.letters)
    ? cache.mailGetAll.letters
    : [];

  const unclaimedLetters = letters.filter(
    (l: any) =>
      l &&
      !l.deleted &&
      (l.reward || l.q_reward || l.items) &&
      !(Number(l.availableUntil) > 0 && Number(l.availableUntil) * 1000 <= Date.now()) &&
      !l.claimed &&
      !l.rewardReceived &&
      !l.rewardClaimed
  );
  const letterIds = unclaimedLetters.map((l: any) => l.id ?? l.letterId).filter((id: any) => id != null);

  const mailData = cache.mailStatus?.data || {};
  const hasReports = Boolean(
    mailData.hasUnclaimed ||
    Number(mailData.totalUnclaimed) > 0 ||
    Number(mailData.unclaimedReportsCount) > 0
  );

  const quests = Array.isArray(cache.questGetAll?.data)
    ? cache.questGetAll.data
    : Array.isArray(cache.questGetAll)
    ? cache.questGetAll
    : [];
  const readyQuests = quests.filter((q: any) => q && q.state === 2);
  const questIds = readyQuests.map((q: any) => q.id).filter((id: any) => id != null);

  const totalCount = letterIds.length + (hasReports ? 1 : 0) + questIds.length;

  return { letterIds, hasReports, questIds, totalCount };
}

export function buildAutoClaimCalls(cache: any, options: any = {}) {
  const opt = { mail: true, reports: true, quests: true, ...options };
  const pending = getPendingClaims(cache);
  const calls: any[] = [];

  if (opt.mail && pending.letterIds.length > 0) {
    calls.push({
      name: 'mailFarm',
      args: { letterIds: pending.letterIds },
    });
  }

  if (opt.reports && pending.hasReports) {
    calls.push({
      name: 'readAndClaimAll',
      args: { types: BATTLE_REPORT_CLAIM_TYPES },
      feature: 'report',
    });
  }

  if (opt.quests && pending.questIds.length > 0) {
    calls.push({
      name: 'quest_multiFarm',
      args: { questIds: pending.questIds },
    });
  }

  if (calls.length > 0) {
    calls.push({ name: 'mailGetAll', args: {} }, { name: 'questGetAll', args: {} });
  }

  return { calls, pending };
}

export function exportTableData(tab: string, cache: any, query = '', itemGroupFilter = ''): any[] {
  if (!cache) return [];
  const q = (query || '').trim().toLocaleLowerCase();
  const matchesFilter = (vals: any[]) => !q || vals.some((v) => String(v ?? '').toLocaleLowerCase().includes(q));

  if (tab === 'heroes') {
    const data = cache.heroGetAll?.data || {};
    const heroes = Object.entries(data).sort(([a], [b]) => Number(a) - Number(b));
    const result: any[] = [];
    for (const [id, hero] of heroes as [string, any][]) {
      const meta = heroMetadata[Number(id)] || (heroMetadata as any)[id];
      const name = meta?.name || getHeroName(id) || `#${id}`;
      if (!matchesFilter([id, name, hero?.level, hero?.star, hero?.power, meta?.role, meta?.class, meta?.faction])) {
        continue;
      }
      const { owned, needed } = heroSoulProgress(id, hero, cache.inventoryGet?.data);
      const sparkLevel = Number.isInteger(hero?.titanGiftLevel) ? hero.titanGiftLevel : 0;
      const skills = hero?.skills
        ? Object.entries(hero.skills)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([k, lvl], idx) => ({ slot: idx + 1, skillId: Number(k), level: Number(lvl) }))
        : [];
      result.push({
        id: Number(id),
        name,
        level: Number(hero?.level) || null,
        star: Number(hero?.star) || 1,
        power: Number(hero?.power) || 0,
        role: meta?.role || null,
        class: meta?.class || null,
        faction: meta?.faction || null,
        soulStones: { current: owned, needed },
        sparksOfPower: { level: sparkLevel, max: 30 },
        skills,
      });
    }
    return result;
  }

  if (tab === 'titans') {
    const data = cache.titanGetAll?.data || {};
    const titans = Object.entries(data).sort(([a], [b]) => Number(a) - Number(b));
    const result: any[] = [];
    for (const [id, titan] of titans as [string, any][]) {
      const meta = titanMetadata[Number(id)] || (titanMetadata as any)[id];
      const name = meta?.name || `#${id}`;
      if (!matchesFilter([id, name, titan?.level, titan?.star, titan?.power, meta?.role, meta?.element])) {
        continue;
      }
      const { owned, needed } = titanSoulProgress(id, titan, cache.inventoryGet?.data);
      const skills = titan?.skills
        ? Object.entries(titan.skills)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([k, lvl], idx) => ({ slot: idx + 1, skillId: Number(k), level: Number(lvl) }))
        : [];
      result.push({
        id: Number(id),
        name,
        level: Number(titan?.level) || null,
        star: Number(titan?.star) || 1,
        power: Number(titan?.power) || 0,
        role: meta?.role || null,
        element: meta?.element || null,
        soulStones: { current: owned, needed },
        skills,
        artifacts: Array.isArray(titan?.artifacts)
          ? titan.artifacts.map((art: any, idx: number) => ({
              slot: idx + 1,
              type: ['weapon', 'crown', 'seal'][idx] || `artifact${idx + 1}`,
              star: Number(art?.star) || 0,
              level: Number(art?.level) || 0,
              isUpgradable: isTitanArtifactUpgradable(id, idx, titan, cache),
            }))
          : [],
      });
    }
    return result;
  }

  if (tab === 'items') {
    const data = cache.inventoryGet?.data || {};
    const result: any[] = [];
    for (const [category, items] of Object.entries(data)) {
      if (itemGroupFilter && category !== itemGroupFilter) continue;
      for (const [id, quantity] of Object.entries((items as any) ?? {})) {
        const name = getItemName(category, id) || '—';
        if (!matchesFilter([category, id, name, quantity])) continue;
        result.push({
          group: category,
          id: Number(id) || id,
          name,
          amount: Number(quantity) || 0,
        });
      }
    }
    return result;
  }

  if (tab === 'resources') {
    const result: any[] = [];
    const resEntries = Object.entries(cache).filter(([k]) => k.startsWith('resource:'));
    for (const [key, entry] of resEntries) {
      const d = (entry as any)?.data || {};
      const name = d.label || d.name || key.replace('resource:', '');
      if (!matchesFilter([key, name, d.amount])) continue;
      result.push({
        key,
        name,
        amount: Number(d.amount) || 0,
      });
    }
    return result;
  }

  return [];
}

export const popupDataHelper = {
  heroSoulProgress,
  titanSoulProgress,
  isSoulUpgradeReady,
  countEvolvableHeroes,
  countEvolvableTitans,
  getChallengeResourceStock,
  isTitanArtifactUpgradable,
  heroEquipmentRank,
  getHeroEquipmentRank: heroEquipmentRank,
  getUnreadChatCount,
  formatChatRole,
  formatChatTime,
  getHeroArtifactTier,
  getHeroArtifactTierStyle,
  formatCountdown,
  draftStageDescription,
  isDraftActive,
  defaultDraftCandidates,
  observedDraftChoices,
  validateDraftPicks,
  getDraftActiveStep,
  questLocaleMap,
  BATTLE_REPORT_CLAIM_TYPES,
  getPendingClaims,
  buildAutoClaimCalls,
  normalizeGoalKey,
  isTowerCleared,
  extractEventGoals,
  exportTableData,
};
