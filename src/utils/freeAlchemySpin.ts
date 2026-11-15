import '../../extension/free-alchemy.js';

/** UI availability only: never changes authoritative resource balances. */
export function freeAlchemyAvailability(cache: Record<string, any>, now = Date.now()) {
  return (globalThis as any).hwaHelperFreeAlchemy.availability(cache, now) as { ready: boolean; readyAt: number; remainingSeconds: number };
}

export function freeAlchemyTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return [hours, minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
