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
export function buildGearRecipeTree(gearId: number | string | null, cache: any): RecipeNode | null {
  if (!gearId) return null;
  const globals = globalThis as any;
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
    const craftInfo = (category === 'gear' ? globals.hwaHelperGearCraftData : globals.hwaHelperScrollCraftData)?.[id] || null;
    const node: RecipeNode = {
      id, key, category, isScroll: category === 'scroll',
      name: globals.hwaHelperNameData?.names?.[category]?.[id] || globals.hwaHelperNameMap?.item?.(category, id) || `${category} #${id}`,
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
  const missions = (globalThis as any).hwaHelperCampaignMissions?.getMissionsForItem?.(node.id) || [];
  const category = recipeFarmCategory(node);
  return missions.filter((mission: any) => mission.drops?.[category]?.some((id: any) => String(id) === node.id));
}
