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
