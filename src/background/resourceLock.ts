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
   * Synchronize reservations directly from persisted queue states (`raidQueue`, `monsterQueue`, `raidEnergyAuto`)
   */
  syncFromQueueStates(
    states: {
      raidQueue?: any;
      monsterQueue?: any;
      raidEnergyAuto?: any;
      currentEnergy?: number | null;
    },
    nowMs: number = Date.now()
  ): void {
    const activeRaidPhases = new Set([
      'refreshing',
      'waiting_rally',
      'waiting_gather',
      'searching',
      'creating',
      'active',
      'cancelling',
      'running',
      'waiting_march',
      'queued',
    ]);
    const activeMonsterPhases = new Set([
      'refreshing',
      'waiting_gather',
      'searching',
      'attacking',
      'active',
      'running',
      'waiting_march',
      'queued',
    ]);

    const rq = states.raidQueue;
    const rqPhase = String(rq?.phase || rq?.status || '');
    const rqActive = Boolean(rq && activeRaidPhases.has(rqPhase));
    const rea = states.raidEnergyAuto;
    const reaArmed = Boolean(
      !rqActive &&
      rea?.enabled === true &&
      Number.isFinite(rea.threshold) &&
      Number.isFinite(states.currentEnergy) &&
      (states.currentEnergy as number) >= rea.threshold - 15 &&
      Array.isArray(rea.options?.heroIds) &&
      rea.options.heroIds.length > 0
    );

    if (rqActive) {
      const heroIds = Array.isArray(rq.options?.heroIds)
        ? rq.options.heroIds
        : Array.isArray(rq.heroIds)
          ? rq.heroIds
          : (Array.isArray(rq.team?.heroes) ? rq.team.heroes : []);
      this.reserve('raidQueue', {
        heroIds,
        marchSlots: 1,
        reason: rqPhase === 'waiting_rally' ? 'Raid queue waiting for clan rally' : 'Raid queue active',
        nowMs,
      });
    } else if (reaArmed) {
      this.reserve('raidQueue', {
        heroIds: rea.options.heroIds,
        marchSlots: 1,
        reason: `Raid Energy Auto armed (${states.currentEnergy}/${rea.threshold})`,
        nowMs,
      });
    } else if ('raidQueue' in states || 'raidEnergyAuto' in states) {
      this.release('raidQueue');
    }

    const mq = states.monsterQueue;
    const mqPhase = String(mq?.phase || mq?.status || '');
    if (mq && activeMonsterPhases.has(mqPhase)) {
      const heroIds = Array.isArray(mq.options?.heroIds)
        ? mq.options.heroIds
        : Array.isArray(mq.heroIds)
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
