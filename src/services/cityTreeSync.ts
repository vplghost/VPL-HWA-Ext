/**
 * Building & Research Tree Data Sync Engine (`cityTreeSync.ts`).
 * Pure compilers, MD5 drift detection, diff reporting, and runtime hot-overlay
 * application shared between the extension UI and `scripts/sync-city-trees.mjs`.
 */
import type { BuildingLevelsDict } from '../types/game/building.ts';
import type { ResearchDataDict } from '../types/game/research.ts';
import { setBuildingLevelsOverlay } from '../data/buildingData.ts';
import { setResearchDataOverlay } from '../data/researchData.ts';
import { setCityNameOverlay } from '../data/nameData.ts';

export const CITY_TREE_OVERLAY_STORAGE_KEY = 'cityTreeOverlay';

export const CITY_TREE_CONFIG_KEYS = [
  'building',
  'buildingLevel',
  'buildingGroups',
  'personalResearch',
  'personalResearchLevel',
  'personalResearchType',
  'strategicLocalization',
] as const;

export type CityTreeConfigKey = (typeof CITY_TREE_CONFIG_KEYS)[number];

export interface RemoteConfigEntry {
  url: string;
  md5: string | null;
}

export interface CityTreeManifest {
  updatedAt: string;
  configs: Partial<Record<CityTreeConfigKey, RemoteConfigEntry>>;
}

export interface CityTreeOverlay {
  updatedAt: string;
  manifest: CityTreeManifest;
  buildingLevels?: BuildingLevelsDict;
  researchData?: ResearchDataDict;
  buildingNames?: Record<string, string>;
  researchNames?: Record<string, string>;
}

export interface CityTreeDriftReport {
  hasDrift: boolean;
  changedConfigs: Array<{
    key: CityTreeConfigKey;
    currentMd5: string | null;
    remoteMd5: string | null;
    url: string;
  }>;
  unknownBuildingIds: number[];
  unknownResearchIds: number[];
  summary: string;
}

export interface CityTreeDiffReport {
  addedBuildings: Array<{ id: number; name?: string }>;
  modifiedBuildings: number[];
  addedResearches: Array<{ id: number; name?: string }>;
  modifiedResearches: number[];
}

export function extractMd5FromUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/([a-f0-9]{32})\.json(?:$|\?)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extracts only the 7 Building/Research/Localization config entries from a
 * `remoteConfigInit` response (`response.index.configs` or `response.configs`).
 */
export function extractRemoteConfigSubset(
  rawConfigs: Record<string, any> | null | undefined
): Partial<Record<CityTreeConfigKey, RemoteConfigEntry>> {
  const out: Partial<Record<CityTreeConfigKey, RemoteConfigEntry>> = {};
  if (!rawConfigs || typeof rawConfigs !== 'object') return out;
  for (const key of CITY_TREE_CONFIG_KEYS) {
    const entry = rawConfigs[key];
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (typeof url === 'string' && url.startsWith('http')) {
      out[key] = {
        url,
        md5: extractMd5FromUrl(url),
      };
    }
  }
  return out;
}

/**
 * Parses server duration formats (`"d.hh:mm:ss"`, `"hh:mm:ss"`, or numeric seconds) into seconds.
 */
export function parseRemoteDurationSeconds(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Math.round(Number(trimmed)));

  let days = 0;
  let timePart = trimmed;
  const dotIdx = trimmed.indexOf('.');
  const colonIdx = trimmed.indexOf(':');
  if (dotIdx !== -1 && (colonIdx === -1 || dotIdx < colonIdx)) {
    days = Number(trimmed.slice(0, dotIdx)) || 0;
    timePart = trimmed.slice(dotIdx + 1);
  }
  const parts = timePart.split(':').map((p) => Number(p) || 0);
  if (parts.length === 3) {
    return Math.max(0, Math.round(days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2]));
  }
  if (parts.length === 2) {
    return Math.max(0, Math.round(days * 86400 + parts[0] * 60 + parts[1]));
  }
  return 0;
}

/**
 * Compiles raw `buildingLevel.json` remote config into compact `BuildingLevelsDict`.
 */
export function compileBuildingLevels(rawBuildingLevel: any): {
  buildingLevels: BuildingLevelsDict;
  legacyDurations: Record<string, Record<string, number>>;
} {
  const buildingLevels: BuildingLevelsDict = {};
  const legacyDurations: Record<string, Record<string, number>> = {};
  const items = Array.isArray(rawBuildingLevel)
    ? rawBuildingLevel
    : rawBuildingLevel && typeof rawBuildingLevel === 'object'
      ? Object.values(rawBuildingLevel)
      : [];

  for (const item of items as any[]) {
    const bId = Number(item?.buildingId);
    const lvl = Number(item?.level);
    if (!Number.isInteger(bId) || bId <= 0 || !Number.isInteger(lvl) || lvl <= 0) continue;

    const reqs: [number, number][] = [];
    for (const r of Array.isArray(item.requirements) ? item.requirements : []) {
      if (r?.name === 'buildingLevel' && r.args?.entityId && r.args?.operands?.[0]) {
        const reqId = Number(r.args.entityId);
        const reqLvl = Number(r.args.operands[0]);
        if (reqId > 0 && reqLvl > 0 && reqId !== bId) {
          reqs.push([reqId, reqLvl]);
        }
      }
    }

    const cost: Record<number, number> = {};
    for (const c of Array.isArray(item.cost) ? item.cost : []) {
      if (c?.type === 'material' && Number(c.amount) > 0 && Number(c.id) > 0) {
        cost[Number(c.id)] = Number(c.amount);
      }
    }

    const durationSec = parseRemoteDurationSeconds(item.duration);
    if (typeof item.duration === 'string' && item.duration.includes('.')) {
      const [hours, minutes, seconds] = item.duration.split(':').map(Number);
      const legacy = hours * 3600 + minutes * 60 + seconds;
      if (Number.isFinite(legacy) && legacy !== durationSec) {
        (legacyDurations[String(bId)] ||= {})[String(lvl)] = legacy;
      }
    }

    const bKey = String(bId);
    if (!buildingLevels[bKey]) buildingLevels[bKey] = {};
    buildingLevels[bKey][String(lvl)] = {
      d: durationSec,
      ...(reqs.length > 0 ? { r: reqs } : {}),
      ...(Object.keys(cost).length > 0 ? { c: cost } : {}),
    };
  }

  return { buildingLevels, legacyDurations };
}

/**
 * Compiles raw `personalResearch.json` + `personalResearchLevel.json` into compact `ResearchDataDict`.
 */
export function compileResearchData(
  rawResearch: any,
  rawResearchLevel: any,
  rawResearchTypes?: any
): ResearchDataDict {
  const out: ResearchDataDict = {};
  const typeById = new Map<string | number, string>();

  const typeItems = Array.isArray(rawResearchTypes)
    ? rawResearchTypes
    : rawResearchTypes && typeof rawResearchTypes === 'object'
      ? Object.values(rawResearchTypes)
      : [];
  for (const t of typeItems as any[]) {
    if (t?.id != null && typeof (t.code || t.ident || t.name) === 'string') {
      typeById.set(t.id, String(t.code || t.ident || t.name));
    }
  }

  const branchByResearchId = new Map<number, string>();
  const researchItems = Array.isArray(rawResearch)
    ? rawResearch
    : rawResearch && typeof rawResearch === 'object'
      ? Object.values(rawResearch)
      : [];
  for (const r of researchItems as any[]) {
    const id = Number(r?.id ?? r?.researchId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const rawBranch =
      r.type ??
      r.branch ??
      r.category ??
      (r.personalResearchTypeId != null ? typeById.get(r.personalResearchTypeId) : undefined);
    if (typeof rawBranch === 'string' && rawBranch.trim()) {
      branchByResearchId.set(id, rawBranch.trim());
    }
  }

  const levelItems = Array.isArray(rawResearchLevel)
    ? rawResearchLevel
    : rawResearchLevel && typeof rawResearchLevel === 'object'
      ? Object.values(rawResearchLevel)
      : [];
  for (const item of levelItems as any[]) {
    const rId = Number(item?.personalResearchId ?? item?.researchId);
    const lvl = Number(item?.level);
    if (!Number.isInteger(rId) || rId <= 0 || !Number.isInteger(lvl) || lvl <= 0) continue;

    let reqAcademyLevel: number | undefined;
    const reqs: [number, number][] = [];
    for (const req of Array.isArray(item.requirements) ? item.requirements : []) {
      const reqName = String(req?.name || '');
      const entId = Number(req?.args?.entityId);
      const op0 = Number(req?.args?.operands?.[0]);
      if (reqName === 'buildingLevel' && op0 > 0) {
        reqAcademyLevel = op0;
      } else if ((reqName === 'personalResearchLevel' || reqName === 'researchLevel') && entId > 0 && op0 > 0 && entId !== rId) {
        reqs.push([entId, op0]);
      }
    }

    const cost: Record<number, number> = {};
    for (const c of Array.isArray(item.cost) ? item.cost : []) {
      if (c?.type === 'material' && Number(c.amount) > 0 && Number(c.id) > 0) {
        cost[Number(c.id)] = Number(c.amount);
      }
    }

    const rKey = String(rId);
    if (!out[rKey]) {
      out[rKey] = {} as any;
    }
    const branch = branchByResearchId.get(rId);
    if (branch && !(out[rKey] as any).t) {
      (out[rKey] as any).t = branch;
    }
    (out[rKey] as any)[String(lvl)] = {
      d: parseRemoteDurationSeconds(item.duration),
      ...(reqAcademyLevel != null ? { b: reqAcademyLevel } : {}),
      ...(reqs.length > 0 ? { r: reqs } : {}),
      ...(Object.keys(cost).length > 0 ? { c: cost } : {}),
    };
  }

  return out;
}

/**
 * Resolves English display names for Buildings and Researches from `strategicLocalization`
 * combined with `building` and `personalResearch` config tables.
 */
export function extractStrategicNames(
  rawBuilding: any,
  rawResearch: any,
  rawLocalization: any
): { buildingNames: Record<string, string>; researchNames: Record<string, string> } {
  const buildingNames: Record<string, string> = {};
  const researchNames: Record<string, string> = {};

  const locMap: Record<string, string> = {};
  if (rawLocalization && typeof rawLocalization === 'object') {
    if (Array.isArray(rawLocalization)) {
      for (const row of rawLocalization) {
        if (row?.key && typeof (row.value ?? row.text) === 'string') {
          locMap[String(row.key)] = String(row.value ?? row.text);
        }
      }
    } else {
      for (const [k, v] of Object.entries(rawLocalization)) {
        if (typeof v === 'string') locMap[k] = v;
        else if (v && typeof v === 'object' && typeof (v as any).value === 'string') locMap[k] = (v as any).value;
      }
    }
  }

  const resolveLoc = (item: any, fallbackPatterns: string[]): string | null => {
    const candidateKeys: string[] = [];
    for (const field of ['title', 'name', 'localizationKey', 'nameKey', 'titleKey', 'locKey']) {
      if (typeof item?.[field] === 'string' && item[field].trim()) {
        candidateKeys.push(item[field].trim());
      }
    }
    candidateKeys.push(...fallbackPatterns);
    for (const key of candidateKeys) {
      if (typeof locMap[key] === 'string' && locMap[key].trim()) {
        return locMap[key].trim();
      }
    }
    if (typeof item?.name === 'string' && item.name.trim() && !/^[A-Z0-9_]+$/.test(item.name.trim())) {
      return item.name.trim();
    }
    return null;
  };

  const bItems = Array.isArray(rawBuilding)
    ? rawBuilding
    : rawBuilding && typeof rawBuilding === 'object'
      ? Object.values(rawBuilding)
      : [];
  for (const b of bItems as any[]) {
    const id = Number(b?.id ?? b?.buildingId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const name = resolveLoc(b, [
      `BUILDING_${id}_NAME`,
      `BUILDING_NAME_${id}`,
      `building_${id}_name`,
      `building_name_${id}`,
    ]);
    if (name) buildingNames[String(id)] = name;
  }

  const rItems = Array.isArray(rawResearch)
    ? rawResearch
    : rawResearch && typeof rawResearch === 'object'
      ? Object.values(rawResearch)
      : [];
  for (const r of rItems as any[]) {
    const id = Number(r?.id ?? r?.researchId);
    if (!Number.isInteger(id) || id <= 0) continue;
    const name = resolveLoc(r, [
      `PERSONAL_RESEARCH_${id}_NAME`,
      `RESEARCH_${id}_NAME`,
      `personal_research_${id}_name`,
      `research_${id}_name`,
    ]);
    if (name) researchNames[String(id)] = name;
  }

  return { buildingNames, researchNames };
}

/**
 * Detects whether the server's remote-config MD5s or live account building/research IDs
 * have drifted from the currently active manifest / static dataset.
 */
export function detectCityTreeDrift(params: {
  remoteConfigIndex?: Partial<Record<CityTreeConfigKey, RemoteConfigEntry>> | null;
  manifest?: CityTreeManifest | null;
  liveBuildingIds?: number[];
  liveResearchIds?: number[];
  knownBuildingIds?: Set<number>;
  knownResearchIds?: Set<number>;
}): CityTreeDriftReport {
  const changedConfigs: CityTreeDriftReport['changedConfigs'] = [];
  const remote = params.remoteConfigIndex || {};
  const manifestConfigs = params.manifest?.configs || {};

  for (const key of CITY_TREE_CONFIG_KEYS) {
    const rEntry = remote[key];
    if (!rEntry?.url) continue;
    const mEntry = manifestConfigs[key];
    const currentMd5 = mEntry?.md5 || extractMd5FromUrl(mEntry?.url);
    const remoteMd5 = rEntry.md5 || extractMd5FromUrl(rEntry.url);
    if (remoteMd5 && remoteMd5 !== currentMd5) {
      changedConfigs.push({ key, currentMd5, remoteMd5, url: rEntry.url });
    }
  }

  const unknownBuildingIds = (params.liveBuildingIds || []).filter(
    (id) => Number.isInteger(id) && id > 0 && params.knownBuildingIds && !params.knownBuildingIds.has(id)
  );
  const unknownResearchIds = (params.liveResearchIds || []).filter(
    (id) => Number.isInteger(id) && id > 0 && params.knownResearchIds && !params.knownResearchIds.has(id)
  );

  const hasDrift =
    changedConfigs.length > 0 || unknownBuildingIds.length > 0 || unknownResearchIds.length > 0;
  const parts: string[] = [];
  if (changedConfigs.length > 0) parts.push(`${changedConfigs.length} remote config(s) updated`);
  if (unknownBuildingIds.length > 0) parts.push(`${unknownBuildingIds.length} unknown building ID(s)`);
  if (unknownResearchIds.length > 0) parts.push(`${unknownResearchIds.length} unknown research ID(s)`);

  return {
    hasDrift,
    changedConfigs,
    unknownBuildingIds: [...new Set(unknownBuildingIds)].sort((a, b) => a - b),
    unknownResearchIds: [...new Set(unknownResearchIds)].sort((a, b) => a - b),
    summary: hasDrift ? parts.join(' · ') : 'Up to date with remote config',
  };
}

export function diffCityTreeData(params: {
  prevBuildings: BuildingLevelsDict;
  nextBuildings: BuildingLevelsDict;
  prevResearch: ResearchDataDict;
  nextResearch: ResearchDataDict;
  nextBuildingNames?: Record<string, string>;
  nextResearchNames?: Record<string, string>;
}): CityTreeDiffReport {
  const addedBuildings: Array<{ id: number; name?: string }> = [];
  const modifiedBuildings: number[] = [];
  for (const [idStr, levels] of Object.entries(params.nextBuildings || {})) {
    const id = Number(idStr);
    if (!params.prevBuildings?.[idStr]) {
      addedBuildings.push({ id, name: params.nextBuildingNames?.[idStr] });
    } else if (JSON.stringify(params.prevBuildings[idStr]) !== JSON.stringify(levels)) {
      modifiedBuildings.push(id);
    }
  }

  const addedResearches: Array<{ id: number; name?: string }> = [];
  const modifiedResearches: number[] = [];
  for (const [idStr, levels] of Object.entries(params.nextResearch || {})) {
    const id = Number(idStr);
    if (!params.prevResearch?.[idStr]) {
      addedResearches.push({ id, name: params.nextResearchNames?.[idStr] });
    } else if (JSON.stringify(params.prevResearch[idStr]) !== JSON.stringify(levels)) {
      modifiedResearches.push(id);
    }
  }

  return {
    addedBuildings: addedBuildings.sort((a, b) => a.id - b.id),
    modifiedBuildings: modifiedBuildings.sort((a, b) => a - b),
    addedResearches: addedResearches.sort((a, b) => a.id - b.id),
    modifiedResearches: modifiedResearches.sort((a, b) => a - b),
  };
}

/**
 * Applies a runtime overlay to in-memory Building, Research, and Name lookup tables.
 */
export function applyCityTreeOverlay(overlay: CityTreeOverlay | null): void {
  if (!overlay) {
    setBuildingLevelsOverlay(null);
    setResearchDataOverlay(null);
    setCityNameOverlay(null);
    return;
  }
  setBuildingLevelsOverlay(overlay.buildingLevels || null);
  setResearchDataOverlay(overlay.researchData || null);
  setCityNameOverlay({
    building: overlay.buildingNames || undefined,
    research: overlay.researchNames || undefined,
  });
}

export async function loadCityTreeOverlayFromStorage(cr?: any): Promise<CityTreeOverlay | null> {
  const storage = cr?.storage?.local ?? (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
  if (!storage?.get) return null;
  try {
    const stored = await storage.get([CITY_TREE_OVERLAY_STORAGE_KEY]);
    const overlay = stored?.[CITY_TREE_OVERLAY_STORAGE_KEY] || null;
    if (overlay && typeof overlay === 'object') {
      applyCityTreeOverlay(overlay);
      return overlay;
    }
  } catch {}
  return null;
}
