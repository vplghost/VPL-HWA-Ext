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
    for (const q of rawQueues || []) {
      const bId = Number(q.buildingId);
      if (Number.isFinite(bId) && Number.isFinite(q.level)) {
        simulated.set(bId, Math.max(simulated.get(bId) || 0, q.level));
      }
    }
    for (const item of queueItems || []) {
      const bId = Number(item.buildingId);
      if (Number.isFinite(bId) && Number.isFinite(item.nextLevel)) {
        simulated.set(bId, Math.max(simulated.get(bId) || 0, item.nextLevel));
      }
    }
    return simulated;
  }

  function getEligibleCandidates(allBuildings, simulatedLevels, bHelper) {
    const simulatedHall = simulatedLevels.get(20) || 1;
    const candidates = [];
    for (const b of allBuildings || []) {
      const currentSimulated = simulatedLevels.get(b.id) ?? (b.isBuilt ? b.level : 0);
      if (currentSimulated <= 0 && !b.isBuilt) continue;
      const candidateNextLevel = (currentSimulated > 0 || b.isBuilt) ? (currentSimulated + 1) : 1;

      // Hall of Heroes limitation: non-hall buildings cannot exceed simulated Hall of Heroes level
      if (b.id !== 20 && currentSimulated >= simulatedHall) continue;

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

  function calculateQueueTimeline(rawQueues = [], queueItems = [], now = Date.now()) {
    const inProgress = (rawQueues || []).filter((q) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now
    );
    let currentCursor = inProgress.length > 0
      ? Math.max(...inProgress.map((q) => q.startDate + q.durationMs))
      : now;

    const timeline = [];
    let totalDurationMs = 0;
    for (const item of queueItems || []) {
      const durationMs = item.durationMs || 1000;
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
      builderFreeAt: inProgress.length > 0 ? Math.max(...inProgress.map((q) => q.startDate + q.durationMs)) : now
    };
  }

  function planNextStep(queueState, cache, now = Date.now()) {
    const rawQueues = cache?.buildingStatus?.data?.queues || [];
    const inProgress = rawQueues.filter((q) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now
    );
    const finished = rawQueues.filter((q) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs <= now
    );

    if (inProgress.length > 0) {
      const nextWake = Math.min(...inProgress.map((q) => q.startDate + q.durationMs)) + 1000;
      return {
        action: 'wait',
        wakeAt: nextWake,
        calls: []
      };
    }

    const calls = [];
    for (const f of finished) {
      calls.push({
        name: 'completeConstruction',
        feature: 'building',
        args: {
          buildingId: f.buildingId,
          nextLevel: f.level,
          completeDate: now
        }
      });
    }

    if (queueState?.enabled !== false && Array.isArray(queueState?.items) && queueState.items.length > 0) {
      const nextItem = queueState.items[0];
      calls.push({
        name: 'startConstruction',
        feature: 'building',
        args: {
          buildingId: nextItem.buildingId,
          nextLevel: nextItem.nextLevel,
          startDate: now,
          durationMs: nextItem.durationMs
        }
      });
      calls.push({ name: 'getSummary', feature: 'building', args: {} });

      return {
        action: 'start',
        startedItem: nextItem,
        remainingItems: queueState.items.slice(1),
        wakeAt: now + nextItem.durationMs + 1000,
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
