/**
 * Unified Resource & Squad Lock Manager (`ResourceLockManager`).
 * Coordinates hero squad & march slot reservations across parallel automations
 * (`raidQueue`, `monsterQueue`, `autoGather`, `towerRun`, `dungeonRun`) so one
 * queue never steals heroes or exhausts march slots needed by another.
 */

export type LockOwner = 'raidQueue' | 'monsterQueue' | 'autoGather' | 'towerRun' | 'dungeonRun';

export interface ResourceReservation {
  owner: LockOwner;
  heroIds: number[];
  marchSlots: number;
  reason: string;
  updatedAt: number;
  expiresAt: number;
}

export const DEFAULT_LOCK_TTL_MS = 10 * 60_000; // 10 minutes safety TTL

export class ResourceLockManager {
  private reservations = new Map<LockOwner, ResourceReservation>();

  private pruneExpired(nowMs: number = Date.now()): void {
    for (const [owner, res] of this.reservations.entries()) {
      if (res.expiresAt <= nowMs) {
        this.reservations.delete(owner);
      }
    }
  }

  reserve(
    owner: LockOwner,
    opts: {
      heroIds?: number[];
      marchSlots?: number;
      reason?: string;
      ttlMs?: number;
      nowMs?: number;
    }
  ): ResourceReservation {
    const now = opts.nowMs ?? Date.now();
    this.pruneExpired(now);
    const heroIds = Array.isArray(opts.heroIds)
      ? [...new Set(opts.heroIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const marchSlots = Math.max(0, Math.floor(Number(opts.marchSlots) || 0));
    const ttl = Math.max(5_000, Number(opts.ttlMs) || DEFAULT_LOCK_TTL_MS);
    const entry: ResourceReservation = {
      owner,
      heroIds,
      marchSlots,
      reason: opts.reason || `${owner} active`,
      updatedAt: now,
      expiresAt: now + ttl,
    };
    this.reservations.set(owner, entry);
    return entry;
  }

  release(owner: LockOwner): void {
    this.reservations.delete(owner);
  }

  /**
   * Synchronize reservations directly from persisted queue states (`raidQueue`, `monsterQueue`, etc.)
   */
  syncFromQueueStates(
    states: {
      raidQueue?: any;
      monsterQueue?: any;
    },
    nowMs: number = Date.now()
  ): void {
    const rq = states.raidQueue;
    if (rq && ['running', 'waiting_rally', 'waiting_march', 'queued'].includes(String(rq.status || ''))) {
      const heroIds = Array.isArray(rq.heroIds)
        ? rq.heroIds
        : (Array.isArray(rq.team?.heroes) ? rq.team.heroes : []);
      this.reserve('raidQueue', {
        heroIds,
        marchSlots: 1,
        reason: rq.status === 'waiting_rally' ? 'Raid queue waiting for clan rally' : 'Raid queue active',
        nowMs,
      });
    } else if ('raidQueue' in states) {
      this.release('raidQueue');
    }

    const mq = states.monsterQueue;
    if (mq && ['running', 'waiting_march', 'queued'].includes(String(mq.status || ''))) {
      const heroIds = Array.isArray(mq.heroIds)
        ? mq.heroIds
        : (Array.isArray(mq.team?.heroes) ? mq.team.heroes : []);
      this.reserve('monsterQueue', {
        heroIds,
        marchSlots: 1,
        reason: 'Monster queue active',
        nowMs,
      });
    } else if ('monsterQueue' in states) {
      this.release('monsterQueue');
    }
  }

  getReservedHeroIds(excludeOwner?: LockOwner, nowMs: number = Date.now()): Set<number> {
    this.pruneExpired(nowMs);
    const out = new Set<number>();
    for (const [owner, res] of this.reservations.entries()) {
      if (excludeOwner && owner === excludeOwner) continue;
      for (const id of res.heroIds) out.add(id);
    }
    return out;
  }

  getReservedMarchSlots(excludeOwner?: LockOwner, nowMs: number = Date.now()): number {
    this.pruneExpired(nowMs);
    let total = 0;
    for (const [owner, res] of this.reservations.entries()) {
      if (excludeOwner && owner === excludeOwner) continue;
      total += res.marchSlots;
    }
    return total;
  }

  getAvailableMarchSlots(totalFreeSlots: number, owner: LockOwner, nowMs: number = Date.now()): number {
    const reservedByOthers = this.getReservedMarchSlots(owner, nowMs);
    return Math.max(0, Math.floor(totalFreeSlots) - reservedByOthers);
  }

  getSnapshot(nowMs: number = Date.now()): ResourceReservation[] {
    this.pruneExpired(nowMs);
    return Array.from(this.reservations.values()).map((r) => ({ ...r, heroIds: [...r.heroIds] }));
  }

  async persistSnapshot(cr: any, nowMs: number = Date.now()): Promise<void> {
    if (!cr?.storage?.local?.set) return;
    await cr.storage.local.set({ activeResourceLocks: this.getSnapshot(nowMs) }).catch?.(() => {});
  }

  clear(): void {
    this.reservations.clear();
  }
}

export const resourceLockManager = new ResourceLockManager();
