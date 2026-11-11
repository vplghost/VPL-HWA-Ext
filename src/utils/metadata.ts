import '~/extension/hero-metadata.js';
import '~/extension/titan-metadata.js';
import '~/extension/data-names.js';
import '~/extension/name-map.js';
import '~/extension/popup-data.js';
import '~/extension/building-data.js';
import '~/extension/building-queue.js';
import '~/extension/research-data.js';
import '~/extension/research-queue.js';
import '~/extension/campaign-missions.js';

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

export function buildGearRecipeTree(gearId: number | string | null, cache: any, visited = new Set<string>()): any {
  if (!gearId) return null;
  const strId = String(gearId);
  if (visited.has(strId)) return null;
  visited.add(strId);

  const craftInfo = (globalThis as any).hwaHelperGearCraftData?.[strId] || null;
  const name = getItemName('gear', strId);
  const ownedGear = Number(cache?.inventoryGet?.data?.gear?.[strId] || 0);

  const node: any = {
    id: strId,
    name,
    owned: ownedGear,
    craftInfo,
    fragment: null,
    children: [],
    isFulfilled: ownedGear >= 1,
    canCraft: false,
  };

  if (craftInfo?.fragmentCount) {
    const fragReq = Number(craftInfo.fragmentCount) || 0;
    const ownedFrags = Number(cache?.inventoryGet?.data?.fragmentGear?.[strId] || 0);
    const fragFulfilled = ownedFrags >= fragReq;
    node.fragment = {
      id: strId,
      required: fragReq,
      owned: ownedFrags,
      isFulfilled: fragFulfilled,
      gold: craftInfo.gold || 0,
    };
    if (ownedGear < 1 && fragFulfilled) {
      node.canCraft = true;
    }
  }

  let allSubFulfilled = true;
  let hasSubComponents = false;

  if (craftInfo?.recipe) {
    for (const [subId, reqCount] of Object.entries(craftInfo.recipe)) {
      hasSubComponents = true;
      const child = buildGearRecipeTree(subId, cache, new Set(visited));
      if (child) {
        child.requiredCount = Number(reqCount) || 1;
        child.isFulfilled = child.owned >= child.requiredCount;
        if (!child.isFulfilled) allSubFulfilled = false;
        node.children.push(child);
      }
    }
  }

  if (craftInfo?.scroll) {
    for (const [scrollId, reqCount] of Object.entries(craftInfo.scroll)) {
      hasSubComponents = true;
      const scrollStr = String(scrollId);
      const scrollCraft = (globalThis as any).hwaHelperScrollCraftData?.[scrollStr] || null;
      const scrollName = getItemName('scroll', scrollStr);
      const ownedScroll = Number(cache?.inventoryGet?.data?.scroll?.[scrollStr] || 0);
      const reqNum = Number(reqCount) || 1;
      const isScrollFulfilled = ownedScroll >= reqNum;
      if (!isScrollFulfilled) allSubFulfilled = false;

      const scrollNode: any = {
        id: scrollStr,
        name: scrollName,
        category: 'scroll',
        isScroll: true,
        owned: ownedScroll,
        requiredCount: reqNum,
        craftInfo: scrollCraft,
        fragment: null,
        children: [],
        isFulfilled: isScrollFulfilled,
        canCraft: false,
      };

      if (scrollCraft?.fragmentCount) {
        const fragReq = Number(scrollCraft.fragmentCount) || 0;
        const ownedFragScroll = Number(cache?.inventoryGet?.data?.fragmentScroll?.[scrollStr] || 0);
        const fragFulfilled = ownedFragScroll >= fragReq;
        scrollNode.fragment = {
          id: scrollStr,
          category: 'fragmentScroll',
          required: fragReq,
          owned: ownedFragScroll,
          isFulfilled: fragFulfilled,
          gold: scrollCraft.gold || 0,
        };
        if (ownedScroll < reqNum && fragFulfilled) {
          scrollNode.canCraft = true;
        }
      }

      node.children.push(scrollNode);
    }
  }

  if (ownedGear < 1 && allSubFulfilled && hasSubComponents) {
    node.canCraft = true;
  }

  return node;
}

export function findFirstUnfulfilledNode(node: any): any {
  if (!node) return null;
  for (const child of node.children || []) {
    const unfulfilledChild = findFirstUnfulfilledNode(child);
    if (unfulfilledChild) return unfulfilledChild;
  }
  if (!node.isFulfilled) {
    return node;
  }
  return null;
}

export function starGlowClass(starCount: number, isLarge = false) {
  const prefix = isLarge ? 'avatar-star-lg-' : 'avatar-star-';
  const count = Number(starCount);
  if (Number.isInteger(count) && count >= 1 && count <= 6) {
    return `${prefix}${count}`;
  }
  return `${prefix}default`;
}
