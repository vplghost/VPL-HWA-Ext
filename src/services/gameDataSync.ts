/**
 * Unified Game Data Sync Engine (`gameDataSync.ts`).
 * Extends `cityTreeSync.ts` to cover Hero, Faction, Role, Class, and Artifact remote configs
 * with strict additive-safe merge rules and runtime hot-overlay support.
 */
import type { HeroMetadataItem, HeroMetadataDict, HeroRole, HeroClass, HeroFaction } from '../types/game/hero.ts';
import {
  CITY_TREE_CONFIG_KEYS,
  extractMd5FromUrl,
  applyCityTreeOverlay,
  type CityTreeOverlay,
  type RemoteConfigEntry,
} from './cityTreeSync.ts';
import { setGameNameOverlay } from '../data/nameData.ts';
import { setHeroMetadataOverlay } from '../data/heroMetadata.ts';

export const GAME_DATA_OVERLAY_STORAGE_KEY = 'gameDataOverlay';

export const HERO_ARTIFACT_CONFIG_KEYS = [
  'hero',
  'heroFaction',
  'heroFactionByHero',
  'heroRole',
  'heroClass',
  'artifact',
  'artifactType',
  'itemColor',
] as const;

export const GAME_DATA_CONFIG_KEYS = [
  ...CITY_TREE_CONFIG_KEYS,
  ...HERO_ARTIFACT_CONFIG_KEYS,
] as const;

export type GameDataConfigKey = (typeof GAME_DATA_CONFIG_KEYS)[number];

export interface GameDataManifest {
  updatedAt: string;
  configs: Partial<Record<GameDataConfigKey, RemoteConfigEntry>>;
}

export interface GameDataOverlay {
  updatedAt: string;
  manifest: GameDataManifest;
  cityOverlay?: CityTreeOverlay | null;
  heroMetadata?: Record<string, Partial<HeroMetadataItem>>;
  names?: {
    building?: Record<string, string>;
    research?: Record<string, string>;
    hero?: Record<string, string>;
    titan?: Record<string, string>;
    artifact?: Record<string, string>;
  };
}

export interface GameDataDriftReport {
  hasDrift: boolean;
  changedConfigs: string[];
  unknownBuildingIds: number[];
  unknownResearchIds: number[];
  unknownHeroIds: number[];
  unknownTitanIds: number[];
  summary: string;
}

export function extractGameDataConfigSubset(
  rawConfigs: Record<string, any> | null | undefined
): Partial<Record<GameDataConfigKey, RemoteConfigEntry>> {
  const out: Partial<Record<GameDataConfigKey, RemoteConfigEntry>> = {};
  if (!rawConfigs || typeof rawConfigs !== 'object') return out;
  for (const key of GAME_DATA_CONFIG_KEYS) {
    const entry = rawConfigs[key];
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (typeof url === 'string' && url.length > 0) {
      out[key] = {
        url,
        md5: (typeof entry?.md5 === 'string' ? entry.md5 : null) || extractMd5FromUrl(url),
      };
    }
  }
  return out;
}

function normalizeCollection(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([k, v]) => (v && typeof v === 'object' ? { id: v.id ?? Number(k), ...v } : { id: Number(k), value: v }));
  }
  return [];
}

function resolveLocString(loc: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    if (k && typeof loc[k] === 'string' && loc[k].trim()) {
      return loc[k].trim();
    }
  }
  return null;
}

/**
 * Compiles Hero metadata (name, role, class, faction) from remoteConfigInit tables.
 */
export function compileHeroRemoteMetadata(params: {
  rawHero?: any;
  rawFaction?: any;
  rawFactionByHero?: any;
  rawRole?: any;
  rawClass?: any;
  rawLocalization?: Record<string, string> | null;
}): {
  heroMetadata: Record<string, Partial<HeroMetadataItem>>;
  heroNames: Record<string, string>;
} {
  const loc = params.rawLocalization && typeof params.rawLocalization === 'object' ? params.rawLocalization : {};
  const factionNameById = new Map<string, string>();
  for (const f of normalizeCollection(params.rawFaction)) {
    const id = String(f?.id ?? f?.factionId ?? '');
    if (!id) continue;
    const resolved =
      resolveLocString(loc, [f?.title, f?.nameKey, `HERO_FACTION_${id}_NAME`, `LIB_FACTION_${id}_NAME`]) ||
      (typeof f?.name === 'string' ? f.name.trim() : '');
    if (resolved) factionNameById.set(id, resolved);
  }

  const factionByHeroId = new Map<number, string>();
  for (const row of normalizeCollection(params.rawFactionByHero)) {
    const heroId = Number(row?.heroId ?? row?.id);
    const factionId = String(row?.factionId ?? row?.heroFactionId ?? row?.value ?? '');
    if (Number.isInteger(heroId) && heroId > 0 && factionId) {
      factionByHeroId.set(heroId, factionNameById.get(factionId) || factionId);
    }
  }

  const roleById = new Map<string, string>();
  for (const r of normalizeCollection(params.rawRole)) {
    const id = String(r?.id ?? r?.roleId ?? '');
    if (!id) continue;
    const resolved =
      resolveLocString(loc, [r?.title, r?.nameKey, `HERO_ROLE_${id}_NAME`]) ||
      (typeof r?.name === 'string' ? r.name.trim() : '');
    if (resolved) roleById.set(id, resolved);
  }

  const classById = new Map<string, string>();
  for (const c of normalizeCollection(params.rawClass)) {
    const id = String(c?.id ?? c?.classId ?? '');
    if (!id) continue;
    const resolved =
      resolveLocString(loc, [c?.title, c?.nameKey, `HERO_CLASS_${id}_NAME`]) ||
      (typeof c?.name === 'string' ? c.name.trim() : '');
    if (resolved) classById.set(id, resolved);
  }

  const heroMetadata: Record<string, Partial<HeroMetadataItem>> = {};
  const heroNames: Record<string, string> = {};

  for (const h of normalizeCollection(params.rawHero)) {
    const id = Number(h?.id ?? h?.heroId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const strId = String(id);
    const name =
      resolveLocString(loc, [
        h?.nameKey,
        h?.title,
        `LIB_HERO_NAME_${id}`,
        `HERO_${id}_NAME`,
        `STRATEGIC_HERO_${id}_NAME`,
      ]) ||
      (typeof h?.name === 'string' && !/^[A-Z0-9_]+$/.test(h.name.trim()) ? h.name.trim() : null);

    const roleRaw = h?.role != null ? (roleById.get(String(h.role)) || String(h.role)) : (h?.roleId != null ? roleById.get(String(h.roleId)) : undefined);
    const classRaw = h?.class != null ? (classById.get(String(h.class)) || String(h.class)) : (h?.classId != null ? classById.get(String(h.classId)) : undefined);
    const factionRaw =
      factionByHeroId.get(id) ||
      (h?.factionId != null ? factionNameById.get(String(h.factionId)) : undefined) ||
      (typeof h?.faction === 'string' ? h.faction : undefined);

    if (name) heroNames[strId] = name;
    heroMetadata[strId] = {
      ...(name ? { name } : {}),
      ...(roleRaw ? { role: roleRaw as HeroRole } : {}),
      ...(classRaw ? { class: classRaw as HeroClass } : {}),
      ...(factionRaw ? { faction: factionRaw as HeroFaction } : {}),
    };
  }

  return { heroMetadata, heroNames };
}

/**
 * Additive-safe merge for name maps: ONLY adds missing IDs, NEVER overwrites existing custom overrides.
 */
export function mergeNamesAdditiveSafe(
  existingNames: Record<string, string> | null | undefined,
  incomingNames: Record<string, string> | null | undefined
): { merged: Record<string, string>; addedIds: string[] } {
  const existing = existingNames && typeof existingNames === 'object' ? existingNames : {};
  const incoming = incomingNames && typeof incomingNames === 'object' ? incomingNames : {};
  const addedIds: string[] = [];
  for (const k of Object.keys(incoming)) {
    if (!Object.hasOwn(existing, k) && incoming[k]) {
      addedIds.push(k);
    }
  }
  return {
    merged: { ...incoming, ...existing },
    addedIds,
  };
}

/**
 * Additive-safe merge for heroMetadata: preserves 100% of curated fields (skills, equipment, avatarFile,
 * hasAvatar, custom name) on existing heroes, adds new hero IDs, and fills missing/Unknown role/class/faction.
 */
export function mergeHeroMetadataAdditiveSafe(
  existingMeta: HeroMetadataDict | Record<string, HeroMetadataItem>,
  incomingMeta: Record<string, Partial<HeroMetadataItem>>
): { merged: Record<string, HeroMetadataItem>; addedIds: string[]; enrichedIds: string[] } {
  const merged: Record<string, HeroMetadataItem> = { ...existingMeta };
  const addedIds: string[] = [];
  const enrichedIds: string[] = [];

  for (const [id, inc] of Object.entries(incomingMeta || {})) {
    if (!inc || typeof inc !== 'object') continue;
    const prev = merged[id];
    if (!prev) {
      merged[id] = {
        name: inc.name || `Hero #${id}`,
        role: (inc.role || 'Unknown') as HeroRole,
        class: (inc.class || 'Unknown') as HeroClass,
        faction: (inc.faction || 'Unknown') as HeroFaction,
        hasAvatar: false,
      };
      addedIds.push(id);
    } else {
      let changed = false;
      const next: HeroMetadataItem = { ...prev };
      if ((!prev.role || prev.role === 'Unknown') && inc.role && inc.role !== 'Unknown') {
        next.role = inc.role as HeroRole;
        changed = true;
      }
      if ((!prev.class || prev.class === 'Unknown') && inc.class && inc.class !== 'Unknown') {
        next.class = inc.class as HeroClass;
        changed = true;
      }
      if ((!prev.faction || prev.faction === 'Unknown') && inc.faction && inc.faction !== 'Unknown') {
        next.faction = inc.faction as HeroFaction;
        changed = true;
      }
      if (changed) {
        merged[id] = next;
        enrichedIds.push(id);
      }
    }
  }

  return { merged, addedIds, enrichedIds };
}

/**
 * Detects MD5 drift across all tracked Game Data remote configs AND unknown live IDs
 * for buildings, researches, heroes, and titans.
 */
export function detectGameDataDrift(params: {
  remoteConfigIndex?: Partial<Record<GameDataConfigKey, RemoteConfigEntry>> | null;
  manifest?: GameDataManifest | null;
  liveBuildingIds?: number[];
  liveResearchIds?: number[];
  liveHeroIds?: number[];
  liveTitanIds?: number[];
  knownBuildingIds?: Set<number>;
  knownResearchIds?: Set<number>;
  knownHeroIds?: Set<number>;
  knownTitanIds?: Set<number>;
}): GameDataDriftReport {
  const changedConfigs: string[] = [];
  const rc = params.remoteConfigIndex || {};
  const base = params.manifest?.configs || {};

  for (const key of GAME_DATA_CONFIG_KEYS) {
    const liveMd5 = rc[key]?.md5 || extractMd5FromUrl(rc[key]?.url);
    const baseMd5 = base[key]?.md5 || extractMd5FromUrl(base[key]?.url);
    if (liveMd5 && baseMd5 && liveMd5 !== baseMd5) {
      changedConfigs.push(key);
    } else if (liveMd5 && !baseMd5) {
      changedConfigs.push(key);
    }
  }

  const findUnknown = (live?: number[], known?: Set<number>) =>
    Array.isArray(live) && known
      ? [...new Set(live.map(Number).filter((id) => Number.isInteger(id) && id > 0 && !known.has(id)))]
      : [];

  const unknownBuildingIds = findUnknown(params.liveBuildingIds, params.knownBuildingIds);
  const unknownResearchIds = findUnknown(params.liveResearchIds, params.knownResearchIds);
  const unknownHeroIds = findUnknown(params.liveHeroIds, params.knownHeroIds);
  const unknownTitanIds = findUnknown(params.liveTitanIds, params.knownTitanIds);

  const hasDrift =
    changedConfigs.length > 0 ||
    unknownBuildingIds.length > 0 ||
    unknownResearchIds.length > 0 ||
    unknownHeroIds.length > 0 ||
    unknownTitanIds.length > 0;

  const parts: string[] = [];
  if (changedConfigs.length > 0) parts.push(`${changedConfigs.length} remote config(s) updated`);
  if (unknownBuildingIds.length > 0) parts.push(`${unknownBuildingIds.length} new building(s)`);
  if (unknownResearchIds.length > 0) parts.push(`${unknownResearchIds.length} new research(es)`);
  if (unknownHeroIds.length > 0) parts.push(`${unknownHeroIds.length} new hero(es)`);
  if (unknownTitanIds.length > 0) parts.push(`${unknownTitanIds.length} new titan(s)`);

  return {
    hasDrift,
    changedConfigs,
    unknownBuildingIds,
    unknownResearchIds,
    unknownHeroIds,
    unknownTitanIds,
    summary: parts.length > 0 ? parts.join(' · ') : 'Up to date with remote config',
  };
}

/**
 * Applies a unified GameDataOverlay into runtime nameData, heroMetadata, and cityTree overlays.
 */
export function applyGameDataOverlay(overlay: GameDataOverlay | null): void {
  if (!overlay) {
    applyCityTreeOverlay(null);
    setGameNameOverlay(null);
    setHeroMetadataOverlay(null);
    return;
  }
  if (overlay.cityOverlay) {
    applyCityTreeOverlay(overlay.cityOverlay);
  }
  if (overlay.names) {
    setGameNameOverlay(overlay.names);
  }
  if (overlay.heroMetadata) {
    setHeroMetadataOverlay(overlay.heroMetadata);
  }
}
