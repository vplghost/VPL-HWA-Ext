// Automation helper for Building Queue with virtual prerequisite projection and auto-chaining.

(() => {
  function getSimulatedLevels(buildingMap, rawQueues = [], queueItems = []) {
    const simulated = new Map();
    if (buildingMap instanceof Map) {
      for (const [id, b] of buildingMap.entries()) {
        simulated.set(id, typeof b === 'number' ? b : (b.level ?? 0));
      }
    } else if (Array.isArray(buildingMap)) {
      for (const b of buildingMap) {
        const id = Number(b.buildingId ?? b.id);
        if (Number.isFinite(id)) simulated.set(id, b.level ?? 0);
      }
    }
    for (const q of (Array.isArray(rawQueues) ? rawQueues : Object.values(rawQueues || {}))) {
      const bId = Number(q?.buildingId);
      if (Number.isFinite(bId) && Number.isFinite(q?.level)) {
        simulated.set(bId, Math.max(simulated.get(bId) || 0, q.level));
      }
    }
    for (const item of (Array.isArray(queueItems) ? queueItems : Object.values(queueItems || {}))) {
      const bId = Number(item?.buildingId);
      if (Number.isFinite(bId) && Number.isFinite(item?.nextLevel)) {
        simulated.set(bId, Math.max(simulated.get(bId) || 0, item.nextLevel));
      }
    }
    return simulated;
  }

  const SYSTEM_LANDMARK_IDS = new Set([44, 160, 161, 166, 167, 168, 169, 176, 177]);

  function getEligibleCandidates(allBuildings, simulatedLevels, bHelper) {
    const simulatedHall = simulatedLevels.get(20) || 1;
    const candidates = [];
    for (const b of (Array.isArray(allBuildings) ? allBuildings : Object.values(allBuildings || {}))) {
      const bId = Number(b.id);
      if (SYSTEM_LANDMARK_IDS.has(bId)) continue;
      const currentSimulated = simulatedLevels.get(b.id) ?? (b.isBuilt ? b.level : 0);
      if (currentSimulated <= 0 && !b.isBuilt) continue;
      const candidateNextLevel = (currentSimulated > 0 || b.isBuilt) ? (currentSimulated + 1) : 1;

      // Hall of Heroes limitation: non-hall buildings cannot exceed simulated Hall of Heroes level
      if (b.id !== 20 && currentSimulated >= simulatedHall) continue;

      if (bHelper?.getBuildingLevelData && bHelper.data?.[b.id] && !bHelper.getBuildingLevelData(b.id, candidateNextLevel)) {
        continue;
      }

      if (bHelper?.getMissingRequirements) {
        const missing = bHelper.getMissingRequirements(b.id, candidateNextLevel, simulatedLevels);
        if (missing && missing.length > 0) continue;
      }

      const durationMs = bHelper?.calculateEffectiveDurationMs
        ? bHelper.calculateEffectiveDurationMs(b.id, candidateNextLevel)
        : 1000;

      candidates.push({
        id: b.id,
        currentLevel: currentSimulated,
        nextLevel: candidateNextLevel,
        isBuilt: b.isBuilt || currentSimulated > 0,
        durationMs
      });
    }
    return candidates;
  }

  function extractQueues(cache) {
    const raw = cache?.buildingStatus?.data?.queues ??
                cache?.buildingStatus?.data?.queue ??
                (Array.isArray(cache?.buildingStatus?.data) ? cache.buildingStatus.data : null) ??
                cache?.building_getQueue?.data?.queues ??
                cache?.building_getQueue?.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.queues)) return raw.queues;
      if (Number.isFinite(raw.buildingId) || Number.isFinite(raw.id) || Number.isFinite(raw.startDate) || Number.isFinite(raw.startTime)) {
        return [raw];
      }
      return Object.values(raw).filter((item) => item && typeof item === 'object');
    }
    return [];
  }

  function getQueueEnd(q, now = Date.now()) {
    if (!q) return 0;
    if (Number.isFinite(q.finishTime)) {
      return (now > 1e11 && q.finishTime < 1e11 && q.finishTime > 1e8) ? q.finishTime * 1000 : q.finishTime;
    }
    if (Number.isFinite(q.endTime)) {
      return (now > 1e11 && q.endTime < 1e11 && q.endTime > 1e8) ? q.endTime * 1000 : q.endTime;
    }
    let start = Number.isFinite(q.startDate) ? q.startDate : (Number.isFinite(q.startTime) ? q.startTime : 0);
    if (now > 1e11 && start < 1e11 && start > 1e8) start *= 1000;
    let dur = Number.isFinite(q.durationMs) ? q.durationMs : (Number.isFinite(q.duration) ? q.duration : 0);
    if (Number.isFinite(q.duration) && !Number.isFinite(q.durationMs) && dur > 0 && dur < 100000 && (start > 1e8 || now > 1e8)) {
      dur *= 1000;
    }
    if (!start && !dur) return 0;
    return start + dur;
  }

  function calculateQueueTimeline(rawQueues = [], queueItems = [], now = Date.now()) {
    const safeQueues = Array.isArray(rawQueues) ? rawQueues : (rawQueues && typeof rawQueues === 'object' ? Object.values(rawQueues) : []);
    const safeItems = Array.isArray(queueItems) ? queueItems : (queueItems && typeof queueItems === 'object' ? Object.values(queueItems) : []);
    const inProgress = safeQueues.filter((q) => getQueueEnd(q, now) > now);
    let currentCursor = inProgress.length > 0
      ? Math.max(...inProgress.map((q) => getQueueEnd(q, now)))
      : now;

    const timeline = [];
    let totalDurationMs = 0;
    for (const item of safeItems) {
      const durationMs = Number(item.durationMs) || 1000;
      const estStart = currentCursor;
      const estFinish = estStart + durationMs;
      totalDurationMs += durationMs;
      timeline.push({
        ...item,
        estStart,
        estFinish
      });
      currentCursor = estFinish;
    }

    return {
      items: timeline,
      totalDurationMs,
      allDoneAt: currentCursor,
      builderFreeAt: inProgress.length > 0 ? Math.max(...inProgress.map((q) => getQueueEnd(q, now))) : now
    };
  }

  function planNextStep(queueState, cache, now = Date.now()) {
    const rawQueues = extractQueues(cache);
    const inProgress = rawQueues.filter((q) => getQueueEnd(q, now) > now);
    const finished = rawQueues.filter((q) => {
      const end = getQueueEnd(q, now);
      return end > 0 && end <= now;
    });

    if (inProgress.length > 0) {
      const nextWake = Math.min(...inProgress.map((q) => getQueueEnd(q, now))) + 1000;
      return {
        action: 'wait',
        wakeAt: nextWake,
        calls: []
      };
    }

    const calls = [];
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
            completeDate: now
          }
        });
      }
    }

    if (queueState?.enabled !== false && Array.isArray(queueState?.items) && queueState.items.length > 0) {
      const nextItem = queueState.items[0];
      const durationMs = Number(nextItem.durationMs) ||
        (globalThis.hwaHelperBuildingData?.calculateEffectiveDurationMs
          ? globalThis.hwaHelperBuildingData.calculateEffectiveDurationMs(nextItem.buildingId, nextItem.nextLevel)
          : 60000) || 60000;

      calls.push({
        name: 'startConstruction',
        feature: 'building',
        args: {
          buildingId: nextItem.buildingId,
          nextLevel: nextItem.nextLevel,
          startDate: now,
          durationMs
        }
      });
      calls.push({ name: 'getSummary', feature: 'building', args: {} });

      return {
        action: 'start',
        startedItem: { ...nextItem, durationMs },
        remainingItems: queueState.items.slice(1),
        wakeAt: now + durationMs + 1000,
        calls
      };
    }

    if (calls.length > 0) {
      calls.push({ name: 'getSummary', feature: 'building', args: {} });
      return {
        action: 'complete-only',
        wakeAt: null,
        calls
      };
    }

    return {
      action: 'idle',
      wakeAt: null,
      calls: []
    };
  }

  function addToQueue(queueState, item) {
    const prev = queueState || { enabled: true, items: [] };
    const items = [...(prev.items || []), {
      buildingId: Number(item.buildingId),
      currentLevel: item.currentLevel !== undefined ? Number(item.currentLevel) : (Number(item.nextLevel) > 1 ? Number(item.nextLevel) - 1 : 0),
      nextLevel: Number(item.nextLevel),
      durationMs: Number(item.durationMs) || 1000,
      addedAt: item.addedAt || Date.now()
    }];
    return {
      ...prev,
      enabled: prev.enabled !== false,
      items
    };
  }

  function removeFromQueue(queueState, index) {
    const prev = queueState || { enabled: true, items: [] };
    const items = [...(prev.items || [])];
    if (index >= 0 && index < items.length) {
      items.splice(index, 1);
    }
    return {
      ...prev,
      items
    };
  }

  function reorderQueue(queueState, fromIndex, toIndex) {
    const prev = queueState || { enabled: true, items: [] };
    const items = [...(prev.items || [])];
    if (fromIndex >= 0 && fromIndex < items.length && toIndex >= 0 && toIndex < items.length) {
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
    }
    return {
      ...prev,
      items
    };
  }

  function clearQueue(queueState) {
    return {
      ...(queueState || {}),
      items: [],
      wakeAt: null
    };
  }

  globalThis.hwaHelperBuildingQueue = {
    getSimulatedLevels,
    getEligibleCandidates,
    calculateQueueTimeline,
    planNextStep,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue
  };
})();
