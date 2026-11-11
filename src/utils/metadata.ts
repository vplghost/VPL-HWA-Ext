import '~/extension/hero-metadata.js';
import '~/extension/titan-metadata.js';
import '~/extension/data-names.js';
import '~/extension/name-map.js';
import '~/extension/popup-data.js';
import '~/extension/building-data.js';
import '~/extension/building-queue.js';
import '~/extension/research-data.js';
import '~/extension/research-queue.js';

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
  const metaMap = (globalThis as any).hwaHelperHeroMetadata;
  return metaMap?.[String(heroId)];
}

export function getAllHeroMetadata(): Record<string, HeroMeta> {
  return (globalThis as any).hwaHelperHeroMetadata || {};
}

export function getTitanMetadata(titanId: number | string): TitanMeta | undefined {
  const metaMap = (globalThis as any).hwaHelperTitanMetadata;
  return metaMap?.[String(titanId)];
}

export function getAllTitanMetadata(): Record<string, TitanMeta> {
  return (globalThis as any).hwaHelperTitanMetadata || {};
}

export function getHeroEquipmentRank(color: number | string) {
  return (globalThis as any).hwaHelperPopupData?.getHeroEquipmentRank?.(color);
}

export function getHeroSoulProgress(heroId: string | number, hero: any, inventory: any) {
  return (globalThis as any).hwaHelperPopupData?.heroSoulProgress?.(String(heroId), hero, inventory);
}

export function getItemName(category: string, id: number | string): string {
  const nameMap = (globalThis as any).hwaHelperNameMap;
  const nameData = (globalThis as any).hwaHelperNameData?.names;
  return nameData?.[category]?.[id] || nameMap?.item?.(category, id) || `${category} #${id}`;
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
  const nameMap = (globalThis as any).hwaHelperNameMap;
  return nameMap?.building?.(id) || (id ? `Building #${id}` : 'Building');
}

export function getResearchName(id: number | string): string {
  const nameMap = (globalThis as any).hwaHelperNameMap;
  return nameMap?.research?.(id) || (id ? `Research #${id}` : 'Research');
}

export function starGlowClass(starCount: number, isLarge = false) {
  const prefix = isLarge ? 'avatar-star-lg-' : 'avatar-star-';
  const count = Number(starCount);
  if (Number.isInteger(count) && count >= 1 && count <= 6) {
    return `${prefix}${count}`;
  }
  return `${prefix}default`;
}
