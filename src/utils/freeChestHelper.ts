import type { AttentionBonusItem, AttentionBonusAvailability } from '../types';

/**
 * Calculates current availability of free attention bonus chests.
 * A bonus is ready if it is not yet collected OR current timestamp is past refreshTime.
 * It is excluded if expired (endTime > 0 and nowSec >= endTime).
 */
export function getAttentionBonusAvailability(
  bonuses: Record<number, AttentionBonusItem> | AttentionBonusItem[] | undefined,
  nowMs = Date.now()
): AttentionBonusAvailability {
  const list: AttentionBonusItem[] = Array.isArray(bonuses)
    ? bonuses
    : bonuses && typeof bonuses === 'object'
      ? Object.values(bonuses)
      : [];

  const nowSec = Math.floor(nowMs / 1000);
  const readyBonusIds: number[] = [];
  const futureRefreshes: number[] = [];

  for (const item of list) {
    if (!item || !Number.isInteger(item.id)) continue;
    // Expired check
    if (item.endTime > 0 && nowSec >= item.endTime) continue;

    const isReady = !item.collected || (item.refreshTime > 0 && nowSec >= item.refreshTime);
    if (isReady) {
      readyBonusIds.push(item.id);
    } else if (item.refreshTime > nowSec) {
      futureRefreshes.push(item.refreshTime - nowSec);
    }
  }

  const nextRefreshSeconds = futureRefreshes.length > 0 ? Math.min(...futureRefreshes) : null;

  return {
    ready: readyBonusIds.length > 0,
    availableCount: readyBonusIds.length,
    readyBonusIds,
    nextRefreshSeconds
  };
}

/**
 * Formats seconds into a human-readable countdown string (e.g., "14h 22m" or "22m 10s").
 */
export function formatCooldownTimer(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}
