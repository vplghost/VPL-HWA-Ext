(() => {
  function amountAt(data, now) {
    if (!data || !Number.isFinite(data.amount) || !Number.isFinite(data.lastRefillAt) ||
        !Number.isFinite(data.refillEveryMs) || data.refillEveryMs <= 0 ||
        !Number.isFinite(data.refillAmount) || data.refillAmount <= 0 || !Number.isFinite(data.cap)) return null;
    if (data.amount >= data.cap) return data.amount;
    return Math.min(data.cap, data.amount + Math.floor(Math.max(0, now - data.lastRefillAt) / data.refillEveryMs) * data.refillAmount);
  }

  // A document heartbeat establishes continuity; never catch up a missed crossing.
  function observe(previous, config, entry, accountId, tabId, sessionId, now) {
    const data = entry?.data;
    const amount = amountAt(data, now);
    const key = JSON.stringify(config);
    const state = { key, accountId: String(accountId), tabId, sessionId, at: now, amount,
      source: data ? { ...data } : null };
    const sameSession = previous && previous.key === key && previous.accountId === String(accountId) &&
      previous.tabId === tabId && previous.sessionId === sessionId && now > previous.at && now - previous.at <= 90000;
    const threshold = config?.threshold;
    const eligible = config?.enabled === true && String(config.accountId) === String(accountId) &&
      Number.isInteger(threshold) && threshold >= 25 && threshold <= 200 && amount !== null;
    const projected = sameSession ? amountAt(previous.source, now) : null;
    // Snapshot replacements may reflect regeneration, but positive item/reward deltas
    // are not refill snapshots and cannot prove a natural crossing.
    const sameSource = previous && JSON.stringify(previous.source) === JSON.stringify(data);
    const naturalSource = sameSource || entry?.method === 'refillableGetAll';
    return { state, trigger: !!(eligible && sameSession && previous.amount !== null &&
      previous.amount < threshold && amount === threshold && projected === threshold && naturalSource) };
  }

  function validConfig(config) {
    const o = config?.options;
    return config?.enabled === false || (config?.enabled === true && config.accountId != null &&
      Number.isInteger(config.threshold) && config.threshold >= 25 && config.threshold <= 200 &&
      o?.mapId && Number.isFinite(o.center?.x) && Number.isFinite(o.center?.y) &&
      Number.isInteger(o.level) && o.level >= 1 && o.level <= 30 &&
      Number.isInteger(o.count) && o.count >= 1 && o.count <= 100 &&
      globalThis.hwaHelperExperimentalData.rallyWaitOptions.includes(o.waitSeconds) &&
      Number.isInteger(o.minMembers) && o.minMembers >= 1 && o.minMembers <= 6 &&
      typeof o.autoCancel === 'boolean' && typeof o.teamId === 'string' &&
      Array.isArray(o.heroIds) && o.heroIds.length === 5 && new Set(o.heroIds).size === 5 &&
      o.heroIds.every(id => Number.isInteger(id) && id > 0) &&
      (o.maxTroops == null || Number.isSafeInteger(o.maxTroops) && o.maxTroops > 0));
  }
  globalThis.hwaHelperRaidEnergyAuto = { observe, amountAt, validConfig };
})();
