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
  const producedMaterialIds = new Set([1, 2, 3, 4, 5]);
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
        label || `${typeNames[item.type] || item.type} #${item.id}`,
        item.type === 'material' && producedMaterialIds.has(item.id) ? { renewable: true } : {});
    });
  }

  function resourceAction(record, call, key, delta) {
    if (!Number.isFinite(delta) || delta === 0 || !call.ident) return [];
    return [{ key: 'resourceAction', method: call.name, feature: call.feature || null,
      group: 'internal', data: { resourceKey: `resource:${key}`, delta,
        token: `${call.ident}:${key}` }, updatedAt: record.timestamp }];
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
        if (result && Object.hasOwn(result, 'response') && !result.error) {
          if (call.name === 'heroUpgradeSkill') {
            return resourceAction(record, call, 'refillable:2', -1);
          }
          if (['missionRaid', 'missionStart', 'missionEnd'].includes(call.name)) {
            const costs = globalThis.hwaHelperMissionCosts?.[call.args?.id];
            if (!costs) return [];
            const [startCost, winCost] = costs;
            const delta = call.name === 'missionRaid' ? -winCost * call.args?.times :
              call.name === 'missionStart' ? -startCost :
              call.args?.result?.win === true ? -(winCost - startCost) : 0;
            return resourceAction(record, call, 'energy', delta);
          }
          if (call.name === 'readAndClaimAll' && Array.isArray(result.response?.claimedRewards)) {
            const rewards = new Map();
            for (const reward of result.response.claimedRewards) {
              const type = reward?.type;
              const id = reward?.id;
              const key = type === 'gold' || type === 'starMoney' ? type :
                resourceTypes.has(type) && Number.isInteger(id) ? `${type}:${id}` : null;
              if (key && Number.isFinite(reward.amount) && reward.amount > 0) {
                rewards.set(key, (rewards.get(key) || 0) + reward.amount);
              }
            }
            return [...rewards].flatMap(([rewardKey, amount]) =>
              resourceAction(record, call, rewardKey, amount));
          }
        }
        if (call.name === 'remoteConfigInit' && result?.response?.index?.configs) {
          const configs = result.response.index.configs;
          return [{ key: 'productionConfigStatus', method: call.name, feature: null,
            group: 'internal', data: { bonusUrl: configs.bonus?.url,
              campaignUrl: configs.resourceProductionCampaign?.url },
            updatedAt: record.timestamp }];
        }
        if (key === 'getSummary:resourceProduction' && Array.isArray(result?.response?.producers)) {
          return [{ key: 'productionStatus', method: call.name, feature: call.feature,
            group: 'internal', data: { producers: result.response.producers
              .filter((producer) => Number.isInteger(producer.id))
              .map((producer) => ({ id: producer.id,
                residentCount: Array.isArray(producer.residents) ? producer.residents.length : 0 })) },
            updatedAt: record.timestamp }];
        }
        if (key === 'getSummary:bonus' && Array.isArray(result?.response?.persistentBonuses)) {
          const active = result.response;
          const entries = [];
          for (const source of [active, active.clanBonuses]) {
            if (!source) continue;
            for (const field of ['persistentBonuses', 'temporaryBonuses', 'stackableBonuses']) {
              for (const bonus of source[field] || []) {
                const id = typeof bonus === 'number' ? bonus : bonus?.id;
                const count = typeof bonus === 'number' ? 1 : bonus?.counter ?? 1;
                if (Number.isInteger(id) && Number.isFinite(count) && count > 0) entries.push([id, count]);
              }
            }
          }
          return [{ key: 'productionBonusStatus', method: call.name, feature: call.feature,
            group: 'internal', data: { bonuses: entries }, updatedAt: record.timestamp }];
        }
        if (call.name === 'missionGetAll' && result?.response) {
          const completed = Object.entries(result.response).filter(([id, mission]) =>
            /^\d+$/.test(id) && Number.isFinite(mission?.stars) && mission.stars > 0)
            .map(([id]) => Number(id));
          const progress = { key: 'missionProgressStatus', method: call.name, feature: null,
            group: 'internal', data: { completed }, updatedAt: record.timestamp };
          return group ? [progress, { key, method: call.name, feature: null,
            group, data: result.response, updatedAt: record.timestamp }] : [progress];
        }
        if (call.name === 'userGetInfo' && result?.response) {
          const info = result.response;
          const entries = [
            ...resource('gold', info.gold, record, call.name, 'Gold'),
            ...resource('starMoney', info.starMoney, record, call.name, 'Emeralds')
          ];
          if (typeof info.name === 'string' && info.name.trim()) entries.push({
            key: 'accountStatus', method: call.name, feature: null, group: 'header',
            data: { name: info.name.slice(0, 80), level: info.level }, updatedAt: record.timestamp
          });
          for (const item of info.refillable || []) {
            const rule = globalThis.hwaHelperRefillableRules?.[item.id];
            const label = rule?.label || `Refillable #${item.id}`;
            const cap = rule?.capFromTeamLevel && Number.isInteger(info.level) ?
              (info.level === 1 ? 60 : 60 + info.level) : rule?.cap;
            const timed = rule && Number.isFinite(item.lastRefill) && Number.isFinite(cap) ? {
              lastRefillAt: item.lastRefill * 1000, refillEveryMs: rule.interval,
              refillAmount: 1, cap, renewable: true
            } : {};
            entries.push(...resource(item.id === 1 ? 'energy' : `refillable:${item.id}`,
              item.amount, record, call.name, label, timed));
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
            const timed = item.refillableId === 1 && Number.isFinite(item.lastRefillAt) ?
              { lastRefillAt: item.lastRefillAt, refillAmount: 1, refillEveryMs: 360000,
                renewable: true } :
              item.refillableId === 2 && Number.isFinite(item.lastRefillAt) ?
              { lastRefillAt: item.lastRefillAt, refillAmount: 1, refillEveryMs: 300000,
                cap: 200, renewable: true } : {};
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
                worldMaterialNames[id] && type === 'material' ? worldMaterialNames[id] :
                  `${typeNames[type] || type} #${id}`,
                type === 'material' && producedMaterialIds.has(Number(id)) ? { renewable: true } : {}));
            }
          }
          return [{ key, method: call.name, feature: null, group,
            data: result.response, updatedAt: record.timestamp }, ...entries];
        }
        if (call.name === 'getSummary' && ['building', 'personalResearch'].includes(call.feature) &&
            Array.isArray(result?.response?.queues)) {
          const queues = result.response.queues.filter((queue) =>
            Number.isFinite(queue.startDate) && Number.isFinite(queue.durationMs) && queue.durationMs >= 0)
            .map((queue, index) => ({ startDate: queue.startDate, durationMs: queue.durationMs,
              researchId: queue.researchId, queueNumber: queue.queueNumber ?? index }));
          return [{ key: call.feature === 'building' ? 'buildingStatus' : 'researchStatus',
            method: call.name, feature: call.feature, group: 'header', data: { queues },
            updatedAt: record.timestamp }];
        }
        if (key === 'startResearch:personalResearch' && result?.response &&
            Number.isFinite(call.args?.startDate) && Number.isFinite(call.args?.durationMs) &&
            call.args.durationMs >= 0) {
          return [{ key: 'researchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'start', queue: {
              researchId: call.args.researchId, queueNumber: call.args.queueNumber,
              startDate: call.args.startDate, durationMs: call.args.durationMs
            } }, updatedAt: record.timestamp }];
        }
        if (key === 'completeResearch:personalResearch' && result?.response) {
          return [{ key: 'researchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'complete', researchId: call.args?.researchId },
            updatedAt: record.timestamp }];
        }
        if (key === 'createRally:mob' && result?.response?.rally?.rallyId) {
          return [{ key: 'worldEnergyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'create', rallyId: result.response.rally.rallyId },
            updatedAt: record.timestamp }];
        }
        if (key === 'cancelRally:rally' && result?.response && call.args?.rallyId) {
          return [{ key: 'worldEnergyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'cancel', rallyId: call.args.rallyId },
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
        if (entry.key === 'resourceAction') {
          const resourceEntry = next[entry.data.resourceKey];
          const seen = next.resourceActionHistory?.data || {};
          if (!resourceEntry || !Number.isFinite(resourceEntry.data?.amount) ||
              seen[entry.data.token] || resourceEntry.updatedAt > entry.updatedAt) continue;
          const actionAt = Date.parse(entry.updatedAt);
          if (!Number.isFinite(actionAt)) continue;
          const data = { ...resourceEntry.data };
          const timed = Number.isFinite(data.lastRefillAt) &&
            Number.isFinite(data.refillEveryMs) && data.refillEveryMs > 0 &&
            Number.isFinite(data.refillAmount) && data.refillAmount > 0 &&
            Number.isFinite(data.cap);
          if (timed && data.amount < data.cap) {
            const cycles = Math.floor(Math.max(0, actionAt - data.lastRefillAt) /
              data.refillEveryMs);
            data.amount = Math.min(data.cap, data.amount + cycles * data.refillAmount);
            data.lastRefillAt += cycles * data.refillEveryMs;
          }
          const wasFull = timed && data.amount >= data.cap;
          data.amount = Math.max(0, data.amount + entry.data.delta);
          if (wasFull && entry.data.delta < 0 && data.amount < data.cap) {
            data.lastRefillAt = actionAt;
          }
          next[entry.data.resourceKey] = { ...resourceEntry, method: entry.method,
            data, updatedAt: entry.updatedAt };
          if (entry.data.resourceKey === 'resource:energy') {
            next.energyStatus = { key: 'energyStatus', method: entry.method,
              feature: null, group: 'header', data: { energy: data.amount },
              updatedAt: entry.updatedAt };
          }
          const history = { ...seen, [entry.data.token]: entry.updatedAt };
          const tokens = Object.keys(history).sort((a, b) =>
            history[b].localeCompare(history[a]));
          for (const token of tokens.slice(500)) delete history[token];
          next.resourceActionHistory = { key: 'resourceActionHistory',
            method: entry.method, feature: null, group: 'internal', data: history,
            updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'worldEnergyAction') {
          const state = next.worldEnergyRallies?.data || {};
          const previous = state[entry.data.rallyId];
          if (previous && previous.updatedAt >= entry.updatedAt) continue;
          if (entry.data.action === 'cancel' && previous?.active !== true) continue;
          if (entry.data.action === 'create' && previous) continue;
          const actionAt = Date.parse(entry.updatedAt);
          const energy = next['resource:world-energy'];
          const snapshotAt = energy ? Date.parse(energy.updatedAt) : Infinity;
          const applies = energy && actionAt >= snapshotAt;
          // All current globalMapMobRally attackCost entries charge 25 refillableResource #2.
          const delta = entry.data.action === 'create' ? -25 : 25;
          if (applies && Number.isFinite(energy.data.amount)) {
            const data = { ...energy.data };
            if (Number.isFinite(data.lastRefillAt) && Number.isFinite(data.refillEveryMs) &&
                Number.isFinite(data.cap) && data.refillEveryMs > 0 && data.amount < data.cap) {
              data.amount = Math.min(data.cap, data.amount +
                Math.floor(Math.max(0, actionAt - data.lastRefillAt) / data.refillEveryMs));
              data.lastRefillAt += Math.floor(Math.max(0, actionAt - data.lastRefillAt) /
                data.refillEveryMs) * data.refillEveryMs;
            }
            const full = Number.isFinite(data.cap) && data.amount >= data.cap;
            data.amount = Math.max(0, Math.min(Number.isFinite(data.cap) ? data.cap : Infinity,
              data.amount + delta));
            if (full && delta < 0) data.lastRefillAt = actionAt;
            next['resource:world-energy'] = { ...energy, method: entry.method, data,
              updatedAt: entry.updatedAt };
            next.worldEnergyStatus = { key: 'worldEnergyStatus', method: entry.method,
              feature: entry.feature, group: 'header', data: { energy: data.amount },
              updatedAt: entry.updatedAt };
          }
          const states = { ...state, [entry.data.rallyId]: {
            active: entry.data.action === 'create', updatedAt: entry.updatedAt
          } };
          const ids = Object.keys(states).sort((a, b) =>
            states[b].updatedAt.localeCompare(states[a].updatedAt));
          for (const id of ids.slice(40)) delete states[id];
          next.worldEnergyRallies = { key: 'worldEnergyRallies', method: entry.method,
            feature: entry.feature, group: 'internal', data: states, updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (next[entry.key] && next[entry.key].updatedAt > entry.updatedAt) continue;
        if (entry.key === 'researchStatus' && entry.data.action &&
            next[entry.key]?.updatedAt === entry.updatedAt) continue;
        if (entry.key === 'researchStatus' && entry.data.action) {
          const queues = [...(next.researchStatus?.data?.queues || [])];
          if (entry.data.action === 'start') {
            const queue = entry.data.queue;
            const index = queues.findIndex((item) =>
              Number.isInteger(queue.queueNumber) ? item.queueNumber === queue.queueNumber :
                item.researchId === queue.researchId);
            if (index >= 0) queues[index] = queue;
            else queues.push(queue);
          } else {
            const index = queues.findIndex((item) => item.researchId === entry.data.researchId);
            if (index >= 0) queues.splice(index, 1);
            else if (queues.length === 1) queues.length = 0;
          }
          entry.data = { queues };
        }
        if (entry.key === 'resource:energy' && !Number.isFinite(entry.data.cap) &&
            Number.isFinite(next[entry.key]?.data?.cap)) {
          entry.data.cap = next[entry.key].data.cap;
        }
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
