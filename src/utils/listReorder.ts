/**
 * Pure list-reordering helpers shared across queues and priority lists.
 */

/**
 * Returns a new array with the item at `index` moved to position 0 (first),
 * preserving the relative order of all other items.
 */
export function moveItemToFirst<T>(list: readonly T[], index: number): T[] {
  if (!Array.isArray(list)) return [];
  const next = [...list];
  if (!Number.isInteger(index) || index <= 0 || index >= next.length) {
    return next;
  }
  const [item] = next.splice(index, 1);
  next.unshift(item!);
  return next;
}

/**
 * Returns a new array with the item at `fromIndex` moved to `toIndex`,
 * preserving relative order of all other items (used for drag-and-drop reordering).
 */
export function moveItemToIndex<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (!Array.isArray(list)) return [];
  const next = [...list];
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= next.length ||
    toIndex < 0 ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return next;
}

/**
 * Computes the destination index for a queue move operation (`up`, `down`, `first`).
 */
export function computeQueueMoveTarget(
  index: number,
  length: number,
  direction: 'up' | 'down' | 'first' | string
): number {
  if (direction === 'first') return 0;
  const delta = direction === 'up' ? -1 : 1;
  return Math.max(0, Math.min(length, index + delta));
}
