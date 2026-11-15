import '~/extension/hero-metadata.js';
import '~/extension/titan-metadata.js';
import '~/extension/data-names.js';
import '~/extension/item-resources.js';
import '~/extension/name-map.js';
import '~/extension/popup-data.js';
import '~/extension/building-data.js';
import '~/extension/building-queue.js';
import '~/extension/research-data.js';
import '~/extension/research-queue.js';
import '~/extension/campaign-missions.js';
import '~/extension/quest-data.js';
import '~/extension/experimental-data.js';
import '~/extension/tower-buffs.js';
import '~/extension/tower-rules.js';
import '~/extension/tower-automation.js';
import '~/extension/clan-versus-rules.js';

import { heroMetadata, getHeroMetadata as getTypedHeroMetadata } from '../data/heroMetadata.ts';
import { titanMetadata, getTitanMetadata as getTypedTitanMetadata } from '../data/titanMetadata.ts';
import { getItemName as typedGetItemName, getBuildingName as typedGetBuildingName, getResearchName as typedGetResearchName } from '../data/nameData.ts';

export interface HeroMeta {
  name: string;
  role?: string;
  class?: string;
  faction?: string;
  hasAvatar?: boolean;
  avatarFile?: string;
  skills?: string[];
  equipment?: Record<string, number[]>;
}

export interface TitanMeta {
  name: string;
  role?: string;
  element?: string;
  hasAvatar?: boolean;
  avatarFile?: string;
  artifacts?: number[];
}

export function getHeroMetadata(heroId: number | string): HeroMeta | undefined {
  const meta = (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperHeroMetadata?.[String(heroId)])
    ?? getTypedHeroMetadata(heroId);
  return (meta as HeroMeta) || undefined;
}

export function getAllHeroMetadata(): Record<string, HeroMeta> {
  return (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperHeroMetadata) || (heroMetadata as any);
}

export function getTitanMetadata(titanId: number | string): TitanMeta | undefined {
  const meta = (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperTitanMetadata?.[String(titanId)])
    ?? getTypedTitanMetadata(titanId);
  return (meta as TitanMeta) || undefined;
}

export function getAllTitanMetadata(): Record<string, TitanMeta> {
  return (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperTitanMetadata) || (titanMetadata as any);
}

export function getHeroEquipmentRank(color: number | string) {
  return (globalThis as any).hwaHelperPopupData?.getHeroEquipmentRank?.(color);
}

export function getHeroSoulProgress(heroId: string | number, hero: any, inventory: any) {
  return (globalThis as any).hwaHelperPopupData?.heroSoulProgress?.(String(heroId), hero, inventory);
}

export function getTitanSoulProgress(titanId: string | number, titan: any, inventory: any) {
  return (globalThis as any).hwaHelperPopupData?.titanSoulProgress?.(String(titanId), titan, inventory);
}

const worldMaterialNames: Record<number, string> = {
  1: 'Elarite Shards',
  2: 'Iron',
  3: 'Stone',
  4: 'Wood',
  5: 'Food',
  12: 'Honor Marks',
};

export function getItemName(category: string, id: number | string): string {
  const strId = String(id);
  const numId = Number(id);

  if (category === 'material' && Number.isInteger(numId) && worldMaterialNames[numId]) {
    return worldMaterialNames[numId];
  }
  if (category === 'fragmentHero') {
    const hName = getHeroName(strId);
    return `${hName} Soul Stone`;
  }
  if (category === 'fragmentTitan') {
    const tMeta = getTitanMetadata(strId);
    return `${tMeta?.name || `Titan #${strId}`} Titan Soul Stone`;
  }
  if (category === 'fragmentGear') {
    const gName = (globalThis as any).hwaHelperNameData?.names?.gear?.[strId] || `Gear #${strId}`;
    return `${gName} Fragment`;
  }
  if (category === 'fragmentArtifact') {
    const aName = (globalThis as any).hwaHelperNameData?.names?.artifact?.[strId] || `Artifact #${strId}`;
    return `${aName} Fragment`;
  }
  if (category === 'fragmentScroll') {
    const sName = (globalThis as any).hwaHelperNameData?.names?.scroll?.[strId] || `Scroll #${strId}`;
    return `${sName} Fragment`;
  }

  const typedItem = typeof typedGetItemName === 'function' ? typedGetItemName(category, strId) : null;
  if (typedItem) return typedItem;
  const nameMap = (globalThis as any).hwaHelperNameMap;
  const nameData = (globalThis as any).hwaHelperNameData?.names;
  return nameData?.[category]?.[strId] || nameMap?.item?.(category, strId) || `${category} #${strId}`;
}

export function downloadJson(filename: string, data: any) {
  if (!data || (Array.isArray(data) && !data.length)) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getHeroName(heroId: number | string): string {
  const meta = getHeroMetadata(heroId);
  if (meta?.name) return meta.name;
  const nameMap = (globalThis as any).hwaHelperNameMap;
  return nameMap?.hero?.(heroId) || `Hero #${heroId}`;
}

export function getGearCraftData(gearId: number | string) {
  return (globalThis as any).hwaHelperGearCraftData?.[String(gearId)];
}

export function getBuildingName(id: number | string): string {
  const typedBuilding = typeof typedGetBuildingName === 'function' ? typedGetBuildingName(id) : null;
  if (typedBuilding) return typedBuilding;
  const nameMap = (globalThis as any).hwaHelperNameMap;
  return nameMap?.building?.(id) || (id ? `Building #${id}` : 'Building');
}

export function getResearchName(id: number | string): string {
  const typedResearch = typeof typedGetResearchName === 'function' ? typedGetResearchName(id) : null;
  if (typedResearch) return typedResearch;
  const nameMap = (globalThis as any).hwaHelperNameMap;
  return nameMap?.research?.(id) || (id ? `Research #${id}` : 'Research');
}

export { buildGearRecipeTree, findFirstUnfulfilledNode } from './recipeTree.ts';

export function starGlowClass(starCount: number, isLarge = false) {
  const prefix = isLarge ? 'avatar-star-lg-' : 'avatar-star-';
  const count = Number(starCount);
  if (Number.isInteger(count) && count >= 1 && count <= 6) {
    return `${prefix}${count}`;
  }
  return `${prefix}default`;
}
