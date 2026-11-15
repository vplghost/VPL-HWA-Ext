(() => {
  const kinds = {
    building: { method: 'speedUpConstructionWithResources', feature: 'building', type: 'speedUpConstruction', id: 'buildingId', status: 'buildingStatus' },
    research: { method: 'speedUpResearchWithResources', feature: 'personalResearch', type: 'speedUpResearch', id: 'researchId', status: 'researchStatus' },
    healing: { method: 'speedUpHealingWithResources', feature: 'unit', type: 'speedUpUnitHealing', id: null, status: 'getHealing:unit' }
  };
  const list = raw => Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const positive = value => Number.isSafeInteger(value) && value > 0;
  function suggestedAmount(remainingMs, itemMs, available) {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0 || !positive(itemMs) || !Number.isSafeInteger(available) || available < 0) return 0;
    return Math.min(available, Math.max(0, Math.ceil(remainingMs / itemMs) - 1));
  }
  const duration = (type, id) => globalThis.hwaHelperSpeedupData?.durations[type]?.[id];
  const kindFor = call => Object.keys(kinds).find(kind => kinds[kind].method === call?.name && kinds[kind].feature === call?.feature);
  function validate(call) {
    const kind = kindFor(call), def = kinds[kind], args = call?.args;
    if (!def || !args || Object.keys(args).sort().join(',') !== (kind === 'healing'
      ? ['resourcesToReward', 'resourcesToSpend', 'speedUpDuration'] : [def.id, 'nextLevel', 'resourcesToReward', 'resourcesToSpend', 'speedUpDate']).sort().join(',')) return null;
    if (!Array.isArray(args.resourcesToReward) || args.resourcesToReward.length ||
        !Array.isArray(args.resourcesToSpend) || args.resourcesToSpend.length !== 1) return null;
    const item = args.resourcesToSpend[0];
    if (!item || Object.keys(item).sort().join(',') !== 'amount,id,type' || item.type !== def.type || !positive(item.id) || !positive(item.amount)) return null;
    const totalMs = duration(item.type, item.id) * item.amount;
    if (!positive(totalMs)) return null;
    if (kind === 'healing' ? args.speedUpDuration !== totalMs :
        !positive(args[def.id]) || !positive(args.nextLevel) || !positive(args.speedUpDate)) return null;
    return { kind, ...def, totalMs, item };
  }
  function target(cache, kind, targetId) {
    const def = kinds[kind];
    if (!def) return null;
    const entry = cache[def.status] || (kind === 'healing' ? cache.getHealing : null);
    const row = kind === 'healing' ? entry?.data?.healing : list(entry?.data?.queues).find(row => row[def.id] === targetId);
    const ms = row?.durationMs ?? row?.duration;
    if (!positive(row?.startDate) || !positive(ms)) return null;
    const level = kind === 'healing' ? null : row.level ?? row.nextLevel;
    if (kind !== 'healing' && !positive(level)) return null;
    return { kind, targetId: kind === 'healing' ? 0 : targetId, startDate: row.startDate, durationMs: ms,
      level, endsAt: row.startDate + ms, updatedAt: entry.updatedAt };
  }
  function stock(cache, kind) {
    const account = cache.accountStatus?.data?.id, snapshot = cache.speedupInventory;
    if (account == null || String(snapshot?.data?.accountId) !== String(account)) return [];
    return list(snapshot.data.items).filter(item => item.type === kinds[kind]?.type && positive(item.quantity) && positive(duration(item.type, item.id)));
  }
  function quote(cache, kind, targetId, itemId, amount, now = Date.now()) {
    const accountId = cache.accountStatus?.data?.id, row = target(cache, kind, targetId);
    if (accountId == null || !row || !positive(amount)) return null;
    const item = stock(cache, kind).find(item => item.id === itemId);
    const itemMs = duration(kinds[kind].type, itemId), totalMs = itemMs * amount;
    const fresh = at => Number.isFinite(Date.parse(at)) && now >= Date.parse(at) && now - Date.parse(at) <= 120000;
    if (!item || item.quantity < amount || !positive(totalMs) || totalMs > row.endsAt - now ||
        !fresh(row.updatedAt) || !fresh(cache.speedupInventory?.data?.observedAt ?? cache.speedupInventory?.updatedAt)) return null;
    return { accountId: String(accountId), ...row, itemId, amount, itemMs, totalMs, available: item.quantity };
  }
  function signature(value) {
    return value && JSON.stringify([value.accountId, value.kind, value.targetId, value.startDate, value.durationMs, value.level, value.itemId, value.amount, value.available]);
  }
  function buildCall(value, now = Date.now()) {
    const def = kinds[value?.kind];
    if (!def) return null;
    const args = { resourcesToSpend: [{ type: def.type, id: value.itemId, amount: value.amount }], resourcesToReward: [] };
    if (value.kind === 'healing') args.speedUpDuration = value.totalMs;
    else Object.assign(args, { [def.id]: value.targetId, nextLevel: value.level, speedUpDate: now });
    const call = { name: def.method, feature: def.feature, args };
    return validate(call) ? call : null;
  }
  const refreshCalls = kind => [{ name: 'getInventory', feature: 'inventory' }, ...(kind === 'healing'
    ? [{ name: 'getHealing', feature: 'unit' }, { name: 'getUnitSummary', feature: 'unit' }]
    : [{ name: 'getSummary', feature: kinds[kind]?.feature }])];
  globalThis.hwaHelperSpeedup = { kinds, list, duration, suggestedAmount, kindFor, validate, target, stock, quote, signature, buildCall, refreshCalls };
})();
