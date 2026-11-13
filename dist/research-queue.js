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
    for (const q of (Array.isArray(rawQueues) ? rawQueues : Object.values(rawQueues || {}))) {
      const rId = Number(q?.researchId);
      if (Number.isFinite(rId) && Number.isFinite(q?.level)) {
        simulated.set(rId, Math.max(simulated.get(rId) || 0, q.level));
      }
    }
    for (const item of (Array.isArray(queueItems) ? queueItems : Object.values(queueItems || {}))) {
      const rId = Number(item?.researchId);
      if (Number.isFinite(rId) && Number.isFinite(item?.nextLevel)) {
        simulated.set(rId, Math.max(simulated.get(rId) || 0, item.nextLevel));
      }
    }
    return simulated;
  }

  function extractQueues(cache) {
    const raw = cache?.researchStatus?.data?.queues ??
                cache?.researchStatus?.data?.queue ??
                (Array.isArray(cache?.researchStatus?.data) ? cache.researchStatus.data : null) ??
                cache?.personalResearch_getQueue?.data?.queues ??
                cache?.personalResearch_getQueue?.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.queues)) return raw.queues;
      if (Number.isFinite(raw.researchId) || Number.isFinite(raw.id) || Number.isFinite(raw.startDate) || Number.isFinite(raw.startTime)) {
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
    const startInSeconds = now > 1e11 && start < 1e11 && start > 1e8;
    if (startInSeconds) start *= 1000;
    let dur = Number.isFinite(q.durationMs) ? q.durationMs : (Number.isFinite(q.duration) ? q.duration : 0);
    // Legacy second-based starts imply second-based duration; millisecond starts do not.
    if (startInSeconds && Number.isFinite(q.duration) && !Number.isFinite(q.durationMs)) {
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
      researcherFreeAt: inProgress.length > 0 ? Math.max(...inProgress.map((q) => getQueueEnd(q, now))) : now
    };
  }

  function extractResearchLevels(cache) {
    const levels = new Map();
    const raw = cache?.researchStatus?.data?.completedResearches ||
                cache?.researchStatus?.data?.researches ||
                cache?.clan_getSummary?.data?.completedResearches ||
                cache?.clan_getSummary?.data?.researches ||
                cache?.personalResearch_getSummary?.data?.completedResearches ||
                cache?.personalResearch_getSummary?.data?.researches;
    if (Array.isArray(raw)) {
      for (const r of raw) {
        const id = Number(r.researchId ?? r.id);
        if (Number.isFinite(id)) levels.set(id, Number(r.level) || 0);
      }
    } else if (raw && typeof raw === 'object') {
      for (const [key, r] of Object.entries(raw)) {
        const id = Number(r?.researchId ?? r?.id ?? key);
        if (Number.isFinite(id)) levels.set(id, typeof r === 'number' ? r : (Number(r?.level) || 0));
      }
    }
    return levels;
  }

  function planNextStep(queueState, cache, now = Date.now()) {
    const rawQueues = extractQueues(cache);
    const inProgress = rawQueues.filter((q) => getQueueEnd(q, now) > now);
    const finished = rawQueues.filter((q) => {
      const end = getQueueEnd(q, now);
      return end > 0 && end <= now;
    });

    const researchLevels = extractResearchLevels(cache);
    const skippedItems = [];
    const safeItems = Array.isArray(queueState?.items) ? [...queueState.items] : [];

    while (safeItems.length > 0) {
      const top = safeItems[0];
      const rId = Number(top?.researchId);
      const reqNextLevel = Number(top?.nextLevel);
      const curLvl = researchLevels.get(rId) ?? 0;
      if (Number.isFinite(rId) && Number.isFinite(reqNextLevel) && curLvl >= reqNextLevel) {
        skippedItems.push({
          ...top,
          currentLevel: curLvl,
          reason: `Already completed (level ${curLvl} >= target ${reqNextLevel})`
        });
        safeItems.shift();
      } else {
        break;
      }
    }

    if (inProgress.length > 0) {
      const nextWake = Math.min(...inProgress.map((q) => getQueueEnd(q, now))) + 1000;
      return {
        action: 'wait',
        wakeAt: nextWake,
        calls: [],
        skippedItems,
        remainingItemsAfterSkip: safeItems
      };
    }

    const calls = [];
    for (const f of finished) {
      const rId = Number(f.researchId ?? f.id);
      const lvl = Number(f.level ?? f.nextLevel);
      if (Number.isFinite(rId) && Number.isFinite(lvl)) {
        calls.push({
          name: 'completeResearch',
          feature: 'personalResearch',
          args: {
            researchId: rId,
            level: lvl,
            completeDate: now
          }
        });
      }
    }

    if (queueState?.enabled !== false && safeItems.length > 0) {
      const nextItem = safeItems[0];
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
        remainingItems: safeItems.slice(1),
        wakeAt: now + durationMs + 1000,
        calls,
        skippedItems,
        remainingItemsAfterSkip: safeItems
      };
    }

    if (calls.length > 0) {
      calls.push({ name: 'getSummary', feature: 'personalResearch', args: {} });
      return {
        action: 'complete-only',
        wakeAt: null,
        calls,
        skippedItems,
        remainingItemsAfterSkip: safeItems
      };
    }

    return {
      action: 'idle',
      wakeAt: null,
      calls: [],
      skippedItems,
      remainingItemsAfterSkip: safeItems
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
    getQueueEnd,
    calculateQueueTimeline,
    planNextStep,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue
  };
})();
