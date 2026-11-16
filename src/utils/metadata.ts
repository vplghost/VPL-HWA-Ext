import '../data/heroMetadata.ts';
import '../data/titanMetadata.ts';
import '../data/nameData.ts';
import '../data/itemData.ts';
import './popupData.ts';
import '../data/buildingData.ts';
import '../services/queues/buildingQueue.ts';
import '../data/researchData.ts';
import '../services/queues/researchQueue.ts';
import '../data/campaignData.ts';
import '../data/questData.ts';
import './experimentalData.ts';
import '../data/towerData.ts';
import './towerRules.ts';
import '../services/queues/towerAutomation.ts';
import '../data/clanVersusData.ts';

import { heroMetadata, getHeroMetadata as getTypedHeroMetadata, gearCraftData } from '../data/heroMetadata.ts';
import { titanMetadata, getTitanMetadata as getTypedTitanMetadata } from '../data/titanMetadata.ts';
import { getItemName as typedGetItemName, getBuildingName as typedGetBuildingName, getResearchName as typedGetResearchName, nameData, nameMap } from '../data/nameData.ts';
import { heroEquipmentRank, heroSoulProgress, titanSoulProgress } from './popupData.ts';

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
  return getTypedHeroMetadata(heroId) as HeroMeta | undefined;
}

export function getAllHeroMetadata(): Record<string, HeroMeta> {
  return heroMetadata as any;
}

export function getTitanMetadata(titanId: number | string): TitanMeta | undefined {
  return getTypedTitanMetadata(titanId) as TitanMeta | undefined;
}

export function getAllTitanMetadata(): Record<string, TitanMeta> {
  return titanMetadata as any;
}

export function getHeroEquipmentRank(color: number | string) {
  return heroEquipmentRank(color);
}

export function getHeroSoulProgress(heroId: string | number, hero: any, inventory: any) {
  return heroSoulProgress(String(heroId), hero, inventory);
}

export function getTitanSoulProgress(titanId: string | number, titan: any, inventory: any) {
  return titanSoulProgress(String(titanId), titan, inventory);
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
  const names = typeof nameData !== 'undefined' ? nameData : null;

  if (category === 'fragmentGear') {
    const gName = (typeof typedGetItemName === 'function' ? typedGetItemName('gear', strId) : null)
      || names?.names?.gear?.[strId]
      || `Gear #${strId}`;
    return `${gName} Fragment`;
  }
  if (category === 'fragmentArtifact') {
    const aName = (typeof typedGetItemName === 'function' ? typedGetItemName('artifact', strId) : null)
      || names?.names?.artifact?.[strId]
      || `Artifact #${strId}`;
    return `${aName} Fragment`;
  }
  if (category === 'fragmentScroll') {
    const sName = (typeof typedGetItemName === 'function' ? typedGetItemName('scroll', strId) : null)
      || names?.names?.scroll?.[strId]
      || `Scroll #${strId}`;
    return `${sName} Fragment`;
  }

  const typedItem = typeof typedGetItemName === 'function' ? typedGetItemName(category, strId) : null;
  if (typedItem) return typedItem;
  const mapHelper = typeof nameMap !== 'undefined' ? nameMap : null;
  return mapHelper?.item?.(category, strId) || `${category} #${strId}`;
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
  return `Hero #${heroId}`;
}

export function getGearCraftData(gearId: number | string) {
  return gearCraftData?.[String(gearId)] ?? null;
}

export function getBuildingName(id: number | string): string {
  return typedGetBuildingName(id) || (id ? `Building #${id}` : 'Building');
}

export function getResearchName(id: number | string): string {
  return typedGetResearchName(id) || (id ? `Research #${id}` : 'Research');
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
