import { observedToday } from '../composables/activityState.ts';

const DAY = 86400000;
const COOLDOWN = 28800000;

/** UI availability only: never changes authoritative resource balances. */
export function freeAlchemyAvailability(cache: Record<string, any>, now = Date.now()) {
  const reset = cache.questResetStatus?.data?.nextDayAt;
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const nextReset = Number.isFinite(reset)
    ? reset > now ? reset : reset + (Math.floor((now - reset) / DAY) + 1) * DAY
    : midnight.getTime();
  const fresh = (entry: any) => observedToday(entry, now, reset);
  const quota = cache['resource:refillable:53'];
  const receipt = cache.freeAlchemySpinStatus;
  const hasReceipt = fresh(receipt) && Number.isFinite(receipt.data?.cooldownUntil);
  let readyAt = hasReceipt ? receipt.data.cooldownUntil : now;
  if (fresh(quota) && (!hasReceipt || Date.parse(quota.updatedAt) >= Date.parse(receipt.updatedAt))) {
    if (Number.isFinite(quota.data?.amount) && quota.data.amount > 0) readyAt = now;
    else if (quota.data?.amount === 0) {
      readyAt = Number.isFinite(quota.data.lastRefillAt)
        ? quota.data.lastRefillAt + COOLDOWN : hasReceipt ? readyAt : nextReset;
    }
  }
  readyAt = Math.min(readyAt, nextReset);
  const remainingSeconds = Math.max(0, Math.ceil((readyAt - now) / 1000));
  return { ready: remainingSeconds === 0, readyAt, remainingSeconds };
}

export function freeAlchemyTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return [hours, minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
