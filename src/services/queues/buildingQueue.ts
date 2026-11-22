import type {
  BuildingQueueItem,
  BuildingQueueState,
  BuildingQueueCandidate,
  BuildingQueueTimeline,
  BuildingQueuePlanResult,
} from '../../types/game/buildingQueue';
import {
  buildingDataHelper,
  getBuildingLevelData,
  getMissingRequirements,
  calculateEffectiveDurationMs,
  normalizeQueuedDuration,
  STANDALONE_BUILDING_IDS,
  BUILDING_RESEARCH_REQUIREMENTS,
  hasCompletedResearch,
} from '../../data/buildingData.ts';

export {
  STANDALONE_BUILDING_IDS,
  BUILDING_RESEARCH_REQUIREMENTS,
  hasCompletedResearch,
};

export function getSimulatedLevels(
  buildingMap: any,
  rawQueues: any = [],
  queueItems: any = []
): Map<number, number> {
  const simulated = new Map<number, number>();
  if (Array.isArray(buildingMap)) {
    for (const b of buildingMap) {
      const id = Number(b?.buildingId ?? b?.id);
      if (Number.isFinite(id)) simulated.set(id, b?.level ?? 0);
    }
  } else if (buildingMap && typeof buildingMap.entries === 'function') {
    for (const [id, b] of buildingMap.entries()) {
      simulated.set(Number(id), typeof b === 'number' ? b : (b?.level ?? 0));
    }
  } else if (buildingMap && typeof buildingMap === 'object') {
    for (const [id, b] of Object.entries(buildingMap)) {
      simulated.set(Number(id), typeof b === 'number' ? b : (b?.level ?? 0));
    }
  }
  for (const q of Array.isArray(rawQueues) ? rawQueues : Object.values(rawQueues || {})) {
    const bId = Number((q as any)?.buildingId);
    if (Number.isFinite(bId) && Number.isFinite((q as any)?.level)) {
      simulated.set(bId, Math.max(simulated.get(bId) || 0, (q as any).level));
    }
  }
  for (const item of Array.isArray(queueItems) ? queueItems : Object.values(queueItems || {})) {
    const bId = Number((item as any)?.buildingId);
    if (Number.isFinite(bId) && Number.isFinite((item as any)?.nextLevel)) {
      simulated.set(bId, Math.max(simulated.get(bId) || 0, (item as any).nextLevel));
    }
  }
  return simulated;
}

export const SYSTEM_LANDMARK_IDS = new Set<number>([44, 160, 161, 166, 167, 168, 169, 176, 177]);

export function getEligibleCandidates(
  allBuildings: any,
  simulatedLevels: Map<number, number>,
  bHelper: any = buildingDataHelper,
  completedResearches?: Set<number> | Map<number, number> | number[] | Record<number, any>,
  options?: { includeUnbuilt?: boolean }
): BuildingQueueCandidate[] {
  const simulatedHall = simulatedLevels.get(20) || 1;
  const candidates: BuildingQueueCandidate[] = [];
  const list = Array.isArray(allBuildings) ? allBuildings : Object.values(allBuildings || {});

  const buildingList = [...list];
  if (options?.includeUnbuilt) {
    const presentIds = new Set<number>();
    for (const b of list) {
      const id = Number(b?.id ?? b?.buildingId);
      if (Number.isFinite(id)) presentIds.add(id);
    }
    for (const sId of STANDALONE_BUILDING_IDS) {
      if (!presentIds.has(sId) && !SYSTEM_LANDMARK_IDS.has(sId)) {
        buildingList.push({ id: sId, level: 0, isBuilt: false });
      }
    }
  }

  for (const b of buildingList) {
    const bId = Number(b?.id ?? b?.buildingId);
    if (!STANDALONE_BUILDING_IDS.has(bId)) continue;
    if (SYSTEM_LANDMARK_IDS.has(bId)) continue;

    const currentSimulated = simulatedLevels.get(bId) ?? (b.isBuilt ? (b.level ?? 0) : 0);
    const isBuiltOrQueued = Boolean(b.isBuilt || currentSimulated > 0);
    const candidateNextLevel = isBuiltOrQueued ? currentSimulated + 1 : 1;

    // Check research requirement for unbuilt buildings
    if (!isBuiltOrQueued) {
      const requiredTech = BUILDING_RESEARCH_REQUIREMENTS[bId];
      if (requiredTech && !hasCompletedResearch(completedResearches, requiredTech)) {
        continue;
      }
    }

    // Hall of Heroes limitation: non-hall buildings cannot exceed simulated Hall of Heroes level
    if (bId !== 20 && candidateNextLevel > simulatedHall) continue;

    const helper = bHelper || buildingDataHelper;
    if (
      helper?.getBuildingLevelData &&
      helper.data?.[bId] &&
      !helper.getBuildingLevelData(bId, candidateNextLevel)
    ) {
      continue;
    }

    if (helper?.getMissingRequirements) {
      const missing = helper.getMissingRequirements(bId, candidateNextLevel, simulatedLevels);
      if (missing && missing.length > 0) continue;
    }

    const durationMs = helper?.calculateEffectiveDurationMs
      ? helper.calculateEffectiveDurationMs(bId, candidateNextLevel)
      : calculateEffectiveDurationMs(bId, candidateNextLevel) || 1000;

    candidates.push({
      id: bId,
      currentLevel: currentSimulated,
      nextLevel: candidateNextLevel,
      isBuilt: isBuiltOrQueued,
      durationMs,
    });
  }
  return candidates;
}

export function extractQueues(cache: Record<string, any>): any[] {
  const raw =
    cache?.buildingStatus?.data?.queues ??
    cache?.buildingStatus?.data?.queue ??
    (Array.isArray(cache?.buildingStatus?.data) ? cache.buildingStatus.data : null) ??
    cache?.building_getQueue?.data?.queues ??
    cache?.building_getQueue?.data;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.queues)) return raw.queues;
    if (
      Number.isFinite(raw.buildingId) ||
      Number.isFinite(raw.id) ||
      Number.isFinite(raw.startDate) ||
      Number.isFinite(raw.startTime)
    ) {
      return [raw];
    }
    return Object.values(raw).filter((item) => item && typeof item === 'object');
  }
  return [];
}

export function getQueueEnd(q: any, now = Date.now()): number {
  if (!q) return 0;
  if (Number.isFinite(q.finishTime)) {
    return now > 1e11 && q.finishTime < 1e11 && q.finishTime > 1e8
      ? q.finishTime * 1000
      : q.finishTime;
  }
  if (Number.isFinite(q.endTime)) {
    return now > 1e11 && q.endTime < 1e11 && q.endTime > 1e8 ? q.endTime * 1000 : q.endTime;
  }
  let start = Number.isFinite(q.startDate)
    ? q.startDate
    : Number.isFinite(q.startTime)
    ? q.startTime
    : 0;
  const startInSeconds = now > 1e11 && start < 1e11 && start > 1e8;
  if (startInSeconds) start *= 1000;
  let dur = Number.isFinite(q.durationMs)
    ? q.durationMs
    : Number.isFinite(q.duration)
    ? q.duration
    : 0;
  if (startInSeconds && Number.isFinite(q.duration) && !Number.isFinite(q.durationMs)) {
    dur *= 1000;
  }
  if (!start && !dur) return 0;
  return start + dur;
}

export function normalizeQueuedItem<T extends Partial<BuildingQueueItem>>(item: T): T {
  return normalizeQueuedDuration(item) ?? item;
}

export function calculateQueueTimeline(
  rawQueues: any = [],
  queueItems: any = [],
  now = Date.now(),
  options?: { maxSlots?: number }
): BuildingQueueTimeline {
  const safeQueues = Array.isArray(rawQueues)
    ? rawQueues
    : rawQueues && typeof rawQueues === 'object'
    ? Object.values(rawQueues)
    : [];
  const safeItems = Array.isArray(queueItems)
    ? queueItems
    : queueItems && typeof queueItems === 'object'
    ? Object.values(queueItems)
    : [];
  const inProgress = safeQueues.filter((q: any) => getQueueEnd(q, now) > now);

  const maxSlots = options?.maxSlots ?? (safeQueues.length > 1 ? safeQueues.length : 1);
  const builderCursors: number[] = [];
  for (let i = 0; i < maxSlots; i++) {
    if (i < inProgress.length) {
      builderCursors.push(getQueueEnd(inProgress[i], now));
    } else {
      builderCursors.push(now);
    }
  }

  const timeline: BuildingQueueItem[] = [];
  let totalDurationMs = 0;
  for (const rawItem of safeItems) {
    const item = normalizeQueuedItem(rawItem);
    const durationMs = Number(item.durationMs) || 1000;

    let earliestIndex = 0;
    for (let c = 1; c < builderCursors.length; c++) {
      if (builderCursors[c] < builderCursors[earliestIndex]) {
        earliestIndex = c;
      }
    }

    const estStart = Math.max(now, builderCursors[earliestIndex]);
    const estFinish = estStart + durationMs;
    builderCursors[earliestIndex] = estFinish;
    totalDurationMs += durationMs;
    timeline.push({
      ...item,
      estStart,
      estFinish,
    });
  }

  const builderFreeAt =
    inProgress.length >= maxSlots
      ? Math.min(...inProgress.map((q: any) => getQueueEnd(q, now)))
      : now;

  return {
    items: timeline,
    totalDurationMs,
    allDoneAt: Math.max(...builderCursors, now),
    builderFreeAt: inProgress.length > 0 && maxSlots === 1 ? Math.max(...inProgress.map((q: any) => getQueueEnd(q, now))) : builderFreeAt,
  };
}

export function extractBuildingLevels(cache: Record<string, any>): Map<number, number> {
  const levels = new Map<number, number>();
  const raw =
    cache?.buildingStatus?.data?.buildings ||
    cache?.clan_getSummary?.data?.buildings ||
    cache?.building_getSummary?.data?.buildings ||
    cache?.buildingSummary?.data?.buildings ||
    cache?.getSummary?.data?.buildings;
  if (Array.isArray(raw)) {
    for (const b of raw) {
      const id = Number(b.buildingId ?? b.id);
      if (Number.isFinite(id)) levels.set(id, Number(b.level) || 0);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, b] of Object.entries(raw)) {
      const id = Number((b as any)?.buildingId ?? (b as any)?.id ?? key);
      if (Number.isFinite(id)) {
        levels.set(id, typeof b === 'number' ? b : Number((b as any)?.level) || 0);
      }
    }
  }
  return levels;
}

export function planNextStep(
  queueState: BuildingQueueState | null | undefined,
  cache: Record<string, any>,
  now = Date.now()
): BuildingQueuePlanResult {
  const rawQueues = extractQueues(cache);
  const inProgress = rawQueues.filter((q) => getQueueEnd(q, now) > now);
  const finished = rawQueues.filter((q) => {
    const end = getQueueEnd(q, now);
    return end > 0 && end <= now;
  });

  const buildingLevels = extractBuildingLevels(cache);
  const skippedItems: any[] = [];
  const safeItems: BuildingQueueItem[] = Array.isArray(queueState?.items)
    ? queueState.items.map(normalizeQueuedItem)
    : [];

  // 1. Separate already completed items
  const pendingItems: BuildingQueueItem[] = [];
  for (const item of safeItems) {
    const bId = Number(item.buildingId);
    const reqNextLevel = Number(item.nextLevel);
    const curLvl = buildingLevels.get(bId) ?? 0;
    if (Number.isFinite(bId) && Number.isFinite(reqNextLevel) && curLvl >= reqNextLevel) {
      skippedItems.push({
        ...item,
        currentLevel: curLvl,
        reason: `Already completed (level ${curLvl} >= target ${reqNextLevel})`,
      });
    } else {
      pendingItems.push(item);
    }
  }

  // 2. Complete finished constructions first if any
  const calls: any[] = [];
  for (const f of finished) {
    const bId = Number(f.buildingId ?? f.id);
    const lvl = Number(f.nextLevel ?? f.level);
    if (Number.isFinite(bId) && Number.isFinite(lvl)) {
      calls.push({
        name: 'completeConstruction',
        feature: 'building',
        args: {
          buildingId: bId,
          nextLevel: lvl,
          completeDate: now,
        },
      });
    }
  }

  // 3. Determine max capacity:
  // Explicitly configured maxSlots (e.g. 2), or detected from active queues (> 1),
  // otherwise default to 1 for backward compatibility.
  const maxSlots =
    Number(queueState?.maxSlots) ||
    (rawQueues.length > 1 ? rawQueues.length : 1);

  // If all builder slots are currently occupied, wait until the earliest one finishes
  if (inProgress.length >= maxSlots) {
    const nextWake = Math.min(...inProgress.map((q) => getQueueEnd(q, now))) + 1000;
    return {
      action: calls.length > 0 ? 'complete-only' : 'wait',
      wakeAt: nextWake,
      calls,
      skippedItems,
      remainingItemsAfterSkip: pendingItems,
    };
  }

  // 4. We have at least one free builder slot! Look for the highest priority eligible item.
  const inProgressBuildingIds = new Set<number>(
    inProgress
      .map((q) => Number(q.buildingId ?? q.id))
      .filter((id) => Number.isFinite(id))
  );

  const inProgressProjectedLevels = new Map<number, number>(buildingLevels);
  for (const q of inProgress) {
    const qId = Number(q.buildingId ?? q.id);
    const qLvl = Number(q.nextLevel ?? q.level);
    if (Number.isFinite(qId) && Number.isFinite(qLvl)) {
      inProgressProjectedLevels.set(qId, Math.max(inProgressProjectedLevels.get(qId) || 0, qLvl));
    }
  }

  const hasBuildingData = buildingLevels.size > 0;
  const currentHallLvl = buildingLevels.get(20);
  const projectedHallLvl = inProgressProjectedLevels.get(20);

  let startedCandidate: BuildingQueueItem | null = null;
  let startedCandidateIndex = -1;

  if (queueState?.enabled !== false && pendingItems.length > 0) {
    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      const bId = Number(item.buildingId);
      const nextLvl = Number(item.nextLevel);

      // Cannot upgrade the same building if it is already in progress in another parallel slot
      if (inProgressBuildingIds.has(bId)) {
        continue;
      }

      // Check if item's prerequisite is currently in-progress in the parallel slot
      if (inProgress.length > 0 && hasBuildingData) {
        // Hall limitation: if nextLvl exceeds current Hall, but parallel slot is currently building Hall
        if (
          bId !== 20 &&
          Number.isFinite(currentHallLvl) &&
          nextLvl > (currentHallLvl as number) &&
          Number.isFinite(projectedHallLvl) &&
          (projectedHallLvl as number) >= nextLvl
        ) {
          // Hall is being upgraded in parallel slot, skip this item for now
          continue;
        }

        // Check if any missing prerequisite is currently being built in parallel slot
        if (buildingDataHelper?.getMissingRequirements) {
          const missingNow = buildingDataHelper.getMissingRequirements(bId, nextLvl, buildingLevels) || [];
          if (missingNow.length > 0 && missingNow.some((m: any) => inProgressBuildingIds.has(m.buildingId))) {
            // Prerequisite is being upgraded in parallel slot, skip this item for now
            continue;
          }
        }
      }

      // Found the first valid item!
      startedCandidate = item;
      startedCandidateIndex = i;
      break;
    }
  }

  if (startedCandidate && startedCandidateIndex >= 0) {
    const bId = Number(startedCandidate.buildingId);
    const nextLvl = Number(startedCandidate.nextLevel);
    const currentLvl =
      startedCandidate.currentLevel !== undefined
        ? Number(startedCandidate.currentLevel)
        : nextLvl > 1
        ? nextLvl - 1
        : 0;
    const durationMs =
      Number(startedCandidate.durationMs) ||
      calculateEffectiveDurationMs(bId, nextLvl) ||
      60000;

    calls.push({
      name: 'startConstruction',
      feature: 'building',
      args: {
        buildingId: bId,
        nextLevel: nextLvl,
        startDate: now,
        durationMs,
      },
    });
    calls.push({ name: 'getSummary', feature: 'building', args: {} });

    const remainingItems = [
      ...pendingItems.slice(0, startedCandidateIndex),
      ...pendingItems.slice(startedCandidateIndex + 1),
    ];

    const allWakeTimes = [
      ...inProgress.map((q) => getQueueEnd(q, now)),
      now + durationMs,
    ];
    const nextWake = Math.min(...allWakeTimes) + 1000;

    return {
      action: 'start',
      startedItem: {
        ...startedCandidate,
        buildingId: bId,
        nextLevel: nextLvl,
        currentLevel: currentLvl,
        durationMs,
      },
      remainingItems,
      wakeAt: nextWake,
      calls,
      skippedItems,
      remainingItemsAfterSkip: pendingItems,
    };
  }

  // If no item could be started because of prerequisite bottlenecks while other slots are working
  if (inProgress.length > 0) {
    const nextWake = Math.min(...inProgress.map((q) => getQueueEnd(q, now))) + 1000;
    if (calls.length > 0) {
      calls.push({ name: 'getSummary', feature: 'building', args: {} });
      return {
        action: 'complete-only',
        wakeAt: nextWake,
        calls,
        skippedItems,
        remainingItemsAfterSkip: pendingItems,
      };
    }
    return {
      action: 'wait',
      wakeAt: nextWake,
      calls: [],
      skippedItems,
      remainingItemsAfterSkip: pendingItems,
    };
  }

  if (calls.length > 0) {
    calls.push({ name: 'getSummary', feature: 'building', args: {} });
    return {
      action: 'complete-only',
      wakeAt: null,
      calls,
      skippedItems,
      remainingItemsAfterSkip: pendingItems,
    };
  }

  return {
    action: 'idle',
    wakeAt: null,
    calls: [],
    skippedItems,
    remainingItemsAfterSkip: pendingItems,
  };
}

export function addToQueue(
  queueState: BuildingQueueState | null | undefined,
  item: Partial<BuildingQueueItem>
): BuildingQueueState {
  const prev = queueState || { enabled: true, items: [] };
  const items: BuildingQueueItem[] = [
    ...(prev.items || []),
    {
      buildingId: Number(item.buildingId),
      currentLevel:
        item.currentLevel !== undefined
          ? Number(item.currentLevel)
          : Number(item.nextLevel) > 1
          ? Number(item.nextLevel) - 1
          : 0,
      nextLevel: Number(item.nextLevel),
      durationMs: Number(item.durationMs) || 1000,
      addedAt: item.addedAt || Date.now(),
    },
  ];
  return {
    ...prev,
    enabled: prev.enabled !== false,
    items,
  };
}

export function removeFromQueue(
  queueState: BuildingQueueState | null | undefined,
  index: number
): BuildingQueueState {
  const prev = queueState || { enabled: true, items: [] };
  const items = [...(prev.items || [])];
  if (index >= 0 && index < items.length) {
    items.splice(index, 1);
  }
  return {
    ...prev,
    items,
  };
}

export function reorderQueue(
  queueState: BuildingQueueState | null | undefined,
  fromIndex: number,
  toIndex: number
): BuildingQueueState {
  const prev = queueState || { enabled: true, items: [] };
  const items = [...(prev.items || [])];
  if (fromIndex >= 0 && fromIndex < items.length && toIndex >= 0 && toIndex < items.length) {
    const [moved] = items.splice(fromIndex, 1);
    if (moved) {
      items.splice(toIndex, 0, moved);
    }
  }
  return {
    ...prev,
    items,
  };
}

export function clearQueue(
  queueState: BuildingQueueState | null | undefined
): BuildingQueueState {
  return {
    ...(queueState || {}),
    items: [],
    wakeAt: null,
  };
}

export const buildingQueueService = {
  getSimulatedLevels,
  getQueueEnd,
  getEligibleCandidates,
  calculateQueueTimeline,
  normalizeQueuedItem,
  planNextStep,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  STANDALONE_BUILDING_IDS,
  SYSTEM_LANDMARK_IDS,
  BUILDING_RESEARCH_REQUIREMENTS,
  hasCompletedResearch,
};

export default buildingQueueService;
