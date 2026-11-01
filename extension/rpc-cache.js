(() => {
  const definitions = {
    heroGetAll: 'heroes',
    artifact_getAll: 'heroes',
    skin_getAll: 'heroes',
    rune_getAll: 'heroes',
    heroStatsBonus_getAll: 'heroes',
    inventoryGet: 'items',
    'getInventory:inventory': 'items',
    shopGetMany: 'items',
    offerGetAll: 'items',
    titanGetAll: 'titans',
    titan_artifactGetCounters: 'titans',
    teamGetAll: 'teams',
    'getUnitSummary:unit': 'teams',
    'getTrainings:unit': 'teams',
    questGetAll: 'other',
    missionGetAll: 'other',
    'getDailyQuests:quest': 'other',
    clanBoss_getAll: 'other',
    clanWarGetBriefInfo: 'other'
  };

  function extract(record) {
    if (record?.method !== 'POST' || record.status !== 200 ||
        record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
        record.requestBodyTruncated || record.responseBodyTruncated ||
        typeof record.requestBody !== 'string' || typeof record.responseBody !== 'string') return [];
    try {
      const request = JSON.parse(record.requestBody);
      const response = JSON.parse(record.responseBody);
      if (!Array.isArray(request.calls) || !Array.isArray(response.results)) return [];
      const results = new Map(response.results.map((result) => [result.ident, result.result]));
      return request.calls.flatMap((call) => {
        const key = `${call.name}${call.feature ? `:${call.feature}` : ''}`;
        const group = definitions[key];
        const result = results.get(call.ident);
        if (call.name === 'userGetInfo' && result?.response) {
          const energy = result.response.refillable?.find((item) => item?.id === 1)?.amount;
          if (Number.isFinite(energy) && energy >= 0) {
            return [{ key: 'energyStatus', method: 'userGetInfo', feature: null,
              group: 'header', data: { energy }, updatedAt: record.timestamp }];
          }
        }
        if (key === 'refillableGetAll:refillable' && Array.isArray(result?.response?.refillables)) {
          return result.response.refillables.flatMap((item) => {
            const cacheKey = item.refillableId === 1 ? 'energyStatus' :
              item.refillableId === 2 ? 'worldEnergyStatus' : null;
            if (!cacheKey || !Number.isFinite(item.amount) || item.amount < 0) return [];
            return [{ key: cacheKey, method: call.name, feature: call.feature,
              group: 'header', data: { energy: item.amount }, updatedAt: record.timestamp }];
          });
        }
        if (!group || !result || !Object.hasOwn(result, 'response') || result.response == null) return [];
        return [{ key, method: call.name, feature: call.feature || null,
          group, data: result.response, updatedAt: record.timestamp }];
      });
    } catch (_) {
      return [];
    }
  }

  function merge(cache, records, maxBytes = 2 * 1024 * 1024) {
    const next = { ...(cache && typeof cache === 'object' ? cache : {}) };
    let changed = false;
    for (const record of records) {
      for (const entry of extract(record)) {
        if (next[entry.key] && next[entry.key].updatedAt > entry.updatedAt) continue;
        next[entry.key] = entry;
        changed = true;
      }
    }
    if (!changed) return { cache: next, changed: false };
    const size = () => new TextEncoder().encode(JSON.stringify(next)).byteLength;
    while (size() > maxBytes && Object.keys(next).length > 1) {
      const oldest = Object.values(next).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      delete next[oldest.key];
    }
    return { cache: next, changed: true };
  }

  globalThis.hwaHelperRpcCache = { extract, merge, definitions };
})();
