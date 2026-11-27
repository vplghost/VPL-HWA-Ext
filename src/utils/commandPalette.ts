/**
 * Pure Quick Command Palette Index & Search Helper (`commandPalette.ts`).
 *
 * Indexes:
 * - All 10 Navigation Tabs (works even when a tab is hidden in `tabConfig`)
 * - All 23 Active Modals/Dialogs
 * - Owned Heroes from `cache.heroGetAll.data` (opens `HeroDetailModal` directly)
 */

import { getHeroName } from '../data/nameData.ts';
import type { ModalName } from '../composables/useModals.ts';

export type CommandPaletteCategory = 'tab' | 'modal' | 'hero';

export interface CommandPaletteItem {
  id: string;
  category: CommandPaletteCategory;
  label: string;
  subtitle: string;
  icon: string;
  keywords: string[];
  tabId?: string;
  modalName?: ModalName;
  hero?: Record<string, any>;
}

export const COMPACT_TAB_IDS = new Set(['dashboard', 'heroes', 'titans', 'events', 'goals']);

const PALETTE_TABS: Array<{ id: string; label: string; icon: string; keywords: string[] }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', keywords: ['home', 'overview', 'activities', 'autopilot'] },
  { id: 'heroes', label: 'Heroes', icon: '🦸', keywords: ['roster', 'hero', 'upgrade', 'souls'] },
  { id: 'items', label: 'Items', icon: '🎒', keywords: ['inventory', 'gear', 'fragments', 'scrolls'] },
  { id: 'resources', label: 'Resources', icon: '🪙', keywords: ['gold', 'wood', 'stone', 'iron', 'food', 'coins'] },
  { id: 'titans', label: 'Titans', icon: '🗿', keywords: ['titan', 'water', 'fire', 'earth', 'dungeon'] },
  { id: 'teams', label: 'Teams', icon: '⚔️', keywords: ['lineup', 'squad', 'preset', 'saved'] },
  { id: 'events', label: 'Events', icon: '🎉', keywords: ['special', 'quest', 'claim', 'rewards'] },
  { id: 'goals', label: 'Goals', icon: '🎯', keywords: ['synergy', 'planner', 'targets'] },
  { id: 'guild', label: 'Guild', icon: '🛡️', keywords: ['clan', 'members', 'activity', 'titanite'] },
  { id: 'settings', label: 'Settings', icon: '⚙️', keywords: ['config', 'preferences', 'tabs', 'autopilot', 'theme'] },
];

const PALETTE_MODALS: Array<{ modalName: ModalName; label: string; subtitle: string; icon: string; keywords: string[] }> = [
  { modalName: 'raid', label: 'Guild Raid', subtitle: 'Create & queue guild rallies', icon: '⚔️', keywords: ['rally', 'boss', 'queue'] },
  { modalName: 'monster', label: 'Solo Monster', subtitle: 'Hunt solo world monsters', icon: '👹', keywords: ['mob', 'hunt', 'queue'] },
  { modalName: 'brigand', label: 'Brigand Camp', subtitle: 'Attack brigand camps', icon: '⛺', keywords: ['camp', 'world'] },
  { modalName: 'gathering', label: 'Gathering', subtitle: 'Mine search & auto gather', icon: '⛏️', keywords: ['mine', 'resources', 'march'] },
  { modalName: 'campaign', label: 'Campaign Raid', subtitle: 'Farm gear, recipes & hero soul stones', icon: '🗺️', keywords: ['mission', 'soul', 'sweep', 'recipe'] },
  { modalName: 'tower', label: 'Tower', subtitle: 'Magic Tower automation & buffs', icon: '🗼', keywords: ['magic', 'floor', 'boss'] },
  { modalName: 'dungeon', label: 'Titan Dungeon', subtitle: 'Titan Dungeon auto-attack & simulator', icon: '🏰', keywords: ['titanite', 'door', 'wasm'] },
  { modalName: 'expeditions', label: 'Expeditions', subtitle: 'Collect & dispatch hero expeditions', icon: '⛵', keywords: ['valkyrie', 'artifact'] },
  { modalName: 'arena', label: 'Arena', subtitle: 'Arena opponent finder & WASM sim', icon: '🏟️', keywords: ['pvp', 'rank', 'battle'] },
  { modalName: 'grandArena', label: 'Grand Arena', subtitle: '3-team Grand Arena optimizer', icon: '🛡️', keywords: ['ga', 'pvp', '3-team'] },
  { modalName: 'pvpOptimizer', label: 'PvP Team Optimizer', subtitle: 'Offline WASM Elo leaderboard', icon: '🧪', keywords: ['elo', 'wasm', 'counter', 'leaderboard'] },
  { modalName: 'hydra', label: 'Hydra', subtitle: 'Guild Hydra heads & team planner', icon: '🐉', keywords: ['clanboss', 'heads'] },
  { modalName: 'legendsDraft', label: 'Legends Draft', subtitle: 'Headless draft play & counter sim', icon: '🃏', keywords: ['draft', 'randomdraft', 'pvp'] },
  { modalName: 'frontier', label: 'Frontier', subtitle: 'Eternal Story progression & AFK chest', icon: '🧭', keywords: ['eternal', 'story', 'chest'] },
  { modalName: 'building', label: 'Building Queue', subtitle: 'City buildings & troop training', icon: '🏗️', keywords: ['construction', 'upgrade', 'city'] },
  { modalName: 'research', label: 'Research Queue', subtitle: 'Personal research & academy tree', icon: '🔬', keywords: ['academy', 'tech', 'upgrade'] },
  { modalName: 'guildVersus', label: 'Guild Versus', subtitle: 'Guild Versus chests & round score', icon: '🏆', keywords: ['gv', 'clanversus'] },
  { modalName: 'guildChat', label: 'Guild Chat', subtitle: 'Read live guild chat messages', icon: '💬', keywords: ['chat', 'messages'] },
  { modalName: 'mail', label: 'Mail & Inbox', subtitle: 'Claim mail rewards & battle reports', icon: '✉️', keywords: ['inbox', 'reports', 'claim'] },
  { modalName: 'questDetail', label: 'Daily Quests', subtitle: 'View & claim daily quest rewards', icon: '📜', keywords: ['quests', 'tasks'] },
  { modalName: 'battlePass', label: 'Battle Pass', subtitle: 'Hero Way / Battle Pass milestones', icon: '🎫', keywords: ['pass', 'season'] },
  { modalName: 'chest', label: 'Chests', subtitle: 'Open inventory chests & dolls', icon: '🎁', keywords: ['boxes', 'open', 'inventory'] },
  { modalName: 'log', label: 'Activity Logs', subtitle: 'Inspect RPC, MQTT & automation logs', icon: '📋', keywords: ['debug', 'rpc', 'mqtt', 'diagnostics'] },
];

/**
 * Builds the unified Command Palette catalog from static Tabs/Modals + live owned Heroes in cache.
 */
export function buildCommandPaletteItems(cache?: Record<string, any> | null): CommandPaletteItem[] {
  const items: CommandPaletteItem[] = [];

  for (const t of PALETTE_TABS) {
    items.push({
      id: `tab:${t.id}`,
      category: 'tab',
      label: t.label,
      subtitle: 'Switch tab',
      icon: t.icon,
      keywords: [t.id, ...t.keywords],
      tabId: t.id,
    });
  }

  for (const m of PALETTE_MODALS) {
    items.push({
      id: `modal:${m.modalName}`,
      category: 'modal',
      label: m.label,
      subtitle: m.subtitle,
      icon: m.icon,
      keywords: [m.modalName, ...m.keywords],
      modalName: m.modalName,
    });
  }

  const rawHeroes = cache?.heroGetAll?.data;
  if (rawHeroes && typeof rawHeroes === 'object') {
    const heroList = Array.isArray(rawHeroes) ? rawHeroes : Object.values(rawHeroes);
    const sorted = heroList
      .filter((h: any) => h && typeof h === 'object' && Number(h.id) > 0)
      .sort((a: any, b: any) => (Number(b.power) || 0) - (Number(a.power) || 0));

    for (const h of sorted) {
      const id = Number(h.id);
      const name = getHeroName(id) || `Hero #${id}`;
      const power = Number(h.power) || 0;
      const star = Number(h.star) || 0;
      const level = Number(h.level) || 0;
      const powerStr = power >= 1000 ? `${Math.round(power / 1000)}K` : String(power);
      items.push({
        id: `hero:${id}`,
        category: 'hero',
        label: name,
        subtitle: `Lv.${level} · ★${star} · ⚡${powerStr}`,
        icon: '🦸',
        keywords: [String(id), name.toLowerCase(), 'hero'],
        modalName: 'hero',
        hero: h,
      });
    }
  }

  return items;
}

/**
 * Filters and ranks Command Palette items by query (prefix/title matches ranked above keyword matches).
 */
export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  query: string,
  limit = 14
): CommandPaletteItem[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    // Default quick view: all modals + tabs first, then top heroes
    return items.slice(0, limit);
  }

  const scored: Array<{ item: CommandPaletteItem; score: number }> = [];
  for (const item of items) {
    const labelLower = item.label.toLowerCase();
    const subLower = item.subtitle.toLowerCase();
    let score = 0;

    if (labelLower === q) score = 100;
    else if (labelLower.startsWith(q)) score = 80;
    else if (labelLower.includes(q)) score = 60;
    else if (item.keywords.some((kw) => kw.toLowerCase().startsWith(q))) score = 40;
    else if (item.keywords.some((kw) => kw.toLowerCase().includes(q)) || subLower.includes(q)) score = 20;

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Applies a Compact or Show-All visibility preset to `tabSettings` while preserving custom drag-and-drop order.
 */
export function applyTabPreset<T extends { id: string; visible: boolean }>(
  tabs: T[],
  preset: 'compact' | 'all'
): T[] {
  return tabs.map((t) => ({
    ...t,
    visible: preset === 'all' ? true : COMPACT_TAB_IDS.has(t.id),
  }));
}
