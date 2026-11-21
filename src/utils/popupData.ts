import { titanMetadata, titanArtifactEvolveCost, titanArtifactLevelCosts } from '../data/titanMetadata.ts';
import { heroMetadata, heroGlyphs, skinStats } from '../data/heroMetadata.ts';
import { getItemName, getHeroName, nameMap } from '../data/nameData.ts';
import {
  clanVersusRoundQuests,
  clanVersusChallengeNames,
  clanVersusChallengePoints,
  clanVersusChallengeSteps,
} from '../data/clanVersusData.ts';
import { questData } from '../data/questData.ts';
import { knownQuestTargets } from './tierHelper.ts';
import {
  resolveClaimableEventQuests,
  resolveClaimableBattlePassRewards,
  countClaimableEvents,
  countClaimableEventQuests,
  countClaimableBattlePass,
  type ClaimableQuestItem,
  type ClaimableBattlePassItem,
} from './eventClaimHelper.ts';
import { getAttentionBonusAvailability } from './freeChestHelper.ts';
import { freeAlchemyAvailability } from '../services/freeAlchemy.ts';
import { getGold, getStarMoney, getEnergy } from './resourceData.ts';

// enum_evolutionStar.json and enum_titanEvolutionStar.json from verified 1.294.0 (client 1.294.1020) splitlib asset.
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
  if (r === '4') return { label: 'Warlord', badgeClass: 'bg-purple-100 text-purple-800 ring-1 ring-purple-300' };
  if (r === '3') return { label: 'Officer', badgeClass: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300' };
  if (r === '2') return { label: 'Member', badgeClass: 'bg-slate-100 text-slate-700' };
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
      const userGold = getGold(cache);
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
    return getEnergy(cache);
  }
  if (tId === 47 || tStr.includes('hero soul stone')) {
    return Object.values(fragments).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
  }
  if (tId === 16 || tStr.includes('skill book')) return getConsumable('16');
  if (tId === 92 || tStr.includes('honor mark')) return cache['resource:material:12']?.data?.amount ?? 0;
  if (tId === 114 || tStr.includes('outland chest')) return getCoin('2');
  if (tStr.includes('emerald') || tStr.includes('starmoney')) {
    return getStarMoney(cache);
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

export interface AutoClaimSettings {
  mail: boolean;
  reports: boolean;
  quests: boolean;
  attentionBonuses: boolean;
  videoBoxes: boolean;
  alchemySpin: boolean;
  airshipGift: boolean;
  dailyBonus: boolean;
  freeOffers: boolean;
  frontierRewards: boolean;
  onOpen: boolean;
}

export function normalizeAutoClaim(value: any = {}): AutoClaimSettings {
  value = value || {};
  return {
    mail: value.mail !== false,
    reports: value.reports !== false,
    quests: value.quests !== false,
    attentionBonuses: value.attentionBonuses !== false,
    videoBoxes: value.videoBoxes !== false,
    alchemySpin: value.alchemySpin !== false,
    airshipGift: value.airshipGift !== false,
    dailyBonus: value.dailyBonus !== false,
    freeOffers: value.freeOffers !== false,
    frontierRewards: value.frontierRewards !== false,
    onOpen: value.onOpen === true,
  };
}

export interface PendingClaimsResult {
  letterIds: Array<string | number>;
  hasReports: boolean;
  questIds: Array<string | number>;
  dailyQuestIds: Array<string | number>;
  eventQuests: ClaimableQuestItem[];
  battlePassRewards: ClaimableBattlePassItem[];
  attentionBonusIds: number[];
  videoBoxNums: number[];
  hasAlchemySpin: boolean;
  hasAirshipGift: boolean;
  hasDailyBonus: boolean;
  freeOfferIds: number[];
  hasFrontierRewards: boolean;
  totalCount: number;
}

export function getPendingClaims(cache: any, now = Date.now(), dynamicCatalog?: any): PendingClaimsResult {
  if (!cache || typeof cache !== 'object') {
    return {
      letterIds: [],
      hasReports: false,
      questIds: [],
      dailyQuestIds: [],
      eventQuests: [],
      battlePassRewards: [],
      attentionBonusIds: [],
      videoBoxNums: [],
      hasAlchemySpin: false,
      hasAirshipGift: false,
      hasDailyBonus: false,
      freeOfferIds: [],
      hasFrontierRewards: false,
      totalCount: 0,
    };
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
      !(Number(l.availableUntil) > 0 && Number(l.availableUntil) * 1000 <= now) &&
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

  // Daily 4X and Chained Quests (e.g. Brigand Camps 362-364, Bosses 368-370, Gathering 365-367)
  const dqList = questData?.dailyQuests?.(cache, now) || [];
  const dailyQuestIds: Array<string | number> = [];
  for (const dq of dqList) {
    if (!dq || dq.id == null) continue;
    const isDone = dq.state === 'completed' || (dq.state as any) === 3 || (Number(dq.completionCount) || 0) > 0;
    if (isDone) continue;
    const target = Number(
      questData?.dailyDefinition?.(dq.id)?.condition?.target ??
      knownQuestTargets[dq.id] ??
      dq.target ??
      dq.condition?.target
    ) || 0;
    const progress = Number(dq.progress) || 0;
    const isReady = dq.state === 'ready' || (dq.state as any) === 2 || (target > 0 && progress >= target);
    if (isReady) {
      dailyQuestIds.push(dq.id);
    }
  }

  // Attention bonus free chests
  const bonuses = cache.attentionBonusStatus?.data?.bonuses;
  let attentionBonusIds: number[] = [];
  if (bonuses && (Array.isArray(bonuses) ? bonuses.length > 0 : Object.keys(bonuses).length > 0)) {
    const avail = getAttentionBonusAvailability(bonuses, now);
    attentionBonusIds = avail.ready ? avail.readyBonusIds : [];
  }

  // Video mystery boxes (firstPlacement 0..4)
  let videoBoxNums: number[] = [];
  const cinemaCounters = cache.cinemaGetCounters?.data;
  if (cinemaCounters && typeof cinemaCounters === 'object') {
    const placementViewed = Number(cinemaCounters.placementViewed ?? 0);
    const placementAvailable = Number(cinemaCounters.placementAvailable ?? 0);
    const placementRewards = Array.isArray(cinemaCounters.placementRewards) ? cinemaCounters.placementRewards : [];
    const claimedSet = new Set(placementRewards.map((r: any) => Number(r?.boxNum)));
    const remaining = [0, 1, 2, 3, 4].filter((num) => !claimedSet.has(num));
    if (placementViewed < 5) {
      if (placementAvailable > 0) {
        videoBoxNums = remaining.slice(0, placementAvailable);
      } else if (placementRewards.length === 0 && placementViewed === 0) {
        videoBoxNums = [0, 1, 2, 3, 4];
      }
    }
  }

  // Alchemy free spin (only when alchemy quota/status is present in cache)
  const hasAlchemyData = Boolean(cache['resource:refillable:53'] || cache.freeAlchemySpinStatus);
  const hasAlchemySpin = hasAlchemyData && freeAlchemyAvailability(cache, now).ready;

  // Airship Valkyrie gift
  const hasAirshipGift = Boolean(cache.zeppelinGiftGet?.data?.available);

  // Daily calendar bonus
  const hasDailyBonus = Boolean(cache.dailyBonusGetInfo?.data?.availableToday);

  // Special Offer & Progressive Bundle Free Gifts
  let freeOfferIds: number[] = [];
  const offers = Array.isArray(cache.offerGetAll?.data)
    ? cache.offerGetAll.data
    : Array.isArray(cache.offerGetAll)
    ? cache.offerGetAll
    : [];
  for (const o of offers) {
    if (!o || !o.isActive || o.id == null) continue;
    // Progressive bundle
    if (o.offerType === 'progressiveBundle' && o.offerData?.progressive?.slot) {
      const stage = Number(o.clientData?.stage ?? 0);
      const slots = o.offerData.progressive.slot;
      if (stage < slots.length) {
        const currentSlot = slots[stage];
        const hasFree = Array.isArray(currentSlot) && currentSlot.some((item: any) => item && item.freeReward);
        if (hasFree) {
          freeOfferIds.push(Number(o.id));
          continue;
        }
      }
    }
    // Daily reward offer
    if (o.offerType === 'dailyReward' || o.type === 'reward') {
      if (o.freeRewardObtained === false || (o.reward && !o.freeRewardObtained)) {
        freeOfferIds.push(Number(o.id));
      }
    }
  }

  // Frontier rewards chest (Eternal Story)
  const chestData = cache.eternalStoryChestStatus?.data;
  const hasFrontierRewards = Boolean(
    (chestData?.reward && Object.keys(chestData.reward).length > 0) ||
    Number(chestData?.filled_in_percents) > 0
  );

  // Event Quests & Battle Pass Claims
  const eventQuests = resolveClaimableEventQuests(cache);
  const battlePassRewards = resolveClaimableBattlePassRewards(cache, dynamicCatalog);
  const battlePassRewardsCount = battlePassRewards.reduce((sum, item) => sum + item.count, 0);

  // Total Freebies Count (excludes dynamic events which are managed on the Events tab)
  const totalCount =
    letterIds.length +
    (hasReports ? 1 : 0) +
    questIds.length +
    dailyQuestIds.length +
    attentionBonusIds.length +
    videoBoxNums.length +
    (hasAlchemySpin ? 1 : 0) +
    (hasAirshipGift ? 1 : 0) +
    (hasDailyBonus ? 1 : 0) +
    freeOfferIds.length +
    (hasFrontierRewards ? 1 : 0);

  return {
    letterIds,
    hasReports,
    questIds,
    dailyQuestIds,
    eventQuests,
    battlePassRewards,
    attentionBonusIds,
    videoBoxNums,
    hasAlchemySpin,
    hasAirshipGift,
    hasDailyBonus,
    freeOfferIds,
    hasFrontierRewards,
    totalCount,
  };
}

export const VIP_POINTS_THRESHOLDS = [0, 50, 100, 300, 500, 1000, 2000, 3000, 5000, 7000, 10000, 15000, 25000, 40000, 70000, 150000];

export const DAILY_BONUS_VIP_DOUBLE_REQUIREMENT: Record<number, number> = {
  1: 1,
  5: 3,
  6: 4,
  10: 6,
  11: 7,
  15: 9,
  16: 10,
  20: 12,
  21: 13,
  23: 1,
  25: 15,
  26: 15,
  28: 15,
  30: 15,
  31: 1,
};

export function getUserVipLevel(cache: any): number {
  const pointsRaw = cache?.userGetInfo?.data?.vipPoints ?? cache?.accountStatus?.data?.vipPoints;
  const points = Number(pointsRaw);
  if (!Number.isFinite(points) || points < 0) return 0;
  return Math.max(0, VIP_POINTS_THRESHOLDS.filter((t) => points >= t).length - 1);
}

export function canClaimDailyBonusVip(cache: any): boolean {
  const info = cache?.dailyBonusGetInfo?.data;
  if (!info?.availableVip) return false;
  const currentDay = Number(info?.currentDay);
  if (!Number.isFinite(currentDay)) return false;
  const requiredVip = DAILY_BONUS_VIP_DOUBLE_REQUIREMENT[currentDay];
  if (!requiredVip) return false;
  const userVip = getUserVipLevel(cache);
  return userVip >= requiredVip;
}

export function buildAutoClaimCalls(cache: any, options: any = {}, now = Date.now(), dynamicCatalog?: any) {
  const opt = {
    ...normalizeAutoClaim(options),
    eventQuests: options?.eventQuests === true,
    battlePass: options?.battlePass === true,
  };
  const pending = getPendingClaims(cache, now, dynamicCatalog);
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

  if (opt.quests && pending.dailyQuestIds?.length > 0) {
    for (const dqId of pending.dailyQuestIds) {
      calls.push({
        name: 'completeQuest',
        args: { questId: Number(dqId) },
        feature: 'quest',
      });
    }
  }

  if (opt.eventQuests && pending.eventQuests.length > 0) {
    for (const eq of pending.eventQuests) {
      calls.push({
        name: 'completeQuest',
        args: { questId: eq.questId },
        feature: 'quest',
      });
    }
  }

  if (opt.battlePass && pending.battlePassRewards.length > 0) {
    for (const bp of pending.battlePassRewards) {
      calls.push({
        name: 'claimBattlepassRewardAll',
        args: {
          battlepassId: bp.battlepassId,
          levelIdAndTrackIdToClaim: bp.levelIdAndTrackIdToClaim,
          claimedAt: new Date(now).toISOString(),
        },
        feature: 'battlepass',
      });
    }
  }

  if (opt.attentionBonuses && pending.attentionBonusIds.length > 0) {
    for (const id of pending.attentionBonusIds) {
      calls.push({
        name: 'attentionBonus_collectReward',
        args: { id },
      });
    }
  }

  if (opt.videoBoxes && pending.videoBoxNums.length > 0) {
    for (const boxNum of pending.videoBoxNums) {
      calls.push({
        name: 'cinemaGiveReward',
        args: { type: 'firstPlacement', boxNum },
      });
    }
  }

  if (opt.alchemySpin && pending.hasAlchemySpin) {
    calls.push({
      name: 'refillable_alchemyUseVideo',
      args: { type: 'alchemy' },
    });
  }

  if (opt.airshipGift && pending.hasAirshipGift) {
    calls.push({
      name: 'subscriptionFarm',
      args: {},
    });
    calls.push({
      name: 'zeppelinGiftFarm',
      args: {},
    });
  }

  if (opt.dailyBonus && pending.hasDailyBonus) {
    const dailyBonusArgs = canClaimDailyBonusVip(cache) ? { vip: 1 } : {};
    calls.push({
      name: 'dailyBonusFarm',
      args: dailyBonusArgs,
    });
  }

  if (opt.freeOffers && pending.freeOfferIds.length > 0) {
    for (const offerId of pending.freeOfferIds) {
      calls.push({
        name: 'offerFarmReward',
        args: { offerId },
      });
    }
  }

  if (opt.frontierRewards && pending.hasFrontierRewards) {
    calls.push({
      name: 'eternalStory_collectChest',
      args: {},
    });
  }

  if (calls.length > 0) {
    calls.push({ name: 'mailGetAll', args: {} }, { name: 'questGetAll', args: {} });
    if (
      (opt.attentionBonuses && pending.attentionBonusIds.length > 0) ||
      (opt.videoBoxes && pending.videoBoxNums.length > 0) ||
      (opt.alchemySpin && pending.hasAlchemySpin) ||
      (opt.airshipGift && pending.hasAirshipGift) ||
      (opt.dailyBonus && pending.hasDailyBonus) ||
      (opt.freeOffers && pending.freeOfferIds.length > 0) ||
      (opt.frontierRewards && pending.hasFrontierRewards) ||
      (opt.eventQuests && pending.eventQuests.length > 0) ||
      (opt.battlePass && pending.battlePassRewards.length > 0)
    ) {
      calls.push(
        { name: 'userGetInfo', args: {} },
        { name: 'refillableGetAll', args: { getAt: now }, feature: 'refillable' },
        { name: 'inventoryGet', args: {} }
      );
    }
    if (opt.frontierRewards && pending.hasFrontierRewards) {
      calls.push({ name: 'eternalStory_getChest', args: {} });
    }
    if (
      (opt.eventQuests && pending.eventQuests.length > 0) ||
      (opt.battlePass && pending.battlePassRewards.length > 0) ||
      (opt.quests && pending.dailyQuestIds?.length > 0)
    ) {
      calls.push(
        { name: 'getDailyQuests', feature: 'quest', args: {} },
        { name: 'getSpecialQuestState', feature: 'quest', args: {} },
        { name: 'getBattlepassState', feature: 'battlepass', args: {} },
        { name: 'user_getNextDayTime', args: {} }
      );
    }
    if (opt.airshipGift && pending.hasAirshipGift) {
      calls.push(
        { name: 'zeppelinGiftGet', args: {} },
        { name: 'subscriptionGetInfo', args: {} }
      );
    }
    if (opt.dailyBonus && pending.hasDailyBonus) {
      calls.push({ name: 'dailyBonusGetInfo', args: {} });
    }
    if (
      (opt.attentionBonuses && pending.attentionBonusIds.length > 0) ||
      (opt.videoBoxes && pending.videoBoxNums.length > 0) ||
      (opt.freeOffers && pending.freeOfferIds.length > 0)
    ) {
      calls.push(
        { name: 'cinemaGetCounters', args: {} },
        { name: 'offerGetAll', args: {} }
      );
    }
  }

  return { calls, pending };
}

export const ITEM_GROUP_META: Record<string, { order: number; label: string; icon: string }> = {
  consumable: { order: 10, label: 'Consumables', icon: '🧪' },
  lootboxChanced: { order: 15, label: 'Chests & Boxes', icon: '🎁' },
  gear: { order: 20, label: 'Equipment', icon: '🛡️' },
  fragmentGear: { order: 30, label: 'Gear Recipes', icon: '📜' },
  scroll: { order: 32, label: 'Scrolls', icon: '📜' },
  fragmentScroll: { order: 34, label: 'Scroll Recipes', icon: '📜' },
  fragmentHero: { order: 40, label: 'Hero Soul Stones', icon: '👤' },
  fragmentTitan: { order: 42, label: 'Titan Soul Stones', icon: '🗿' },
  fragmentArtifact: { order: 44, label: 'Artifact Fragments', icon: '💍' },
  fragmentSkin: { order: 46, label: 'Skin Fragments', icon: '✨' },
  coin: { order: 50, label: 'Coins & Currency', icon: '🪙' },
  material: { order: 52, label: 'Materials', icon: '⚙️' }
};

export function getItemCategoryMeta(category: string): { order: number; label: string; icon: string } {
  if (!category || typeof category !== 'string') {
    return { order: 100, label: 'Other Items', icon: '📦' };
  }
  return ITEM_GROUP_META[category] || {
    order: 100,
    label: category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1'),
    icon: '📦'
  };
}

export function getItemAbbr(name: string, id?: number | string): string {
  if (!name || name === '—') return id ? `#${id}` : '';
  const clean = String(name).replace(/[^\w\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
  }
  if (words.length === 1 && words[0]) {
    const w = words[0];
    if (w.length <= 4) return w.toUpperCase();
    return w.slice(0, 3).toUpperCase();
  }
  return String(id || '');
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

      const skins = hero?.skins
        ? Object.entries(hero.skins)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([skinId, lvl]) => {
              let stat = skinStats[Number(skinId)];
              if (!stat || stat === 'MAIN' || Number(skinId) === Number(hero?.baseSkinId) || (Number(skinId) <= 100 && !skinStats[Number(skinId)])) {
                const mainStat = meta?.mainStat || (meta?.role === 'Tank' || meta?.class === 'Warrior' ? 'strength' : meta?.class === 'Marksman' ? 'agility' : 'intelligence');
                stat = mainStat === 'strength' ? 'Str' : mainStat === 'agility' ? 'Agi' : 'Int';
              }
              return {
                skinId: Number(skinId),
                stat: stat || 'Skin',
                level: Number(lvl),
                isCurrent: Number(skinId) === Number(hero?.currentSkin)
              };
            })
        : [];

      const rawRunes = hero?.hero_runes || hero?.runes;
      const heroRunes = Array.isArray(rawRunes) ? rawRunes : (rawRunes && typeof rawRunes === 'object' ? Object.values(rawRunes) : []);
      const glyphList = heroGlyphs[Number(id)] || ['PA', 'Arm', 'HP', 'MD', 'Str'];
      const glyphs = heroRunes.map((lvl: any, idx: number) => ({
        slot: idx + 1,
        stat: glyphList[idx] || `G${idx + 1}`,
        level: Number(lvl)
      }));

      const artifacts = Array.isArray(hero?.artifacts)
        ? hero.artifacts.map((art: any, idx: number) => ({
            slot: idx + 1,
            id: art?.id ?? null,
            star: art?.star ?? null,
            level: art?.level ?? null
          }))
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
        skins,
        glyphs,
        artifacts,
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

      const skins = titan?.skins && typeof titan.skins === 'object'
        ? Object.entries(titan.skins)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([skinId, lvl]) => {
              let stat = skinStats[Number(skinId)];
              if (!stat || stat === 'MAIN') stat = 'HP';
              return {
                skinId: Number(skinId),
                stat: stat || 'Skin',
                level: Number(lvl),
                isCurrent: Number(skinId) === Number(titan?.currentSkin)
              };
            })
        : (titan?.skins || titan?.skin || null);

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
        skins,
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
        cap: Number.isFinite(d.cap) ? d.cap : null,
        renewable: Boolean(d.renewable),
        refillEveryMs: Number.isFinite(d.refillEveryMs) ? d.refillEveryMs : null,
        refillAmount: Number.isFinite(d.refillAmount) ? d.refillAmount : null,
      });
    }
    return result;
  }

  if (tab === 'teams') {
    const data = cache.teamGetAll?.data || {};
    const rows = teamRows(data, { hero: (id: any) => getHeroName(id) });
    return rows
      .filter((row) => matchesFilter(row))
      .map((row) => ({
        mode: row[0],
        teamNumber: row[1],
        memberCount: row[2],
        names: row[3],
        members: Array.isArray(row[4]) ? row[4] : [],
      }));
  }

  if (tab === 'other') {
    const entries = Object.values(cache).filter((entry: any) =>
      entry?.key && !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'guildChat', 'energyStatus',
        'worldEnergyStatus', 'worldEnergyRallies', 'resourceActionHistory',
        'accountStatus', 'buildingStatus', 'marchStatus',
        'researchStatus', 'productionConfigStatus', 'productionStatus',
        'productionBonusStatus', 'missionProgressStatus', 'clanVersusStatus', 'questEvents',
        'clanWarChampStatus', 'fortressEventStatus', 'clanClashStatus', 'brawlStatus'].includes(entry.key)
      && !entry.key.startsWith('resource:')
      && matchesFilter([entry.method, entry.feature || entry.group]));
    return entries.map((entry: any) => ({
      key: entry.key,
      method: entry.method,
      feature: entry.feature || entry.group,
      size: Array.isArray(entry.data) ? entry.data.length : Object.keys(entry.data ?? {}).length,
      updatedAt: entry.updatedAt,
      data: entry.data
    }));
  }

  return [];
}

export function formatTitanArtifactLevels(titanId: number | string, titan: any): string {
  if (!titan || !Array.isArray(titan.artifacts) || !titan.artifacts.length) {
    return '—';
  }
  return titan.artifacts.map((a: any) => (a && a.level != null ? a.level : 1)).join(' - ');
}

export function marchDuration(ms: number, precise = false): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'Due now';
  if (ms < 60000) return `${precise ? Math.ceil(ms / 1000) : Math.ceil(ms / 10000) * 10} sec`;
  const minutes = Math.max(1, Math.floor(ms / 60000));
  return minutes < 60 ? `${minutes} min` : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function rallyTooltip(march: any, now: number, heroName: (id: number | string) => string): string {
  const rally = march.rally || {};
  const isHelperAutoJoin = Boolean(rally.isHelperAutoJoin || rally.autoJoinSource === 'extension' || rally.autoJoinSource === 'helper');
  const isGameAutoJoin = Boolean(rally.autoJoinSource === 'game' || (!isHelperAutoJoin && Boolean(rally.isAutoJoin)));
  const raidTitle = isHelperAutoJoin
    ? '🤖 Helper Auto-Join Raid'
    : isGameAutoJoin
      ? '⚡ Game Auto-Join Raid'
      : rally.isAutoJoin
        ? '⚡ Auto-Join Raid'
        : 'Raid';
  const heroes = (rally.team?.heroIds || []).map((id: any) => heroName(id) || `Hero #${id}`);
  const troops = (rally.team?.units || []).map((unit: any) => `#${unit.id} ×${Number(unit.count).toLocaleString('en-US')}`);
  const isJoiningLeader = Number.isFinite(rally.memberEta) && rally.memberEta > now;
  const wait = Number.isFinite(rally.waitUntil) && rally.waitUntil > now ? marchDuration(rally.waitUntil - now) : 'Complete';
  const arrivalAt = Number.isFinite(rally.arrivalAt) ? rally.arrivalAt : Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs) ? rally.waitUntil + rally.outboundMs : null;
  const arrival = !Number.isFinite(arrivalAt) ? 'Route pending' : arrivalAt! > now ? `${Number.isFinite(rally.arrivalAt) ? '' : '~'}${marchDuration(arrivalAt! - now)} remaining` : Number.isFinite(rally.arrivalAt) ? 'Reached' : 'Due; awaiting route update';
  const returning = Number.isFinite(rally.returnAt) ? `${rally.returnAt > now ? `${marchDuration(rally.returnAt - now)} remaining` : 'Due now'}` : Number.isFinite(rally.returnMs) ? `~${marchDuration(rally.returnMs, true)} travel after battle` : 'Route pending';
  return [
    `${raidTitle} · ${rally.target || 'Target pending'}`,
    ...(rally.leaderName ? [`Leader: ${rally.leaderName}`] : []),
    `Team: ${heroes.join(', ') || '—'}`,
    ...(troops.length ? [`Troops: ${troops.join(', ')}`] : []),
    ...(isJoiningLeader ? [`Joining leader camp: ~${marchDuration(rally.memberEta - now, true)} remaining`] : []),
    `Wait: ${wait}`,
    ...(Number.isFinite(rally.outboundMs) ? [`Travel to target: ~${marchDuration(rally.outboundMs, true)}`] : []),
    `Arrival: ${arrival}`,
    `Return to base: ${returning}`,
  ].join('\n');
}

export function teamRows(data: any, nameMap: any): any[] {
  return Object.entries(data || {}).flatMap(([mode, members]: [string, any]) => {
    if (!Array.isArray(members)) return [[mode, '—', 0, '—', []]];
    const groups = members.some(Array.isArray) ? members : [members];
    return groups.map((group, index) => {
      const ids = Array.isArray(group) ? group.filter(Number.isInteger) : [];
      return [
        mode,
        groups.length > 1 ? index + 1 : '—',
        ids.length,
        ids.length ? ids.map((id) => (typeof nameMap?.hero === 'function' ? nameMap.hero(id) : null) || `#${id}`).join(', ') : '—',
        ids,
      ];
    });
  });
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const numericHeadings = new Set(['Level', 'Star', 'Soul stones / needed', 'Soul stone', 'Soul stones', 'Equipment rank', 'Power', 'Amount', 'Members', 'Size']);
export const isNumericColumn = (heading: string): boolean => numericHeadings.has(heading);

export function sortRows(rows: any[], column: number | string, direction: 'asc' | 'desc', isFavoriteFn?: (row: any) => boolean): any[] {
  const numeric = (value: any) => {
    if (typeof value === 'number') return value;
    const text = String(value ?? '');
    if (/^\d[\d,]*(?:\s*\/.*)?$/.test(text)) return Number((text.split('/')[0] || '').replaceAll(',', '').trim());
    return null;
  };
  return [...rows].sort((left, right) => {
    if (typeof isFavoriteFn === 'function') {
      const favA = Boolean(isFavoriteFn(left));
      const favB = Boolean(isFavoriteFn(right));
      if (favA !== favB) return favA ? -1 : 1;
    }
    const a = left[column];
    const b = right[column];
    if (a == null || a === '—') return b == null || b === '—' ? 0 : 1;
    if (b == null || b === '—') return -1;
    const an = numeric(a);
    const bn = numeric(b);
    const result = an !== null && bn !== null ? an - bn : collator.compare(String(a), String(b));
    return direction === 'desc' ? -result : result;
  });
}

import { hoursMinutes } from './resourceData.ts';

export function isMarchExpired(march: any, now = Date.now()): boolean {
  if (!march) return true;
  if (march.rally) {
    const rally = march.rally;
    const arrivalAt = Number.isFinite(rally.arrivalAt)
      ? rally.arrivalAt
      : Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs)
        ? rally.waitUntil + rally.outboundMs
        : null;
    const returnAt = Number.isFinite(rally.returnAt)
      ? rally.returnAt
      : Number.isFinite(march.endsAt) && march.stage === 'returnToOutpost'
        ? march.endsAt
        : Number.isFinite(arrivalAt) && Number.isFinite(rally.returnMs)
          ? arrivalAt + rally.returnMs
          : null;
    if (Number.isFinite(returnAt)) return now >= returnAt;
    if (march.stage === 'returnToOutpost' && Number.isFinite(march.endsAt)) return now >= march.endsAt;
    return Number.isFinite(rally.waitUntil) && now > rally.waitUntil + 30 * 60000;
  }
  if (march.stage === 'returnToOutpost' || march.kind === 'return') {
    const returnAt = Number.isFinite(march.returnAt) ? march.returnAt : march.endsAt;
    return Number.isFinite(returnAt) && now >= returnAt;
  }
  if (march.kind === 'attack' && march.stage === 'moveToTargetInSolo') {
    return Number.isFinite(march.targetArrivalAt) && Number.isFinite(march.durationMs) && now >= march.targetArrivalAt + march.durationMs + 5 * 60000;
  }
  const isMine = ['food', 'wood', 'stone', 'iron', 'mine'].includes(march.kind) || Boolean(march.mineId);
  if (isMine) {
    if (march.stage === 'moveToTargetInSolo' && Number.isFinite(march.targetArrivalAt)) {
      return false;
    }
    if (march.stage === 'interactionWithTarget') {
      if (Number.isFinite(march.endsAt) && (!march.targetArrivalAt || march.endsAt > march.targetArrivalAt + 60000)) {
        return march.endsAt <= now;
      }
      return false;
    }
  }
  return Number.isFinite(march.endsAt) && march.endsAt <= now;
}

export function buildingTooltip(status: any, now: number, buildingName?: (id: number | string) => string | null): string {
  const queues = (status?.data?.queues || []).filter((q: any) => Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now);
  if (!queues.length) return 'Construction: Idle';
  const lines = ['Construction in progress:'];
  for (const q of queues) {
    const name = (buildingName && q.buildingId ? buildingName(q.buildingId) : null) || (q.buildingId ? `Building #${q.buildingId}` : 'Building');
    const level = q.level ? ` (Lv. ${q.level})` : '';
    const mins = Math.ceil((q.startDate + q.durationMs - now) / 60000);
    const time = hoursMinutes(mins);
    lines.push(`${name}${level} · ${time} remaining`);
  }
  return lines.join('\n');
}

export function researchTooltip(status: any, now: number, researchName?: (id: number | string) => string | null): string {
  const queues = (status?.data?.queues || []).filter((q: any) => Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now);
  if (!queues.length) return 'Research: Idle';
  const lines = ['Research in progress:'];
  for (const q of queues) {
    const name = (researchName && q.researchId ? researchName(q.researchId) : null) || (q.researchId ? `Research #${q.researchId}` : 'Research');
    const level = q.level ? ` (Lv. ${q.level})` : '';
    const mins = Math.ceil((q.startDate + q.durationMs - now) / 60000);
    const time = hoursMinutes(mins);
    lines.push(`${name}${level} · ${time} remaining`);
  }
  return lines.join('\n');
}

export function tableExportFilename(tab: string, d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `hwa-${tab}-${stamp}.json`;
}

export function isResourceSelectableForHeader(entry: any): boolean {
  if (!entry || !entry.key) return false;
  return !['resource:energy', 'resource:world-energy'].includes(entry.key);
}

export function isDebugOrEventResource(entry: any, nameMapInstance: any = nameMap, refillRules?: any): boolean {
  if (!entry || !entry.key) return false;
  const id = entry.key.slice('resource:'.length);
  const [type, itemId] = id.split(':');
  let label = entry.data?.label || '';
  if (type === 'refillable') {
    label = refillRules?.[itemId]?.label || label;
  } else if (type && itemId && !id.startsWith('refillable:') && !id.startsWith('world-refillable:')) {
    label = nameMapInstance?.item?.(type, itemId) || label;
  }

  if (/test|debug|dummy|placeholder|deprecated|beta|unreleased/i.test(label) || /test|debug/i.test(entry.key)) {
    return true;
  }

  if (type === 'refillable' && itemId !== '2') {
    if (/^Refillable #|^Event Energy #/i.test(label) || entry.data?.amount === 0) {
      return true;
    }
  }

  if (/^(coin|consumable|material|scroll|refillable) #\d+/i.test(label)) {
    return true;
  }

  return false;
}

export {
  countClaimableEvents,
  countClaimableEventQuests,
  countClaimableBattlePass,
  resolveClaimableEventQuests,
  resolveClaimableBattlePassRewards,
};

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
  questLocaleMap,
  BATTLE_REPORT_CLAIM_TYPES,
  getPendingClaims,
  buildAutoClaimCalls,
  normalizeGoalKey,
  isTowerCleared,
  extractEventGoals,
  exportTableData,
  formatTitanArtifactLevels,
  marchDuration,
  rallyTooltip,
  teamRows,
  sortRows,
  isNumericColumn,
  buildingTooltip,
  researchTooltip,
  tableExportFilename,
  isMarchExpired,
  ITEM_GROUP_META,
  getItemCategoryMeta,
  getItemAbbr,
  isResourceSelectableForHeader,
  isDebugOrEventResource,
  countClaimableEvents,
  countClaimableEventQuests,
  countClaimableBattlePass,
  resolveClaimableEventQuests,
  resolveClaimableBattlePassRewards,
  VIP_POINTS_THRESHOLDS,
  DAILY_BONUS_VIP_DOUBLE_REQUIREMENT,
  getUserVipLevel,
  canClaimDailyBonusVip,
};
