import { freeAlchemyAvailability as typedFreeAlchemyAvailability } from '../services/freeAlchemy.ts';

/** UI availability only: never changes authoritative resource balances. */
export function freeAlchemyAvailability(cache: Record<string, any>, now = Date.now()) {
  if (typeof globalThis !== 'undefined' && (globalThis as any).hwaHelperFreeAlchemy?.availability) {
    return (globalThis as any).hwaHelperFreeAlchemy.availability(cache, now);
  }
  return typedFreeAlchemyAvailability(cache, now);
}

export function freeAlchemyTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
