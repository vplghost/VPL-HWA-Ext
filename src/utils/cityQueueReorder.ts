/**
 * Dependency-aware reordering helpers for Building Queue and Research Queue (`cityQueueReorder.ts`).
 *
 * Enforces prerequisite ordering during `first` / `up` / `down` moves:
 * 1. Same-entity sequential level order: Lv.N must stay before Lv.M whenever N < M.
 * 2. Cross-entity prerequisites from game tree data (`getBuildingLevelData` / `getResearchLevelData`,
 *    automatically respecting any runtime City Tree Overlay).
 * 3. Hall of Heroes Cap Rule (building queue): non-Hall buildings (`buildingId !== 20`) cannot
 *    precede a queued Hall of Heroes upgrade needed to reach their `nextLevel`.
 * 4. Transitive closure: if A must precede B and B must precede C, then A must precede C.
 * 5. Smart Move-to-First: moves the item to `minIndex` (immediately after its last prerequisite).
 */
import { getBuildingLevelData } from '../data/buildingData.ts';
import { getResearchLevelData } from '../data/researchData.ts';

export type CityQueueKind = 'building' | 'research';

export interface CityQueueMoveBounds<T = any> {
  minIndex: number;
  maxIndex: number;
  canMoveFirst: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  blockedUpBy: T | null;
  blockedDownBy: T | null;
}

export interface CityQueueMoveResult<T = any> {
  moved: boolean;
  targetIndex: number;
  items: T[];
  bounds: CityQueueMoveBounds<T>;
}

const HALL_OF_HEROES_BUILDING_ID = 20;

function extractItemId(type: CityQueueKind, item: any): number {
  if (!item || typeof item !== 'object') return NaN;
  return Number(type === 'building' ? (item.buildingId ?? item.id) : (item.researchId ?? item.id));
}

function extractItemLevel(item: any): number {
  if (!item || typeof item !== 'object') return NaN;
  return Number(item.nextLevel ?? item.level);
}

/**
 * Returns true if `dependentItem` directly requires `prereqItem` to complete first.
 */
export function doesCityQueueItemDependOn(
  type: CityQueueKind,
  dependentItem: any,
  prereqItem: any
): boolean {
  const depId = extractItemId(type, dependentItem);
  const depLvl = extractItemLevel(dependentItem);
  const preId = extractItemId(type, prereqItem);
  const preLvl = extractItemLevel(prereqItem);

  if (!Number.isFinite(depId) || !Number.isFinite(depLvl) || !Number.isFinite(preId) || !Number.isFinite(preLvl)) {
    return false;
  }

  // 1. Same building/research: lower level must always precede higher level
  if (depId === preId) {
    return preLvl < depLvl;
  }

  // 2. Building queue cross-building prerequisites & Hall of Heroes cap
  if (type === 'building') {
    // Non-Hall buildings cannot exceed Hall of Heroes level
    if (depId !== HALL_OF_HEROES_BUILDING_ID && preId === HALL_OF_HEROES_BUILDING_ID && preLvl <= depLvl) {
      return true;
    }

    const meta = getBuildingLevelData(depId, depLvl);
    if (meta && Array.isArray(meta.r)) {
      for (const [reqId, reqLvl] of meta.r) {
        if (Number(reqId) === preId && preLvl <= Number(reqLvl)) {
          return true;
        }
      }
    }
    return false;
  }

  // 3. Research queue cross-research prerequisites
  const meta = getResearchLevelData(depId, depLvl);
  if (meta && Array.isArray(meta.r)) {
    for (const [reqId, reqLvl] of meta.r) {
      if (Number(reqId) === preId && preLvl <= Number(reqLvl)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Computes the valid `[minIndex, maxIndex]` range for moving `items[index]` without violating
 * any direct or transitive prerequisite constraints relative to the remaining queue items.
 */
export function getCityQueueMoveBounds<T = any>(
  type: CityQueueKind,
  items: readonly T[],
  index: number
): CityQueueMoveBounds<T> {
  const n = Array.isArray(items) ? items.length : 0;
  if (!Number.isInteger(index) || index < 0 || index >= n) {
    return {
      minIndex: 0,
      maxIndex: Math.max(0, n - 1),
      canMoveFirst: false,
      canMoveUp: false,
      canMoveDown: false,
      blockedUpBy: null,
      blockedDownBy: null,
    };
  }

  // Build adjacency for transitive closure:
  // prereqOf[u] = set of v that u directly depends on (v must precede u)
  // dependentOf[v] = set of u that directly depend on v (u must follow v)
  const prereqOf: number[][] = Array.from({ length: n }, () => []);
  const dependentOf: number[][] = Array.from({ length: n }, () => []);

  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      if (u === v) continue;
      if (doesCityQueueItemDependOn(type, items[u], items[v])) {
        prereqOf[u].push(v);
        dependentOf[v].push(u);
      }
    }
  }

  // BFS all ancestors (prerequisites) of `index`
  const ancestors = new Set<number>();
  const qUp: number[] = [...prereqOf[index]];
  while (qUp.length > 0) {
    const cur = qUp.shift()!;
    if (cur === index || ancestors.has(cur)) continue;
    ancestors.add(cur);
    for (const next of prereqOf[cur]) {
      if (!ancestors.has(next)) qUp.push(next);
    }
  }

  // BFS all descendants (dependents) of `index`
  const descendants = new Set<number>();
  const qDown: number[] = [...dependentOf[index]];
  while (qDown.length > 0) {
    const cur = qDown.shift()!;
    if (cur === index || descendants.has(cur)) continue;
    descendants.add(cur);
    for (const next of dependentOf[cur]) {
      if (!descendants.has(next)) qDown.push(next);
    }
  }

  // Upper bound (earliest index): strictly after the latest prerequisite currently before `index`
  let maxPrereqIdx = -1;
  for (const a of ancestors) {
    if (a < index && a > maxPrereqIdx) {
      maxPrereqIdx = a;
    }
  }
  const minIndex = maxPrereqIdx + 1;

  // Lower bound (latest index): strictly before the earliest dependent currently after `index`
  let minDependentIdx = n;
  for (const d of descendants) {
    if (d > index && d < minDependentIdx) {
      minDependentIdx = d;
    }
  }
  const maxIndex = minDependentIdx - 1;

  const blockedUpBy = maxPrereqIdx >= 0 ? items[maxPrereqIdx] ?? null : null;
  const blockedDownBy = minDependentIdx < n ? items[minDependentIdx] ?? null : null;

  return {
    minIndex,
    maxIndex,
    canMoveFirst: index > minIndex,
    canMoveUp: index > minIndex,
    canMoveDown: index < maxIndex,
    blockedUpBy,
    blockedDownBy,
  };
}

/**
 * Computes a constrained move (`first`, `up`, `down`) for `items[index]`.
 * - `first`: moves item to `bounds.minIndex` (right after its last prerequisite).
 * - `up`: moves item to `Math.max(bounds.minIndex, index - 1)`.
 * - `down`: moves item to `Math.min(bounds.maxIndex, index + 1)`.
 */
export function computeConstrainedCityQueueMove<T = any>(
  type: CityQueueKind,
  items: readonly T[],
  index: number,
  direction: 'up' | 'down' | 'first' | string
): CityQueueMoveResult<T> {
  const list = Array.isArray(items) ? [...items] : [];
  const bounds = getCityQueueMoveBounds(type, list, index);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return { moved: false, targetIndex: index, items: list, bounds };
  }

  let targetIndex = index;
  if (direction === 'first') {
    targetIndex = bounds.minIndex;
  } else if (direction === 'up') {
    targetIndex = Math.max(bounds.minIndex, index - 1);
  } else if (direction === 'down') {
    targetIndex = Math.min(bounds.maxIndex, index + 1);
  }

  targetIndex = Math.max(0, Math.min(list.length - 1, targetIndex));
  if (targetIndex === index) {
    return { moved: false, targetIndex: index, items: list, bounds };
  }

  const [item] = list.splice(index, 1);
  list.splice(targetIndex, 0, item!);
  return {
    moved: true,
    targetIndex,
    items: list,
    bounds,
  };
}

/**
 * Formats concise English button tooltips describing prerequisite bounds.
 */
export function formatCityQueueMoveTitles<T = any>(
  bounds: CityQueueMoveBounds<T>,
  formatLabel: (item: T) => string
): { first: string; up: string; down: string } {
  const upLabel = bounds.blockedUpBy ? formatLabel(bounds.blockedUpBy) : '';
  const downLabel = bounds.blockedDownBy ? formatLabel(bounds.blockedDownBy) : '';

  const first = bounds.canMoveFirst
    ? bounds.minIndex > 0 && upLabel
      ? `Move right after ${upLabel}`
      : 'Move to first'
    : upLabel
      ? `Already right after ${upLabel}`
      : 'Already first';

  const up = bounds.canMoveUp
    ? 'Move up'
    : upLabel
      ? `Blocked by ${upLabel}`
      : 'Already at top';

  const down = bounds.canMoveDown
    ? 'Move down'
    : downLabel
      ? `Required by ${downLabel}`
      : 'Already at bottom';

  return { first, up, down };
}
