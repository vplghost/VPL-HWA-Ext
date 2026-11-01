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

  const resourceTypes = new Set(['material', 'coin', 'scroll', 'consumable',
    'speedUpUnitTraining', 'speedUpUniversal', 'speedUpUnitHealing',
    'speedUpConstruction', 'speedUpResearch', 'teleporter', 'lootboxChanced']);
  const worldMaterialNames = { 1: 'Elarite Shards', 2: 'Iron', 3: 'Stone',
    4: 'Wood', 5: 'Food', 12: 'Honor Marks' };
  const typeNames = { speedUpUnitTraining: 'Training Speedup',
    speedUpUniversal: 'Universal Speedup', speedUpUnitHealing: 'Healing Speedup',
    speedUpConstruction: 'Construction Speedup', speedUpResearch: 'Research Speedup',
    teleporter: 'Teleporter', lootboxChanced: 'Chance Lootbox' };

  function resource(key, amount, record, method, label, extra = {}) {
    if (!Number.isFinite(amount) || amount < 0) return [];
    return [{ key: `resource:${key}`, method, feature: null, group: 'resources',
      data: { amount, label, ...extra }, updatedAt: record.timestamp }];
  }

  function inventoryResources(items, record, method) {
    return items.flatMap((item) => {
      if (!resourceTypes.has(item?.type)) return [];
      const label = item.type === 'material' ? worldMaterialNames[item.id] : null;
      return resource(`${item.type}:${item.id}`, item.quantity, record, method,
        label || `${typeNames[item.type] || item.type} #${item.id}`);
    });
  }

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
          const info = result.response;
          const entries = [
            ...resource('gold', info.gold, record, call.name, 'Gold'),
            ...resource('starMoney', info.starMoney, record, call.name, 'Emeralds')
          ];
          if (typeof info.name === 'string' && info.name.trim()) entries.push({
            key: 'accountStatus', method: call.name, feature: null, group: 'header',
            data: { name: info.name.slice(0, 80) }, updatedAt: record.timestamp
          });
          for (const item of info.refillable || []) {
            const label = item.id === 1 ? 'Energy' : `Refillable #${item.id}`;
            entries.push(...resource(item.id === 1 ? 'energy' : `refillable:${item.id}`,
              item.amount, record, call.name, label));
            if (item.id === 1 && Number.isFinite(item.amount)) entries.push({
              key: 'energyStatus', method: call.name, feature: null, group: 'header',
              data: { energy: item.amount }, updatedAt: record.timestamp
            });
          }
          return entries;
        }
        if (key === 'refillableGetAll:refillable' && Array.isArray(result?.response?.refillables)) {
          return result.response.refillables.flatMap((item) => {
            const cacheKey = item.refillableId === 1 ? 'energyStatus' :
              item.refillableId === 2 ? 'worldEnergyStatus' : null;
            const timed = item.refillableId === 2 && Number.isFinite(item.lastRefillAt) ?
              { lastRefillAt: item.lastRefillAt, refillAmount: 1, refillEveryMs: 300000, cap: 200 } : {};
            const label = item.refillableId === 1 ? 'Energy' :
              item.refillableId === 2 ? 'World Energy' :
              item.refillableId === 6 ? 'Free Teleport' : `World refillable #${item.refillableId}`;
            const entries = resource(item.refillableId === 1 ? 'energy' :
              item.refillableId === 2 ? 'world-energy' :
              `world-refillable:${item.refillableId}`, item.amount, record, call.name, label, timed);
            if (cacheKey && entries.length) entries.push({ key: cacheKey, method: call.name,
              feature: call.feature, group: 'header', data: { energy: item.amount },
              updatedAt: record.timestamp });
            return entries;
          });
        }
        if (key === 'getInventory:inventory' && Array.isArray(result?.response?.inventory?.items)) {
          return inventoryResources(result.response.inventory.items, record, call.name);
        }
        if (call.name === 'inventoryGet' && result?.response) {
          const entries = [];
          for (const [type, items] of Object.entries(result.response)) {
            if (!resourceTypes.has(type) || !items || typeof items !== 'object') continue;
            for (const [id, amount] of Object.entries(items)) {
              entries.push(...resource(`${type}:${id}`, amount, record, call.name,
                `${typeNames[type] || type} #${id}`));
            }
          }
          return [{ key, method: call.name, feature: null, group,
            data: result.response, updatedAt: record.timestamp }, ...entries];
        }
        if (call.name === 'getSummary' && ['building', 'personalResearch'].includes(call.feature) &&
            Array.isArray(result?.response?.queues)) {
          const queues = result.response.queues.filter((queue) =>
            Number.isFinite(queue.startDate) && Number.isFinite(queue.durationMs) && queue.durationMs >= 0)
            .map((queue) => ({ startDate: queue.startDate, durationMs: queue.durationMs }));
          return [{ key: call.feature === 'building' ? 'buildingStatus' : 'researchStatus',
            method: call.name, feature: call.feature, group: 'header', data: { queues },
            updatedAt: record.timestamp }];
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
