// Automation helper for Personal Research Queue with virtual prerequisite projection and auto-chaining.

(() => {
  function getSimulatedLevels(researchMap, rawQueues = [], queueItems = []) {
    const simulated = new Map();
    if (researchMap && typeof researchMap.entries === 'function') {
      for (const [id, r] of researchMap.entries()) {
        const numId = Number(id);
        if (Number.isFinite(numId)) simulated.set(numId, typeof r === 'number' ? r : (r?.level ?? 0));
      }
    } else if (Array.isArray(researchMap)) {
      for (const r of researchMap) {
        const id = Number(r.researchId ?? r.id);
        if (Number.isFinite(id)) simulated.set(id, r?.level ?? 0);
      }
    }
    for (const q of rawQueues || []) {
      const rId = Number(q.researchId);
      if (Number.isFinite(rId) && Number.isFinite(q.level)) {
        simulated.set(rId, Math.max(simulated.get(rId) || 0, q.level));
      }
    }
    for (const item of queueItems || []) {
      const rId = Number(item.researchId);
      if (Number.isFinite(rId) && Number.isFinite(item.nextLevel)) {
        simulated.set(rId, Math.max(simulated.get(rId) || 0, item.nextLevel));
      }
    }
    return simulated;
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
      researcherFreeAt: inProgress.length > 0 ? Math.max(...inProgress.map((q) => q.startDate + q.durationMs)) : now
    };
  }

  function planNextStep(queueState, cache, now = Date.now()) {
    const rawQueues = cache?.researchStatus?.data?.queues || [];
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
        name: 'completeResearch',
        feature: 'personalResearch',
        args: {
          researchId: f.researchId,
          level: f.level,
          completeDate: now
        }
      });
    }

    if (queueState?.enabled !== false && Array.isArray(queueState?.items) && queueState.items.length > 0) {
      const nextItem = queueState.items[0];
      const durationMs = Number(nextItem.durationMs) ||
        (globalThis.hwaHelperResearchData?.calculateEffectiveDurationMs
          ? globalThis.hwaHelperResearchData.calculateEffectiveDurationMs(nextItem.researchId, nextItem.nextLevel)
          : 1000) || 1000;
      calls.push({
        name: 'startResearch',
        feature: 'personalResearch',
        args: {
          researchId: nextItem.researchId,
          nextLevel: nextItem.nextLevel,
          level: nextItem.nextLevel,
          startDate: now,
          durationMs,
          queueNumber: 0
        }
      });
      calls.push({ name: 'getSummary', feature: 'personalResearch', args: {} });

      return {
        action: 'start',
        startedItem: { ...nextItem, durationMs },
        remainingItems: queueState.items.slice(1),
        wakeAt: now + durationMs + 1000,
        calls
      };
    }

    if (calls.length > 0) {
      calls.push({ name: 'getSummary', feature: 'personalResearch', args: {} });
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
      researchId: Number(item.researchId),
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

  globalThis.hwaHelperResearchQueue = {
    getSimulatedLevels,
    calculateQueueTimeline,
    planNextStep,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue
  };
})();
