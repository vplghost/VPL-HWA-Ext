import { getMissionsForItem as typedGetMissionsForItem } from '../data/campaignData.ts';
import { getItemName } from '../data/nameData.ts';
import { gearCraftData, scrollCraftData, heroMetadata } from '../data/heroMetadata.ts';

export interface RecipeNode {
  id: string;
  key: string;
  category: 'gear' | 'scroll';
  isScroll: boolean;
  name: string;
  requiredCount: number;
  owned: number;
  inventoryOwned: number;
  craftInfo: any;
  fragment: null | { id: string; category: string; required: number; owned: number; isFulfilled: boolean; gold: number };
  children: RecipeNode[];
  isFulfilled: boolean;
  canCraft: boolean;
  cycle: boolean;
}

/** Reserve stock once across branches; descendants are needed only for missing parent copies. */
export function buildGearRecipeTree(
  gearId: number | string | null,
  cache: any,
  customCraftMap?: Record<string, any>
): RecipeNode | null {
  if (!gearId) return null;
  const inventory = cache?.inventoryGet?.data || {};
  const reserved = new Map<string, number>();
  const stock = (category: string, id: string) => Math.max(0, Number(inventory[category]?.[id]) || 0);
  function allocate(category: string, id: string, required: number) {
    const key = `${category}:${id}`;
    const used = reserved.get(key) || 0;
    const owned = Math.max(0, stock(category, id) - used);
    reserved.set(key, used + Math.min(owned, required));
    return owned;
  }
  function build(id: string, category: 'gear' | 'scroll', required: number, path: string, ancestors: Set<string>): RecipeNode {
    const identity = `${category}:${id}`;
    const key = path ? `${path}/${identity}` : identity;
    const cycle = ancestors.has(identity);
    const owned = allocate(category, id, required);
    const missing = Math.max(0, required - owned);
    const craftInfo = (customCraftMap && customCraftMap[id]) ||
      (category === 'gear' ? gearCraftData?.[id] : scrollCraftData?.[id]) || null;
    const resolvedName = getItemName(category, id) || `${category} #${id}`;
    const node: RecipeNode = {
      id, key, category, isScroll: category === 'scroll',
      name: resolvedName,
      requiredCount: required, owned, inventoryOwned: stock(category, id), craftInfo,
      fragment: null, children: [], isFulfilled: owned >= required, canCraft: false, cycle,
    };
    if (cycle) return node;
    const next = new Set(ancestors).add(identity);
    if (Number(craftInfo?.fragmentCount) > 0) {
      const fragmentCategory = category === 'scroll' ? 'fragmentScroll' : 'fragmentGear';
      const count = Number(craftInfo.fragmentCount) * missing;
      const fragments = allocate(fragmentCategory, id, count);
      node.fragment = { id, category: fragmentCategory, required: count, owned: fragments,
        isFulfilled: fragments >= count, gold: craftInfo.gold || 0 };
    }
    for (const [childCategory, recipe] of [['gear', craftInfo?.recipe], ['scroll', craftInfo?.scroll]] as const) {
      for (const [childId, quantity] of Object.entries(recipe || {})) {
        const count = Number(quantity);
        if (Number.isFinite(count) && count > 0) node.children.push(build(childId, childCategory, count * missing, key, next));
      }
    }
    node.canCraft = missing > 0 && (node.fragment ? node.fragment.isFulfilled
      : node.children.length > 0 && node.children.every(child => child.isFulfilled && !child.cycle));
    return node;
  }
  return build(String(gearId), 'gear', 1, '', new Set());
}

export function findFirstUnfulfilledNode(node: RecipeNode | null): RecipeNode | null {
  if (!node || node.isFulfilled || node.cycle) return null;
  if (node.canCraft) return node;
  for (const child of node.children) {
    const missing = findFirstUnfulfilledNode(child);
    if (missing) return missing;
  }
  return node;
}

export function findRecipeNode(node: RecipeNode | null, key: string | number): RecipeNode | null {
  if (!node) return null;
  if (node.key === String(key)) return node;
  for (const child of node.children) {
    const found = findRecipeNode(child, key);
    if (found) return found;
  }
  return null;
}

export function recipeFarmCategory(node: RecipeNode): string {
  return node.fragment?.category || node.category;
}

export function recipeMissions(node: RecipeNode | null): any[] {
  if (!node || node.cycle) return [];
  const missions = typedGetMissionsForItem(node.id) || [];
  const category = recipeFarmCategory(node);
  return missions.filter((mission: any) => mission.drops?.[category]?.some((id: any) => String(id) === node.id));
}

export interface HeroLeafResource {
  id: string;
  category: 'fragmentGear' | 'fragmentScroll' | 'gear' | 'scroll';
  name: string;
  requiredCount: number;
  ownedCount: number;
  remainingCount: number;
  isFulfilled: boolean;
  missions: any[];
  sourceGears: Array<{ id: string; name: string }>;
}

export interface HeroLeafEquipmentSummary {
  heroId: string;
  heroName: string;
  color: number;
  missingSlotsCount: number;
  missingGears: Array<{ slotNum: number; gearId: number; name: string }>;
  leafResources: HeroLeafResource[];
}

/**
 * Aggregates all deepest leaf resources (fragments or base drops) required to craft
 * all missing/unequipped equipment slots of a hero at their current rank.
 * Shared inventory is reserved once across all slots and branches.
 */
export function aggregateHeroLeafEquipment(
  heroOrId: any,
  cache: any,
  customCraftMap?: Record<string, any>
): HeroLeafEquipmentSummary | null {
  if (!heroOrId) return null;

  let hero: any = null;
  if (typeof heroOrId === 'object' && heroOrId !== null && (heroOrId.id !== undefined || heroOrId.color !== undefined)) {
    hero = heroOrId;
  } else {
    const heroesData = cache?.heroGetAll?.data || {};
    const idStr = String(heroOrId);
    hero = heroesData[idStr] || heroesData[Number(heroOrId)] || { id: Number(heroOrId), color: 1 };
  }

  const numHeroId = Number(hero.id);
  const meta = heroMetadata?.[numHeroId] ||
    heroMetadata?.[String(numHeroId)];
  const colorStr = String(hero.color || 1);
  const equipment: number[] = meta?.equipment?.[colorStr] || [];
  const heroName = getItemName('hero', numHeroId) || meta?.name || `Hero #${numHeroId}`;

  const missingGears: Array<{ slotNum: number; gearId: number; name: string }> = [];
  for (let sIdx = 0; sIdx < 6; sIdx++) {
    let isEquipped = false;
    if (hero?.slots) {
      if (Array.isArray(hero.slots)) {
        isEquipped = sIdx < hero.slots.length && hero.slots[sIdx] !== undefined && hero.slots[sIdx] !== null;
      } else if (typeof hero.slots === 'object') {
        isEquipped = Object.hasOwn(hero.slots, String(sIdx)) || Object.hasOwn(hero.slots, sIdx);
      }
    }
    const gearId = Number(equipment[sIdx]);
    if (!isEquipped && Number.isFinite(gearId) && gearId > 0) {
      const name = getItemName('gear', gearId) || `Gear #${gearId}`;
      missingGears.push({ slotNum: sIdx + 1, gearId, name });
    }
  }

  const inventory = cache?.inventoryGet?.data || {};
  const reserved = new Map<string, number>();
  const stock = (category: string, id: string) => Math.max(0, Number(inventory[category]?.[id]) || 0);

  function allocate(category: string, id: string, required: number) {
    const key = `${category}:${id}`;
    const used = reserved.get(key) || 0;
    const available = Math.max(0, stock(category, id) - used);
    const take = Math.min(available, required);
    reserved.set(key, used + take);
    return available;
  }

  const leafMap = new Map<string, HeroLeafResource>();

  function recordLeaf(
    id: string,
    category: 'fragmentGear' | 'fragmentScroll' | 'gear' | 'scroll',
    count: number,
    sourceGear: { id: string; name: string }
  ) {
    if (count <= 0) return;
    const key = `${category}:${id}`;
    let item = leafMap.get(key);
    if (!item) {
      const resolvedName = getItemName(category, id) || `${category} #${id}`;
      const allMissions = typedGetMissionsForItem(id) || [];
      const missions = allMissions.filter((m: any) =>
        m.drops?.[category]?.some((dropId: any) => String(dropId) === String(id))
      );
      item = {
        id: String(id),
        category,
        name: resolvedName,
        requiredCount: 0,
        ownedCount: stock(category, id),
        remainingCount: 0,
        isFulfilled: false,
        missions,
        sourceGears: []
      };
      leafMap.set(key, item);
    }
    item.requiredCount += count;
    if (sourceGear && !item.sourceGears.some(g => g.id === sourceGear.id)) {
      item.sourceGears.push(sourceGear);
    }
  }

  function traverse(
    id: string,
    category: 'gear' | 'scroll',
    required: number,
    ancestors: Set<string>,
    sourceGear: { id: string; name: string }
  ) {
    const identity = `${category}:${id}`;
    if (ancestors.has(identity) || required <= 0) return;

    // Check if whole item is already available in inventory
    const owned = allocate(category, id, required);
    const missing = Math.max(0, required - owned);
    if (missing <= 0) return;

    const craftInfo = (customCraftMap && customCraftMap[id]) ||
      (category === 'gear' ? gearCraftData?.[id] : scrollCraftData?.[id]) || null;

    // Case 1: Item is crafted from fragments -> fragments are the leaf!
    if (Number(craftInfo?.fragmentCount) > 0) {
      const fragCategory = category === 'scroll' ? 'fragmentScroll' : 'fragmentGear';
      const neededFrags = Number(craftInfo.fragmentCount) * missing;
      allocate(fragCategory, id, neededFrags);
      recordLeaf(id, fragCategory, neededFrags, sourceGear);
      return;
    }

    // Case 2: Composite recipe with sub-components
    const hasRecipe = Boolean(craftInfo?.recipe || craftInfo?.scroll);
    if (hasRecipe) {
      const nextAncestors = new Set(ancestors).add(identity);
      for (const [childCategory, recipe] of [['gear', craftInfo?.recipe], ['scroll', craftInfo?.scroll]] as const) {
        for (const [childId, quantity] of Object.entries(recipe || {})) {
          const count = Number(quantity);
          if (Number.isFinite(count) && count > 0) {
            traverse(childId, childCategory, count * missing, nextAncestors, sourceGear);
          }
        }
      }
      return;
    }

    // Case 3: Base item with direct campaign drop
    recordLeaf(id, category, missing, sourceGear);
  }

  for (const gear of missingGears) {
    traverse(String(gear.gearId), 'gear', 1, new Set(), { id: String(gear.gearId), name: gear.name });
  }

  const leafResources = Array.from(leafMap.values()).map(item => {
    const remainingCount = Math.max(0, item.requiredCount - item.ownedCount);
    return {
      ...item,
      remainingCount,
      isFulfilled: item.ownedCount >= item.requiredCount
    };
  });

  leafResources.sort((a, b) => {
    if (a.isFulfilled !== b.isFulfilled) return a.isFulfilled ? 1 : -1;
    return b.remainingCount - a.remainingCount || a.name.localeCompare(b.name);
  });

  return {
    heroId: String(hero.id),
    heroName,
    color: Number(hero.color || 1),
    missingSlotsCount: missingGears.length,
    missingGears,
    leafResources
  };
}

export interface CampaignDropsAccumulator {
  gold: number;
  experience: number;
  fragmentGear: Record<string, number>;
  fragmentScroll: Record<string, number>;
  gear: Record<string, number>;
  scroll: Record<string, number>;
  consumable: Record<string, number>;
  fragmentHero: Record<string, number>;
}

/**
 * Extracts and aggregates all item drops, gold, and experience from any campaign raid response.
 * Handles single runs, array of runs, object of runs (keyed by '0', '1', ...), raid consumables,
 * heroic fragmentHero, and multi-call RPC batches.
 */
export function extractDropsFromRaidResponse(raw: any): CampaignDropsAccumulator {
  const drops: CampaignDropsAccumulator = {
    gold: 0,
    experience: 0,
    fragmentGear: {},
    fragmentScroll: {},
    gear: {},
    scroll: {},
    consumable: {},
    fragmentHero: {},
  };

  if (!raw) return drops;

  const categories = ['fragmentGear', 'fragmentScroll', 'gear', 'scroll', 'consumable', 'fragmentHero'] as const;

  const mergeRun = (run: any) => {
    if (!run || typeof run !== 'object') return;

    if (Number.isFinite(run.gold)) drops.gold += Number(run.gold);
    if (Number.isFinite(run.experience)) drops.experience += Number(run.experience);

    for (const cat of categories) {
      if (run[cat] && typeof run[cat] === 'object') {
        for (const [id, count] of Object.entries(run[cat])) {
          const num = Number(count);
          if (num > 0) {
            drops[cat][id] = (drops[cat][id] || 0) + num;
          }
        }
      }
    }

    if (run.raid?.consumable && typeof run.raid.consumable === 'object') {
      for (const [id, count] of Object.entries(run.raid.consumable)) {
        const num = Number(count);
        if (num > 0) {
          drops.consumable[id] = (drops.consumable[id] || 0) + num;
        }
      }
    }
  };

  const processEntry = (item: any) => {
    if (!item || typeof item !== 'object') return;

    // Guard against whole-account or whole-inventory dumps (e.g. userGetInfo, inventoryGet, heroGetAll, teamGetAll, etc.)
    if (
      item.userId != null ||
      item.accountId != null ||
      item.slots != null ||
      (item.gear && item.heroes) ||
      item.refillable != null ||
      item.vip != null ||
      item.serverTime != null ||
      item.coin != null ||
      item.material != null ||
      item.fragmentTitan != null ||
      item.titanGear != null ||
      item.artifact != null ||
      item.fragmentArtifact != null ||
      item.lootboxChanced != null ||
      item.squads != null ||
      item.units != null ||
      item.buildings != null ||
      item.heroes != null ||
      item.titans != null
    ) {
      return;
    }

    if (item.result && item.result.response) {
      processEntry(item.result.response);
      return;
    }
    if (item.drops) {
      processEntry(item.drops);
      return;
    }
    if (item.currentDrops) {
      processEntry(item.currentDrops);
      return;
    }
    if (item.reward) {
      processEntry(item.reward);
      return;
    }
    if (item.drop) {
      processEntry(item.drop);
      return;
    }
    if (item.items) {
      processEntry(item.items);
      return;
    }

    if (Array.isArray(item)) {
      for (const sub of item) processEntry(sub);
      return;
    }

    const keys = Object.keys(item);
    const hasNumericKeys = keys.some((k) => /^\d+$/.test(k));
    if (hasNumericKeys) {
      for (const k of keys) {
        if (/^\d+$/.test(k)) {
          mergeRun(item[k]);
        } else if (k === 'raid') {
          mergeRun({ raid: item.raid });
        }
      }
    } else {
      mergeRun(item);
    }
  };

  processEntry(raw);
  return drops;
}
