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

  function extractMarches(response) {
    const marches = [];
    const seenSquads = new Set();
    for (const [group, stages] of [['marches', response.marches],
      ['scoutMarches', response.scoutMarches]]) {
      if (!stages || typeof stages !== 'object') continue;
      for (const [stage, list] of Object.entries(stages)) {
        if (!Array.isArray(list)) continue;
        for (const march of list) {
          if (march?.squadId && seenSquads.has(march.squadId)) continue;
          if (march?.squadId) seenSquads.add(march.squadId);
          const route = march?.route;
          const startedAt = route?.startedAt ?? march?.startedAt;
          const duration = route?.durationMs ?? march?.durationMs ?? march?.duration;
          const endsAt = Number.isFinite(startedAt) && Number.isFinite(duration) ?
            startedAt + duration : march?.plannedStartTime;
          const targetType = march?.targetType || march?.target?.objectType;
          const mineType = targetType === 'mine' ?
            globalThis.hwaHelperMineTypes?.[march?.target?.objectConfigId] : null;
          const kind = group === 'scoutMarches' ? 'scout' :
            stage === 'returnToOutpost' ? 'return' :
            mineType || (targetType === 'mine' ? 'mine' :
              stage.toLowerCase().includes('rally') ? 'raid' : 'attack');
          marches.push({ squadId: typeof march.squadId === 'string' ? march.squadId : null,
            kind, stage, endsAt: Number.isFinite(endsAt) ? endsAt : null });
        }
      }
    }
    return marches;
  }

  function rallyTeam(squad) {
    return {
      heroIds: (squad?.heroes || []).map((hero) => hero.heroId)
        .filter(Number.isInteger).slice(0, 5),
      units: (squad?.units || []).filter((unit) =>
        Number.isInteger(unit.unitId) && Number.isFinite(unit.count) && unit.count > 0)
        .map((unit) => ({ id: unit.unitId, count: unit.count })).slice(0, 5)
    };
  }

  function routeEstimate(from, to, routeType) {
    const speed = globalThis.hwaHelperRouteSpeeds?.[routeType];
    if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y) ||
        !Number.isFinite(to?.x) || !Number.isFinite(to?.y) ||
        !Number.isFinite(speed) || speed <= 0) return null;
    // Approximate straight-line route: observed route durations are near 10,000 ms per tile / speed.
    return Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 10000 / speed);
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
        if (key === 'getMarches:march' && result?.response?.marches) {
          return [{ key: 'marchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { marches: extractMarches(result.response) },
            updatedAt: record.timestamp }];
        }
        if (key === 'getRallyById:rally' && result?.response?.rally?.rallyId) {
          const rally = result.response.rally;
          const targetConfigId = rally.target?.objectConfigId ?? rally.mob?.mobConfigId;
          return [{ key: 'rallyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'details', rallyId: rally.rallyId,
              squadId: rally.leader?.squad?.squadId,
              target: globalThis.hwaHelperRallyTargets?.[targetConfigId] ||
                `Rally target #${targetConfigId ?? 'unknown'}`,
              waitUntil: rally.plannedStartTime,
              team: rallyTeam(rally.leader?.squad),
              outboundMs: routeEstimate(rally.leaderCoordinates,
                rally.target?.coordinates, 'toTargetRallyPve'),
              returnMs: routeEstimate(rally.target?.coordinates,
                rally.leaderCoordinates, 'returnToOutpost') },
            updatedAt: record.timestamp }];
        }
        if (result && Object.hasOwn(result, 'response') && !result.error) {
          if (call.name === 'heroUpgradeSkill') {
            const actions = resourceAction(record, call, 'refillable:2', -1);
            if (Number.isInteger(call.args?.heroId) && Number.isInteger(call.args?.skill)) {
              actions.push({
                key: 'heroSkillAction',
                method: call.name,
                feature: null,
                group: 'internal',
                data: {
                  heroId: call.args.heroId,
                  skillIndex: call.args.skill,
                  token: `${call.ident}:heroSkill`
                },
                updatedAt: record.timestamp
              });
            }
            return actions;
          }
          if (['missionRaid', 'missionStart', 'missionEnd'].includes(call.name)) {
            let delta = 0;
            if (call.name === 'missionRaid') {
              let expTotal = 0;
              const times = call.args?.times || 1;
              for (let i = 0; i < times; i++) {
                if (Number.isFinite(result?.response?.[i]?.experience)) {
                  expTotal += result.response[i].experience;
                }
              }
              if (expTotal > 0) {
                delta = -expTotal;
              } else {
                const costs = globalThis.hwaHelperMissionCosts?.[call.args?.id];
                if (!costs) return [];
                const [startCost, addCost] = costs;
                delta = -(startCost + addCost) * times;
              }
            } else if (call.name === 'missionStart') {
              const costs = globalThis.hwaHelperMissionCosts?.[call.args?.id];
              if (!costs) return [];
              delta = -costs[0];
            } else if (call.name === 'missionEnd') {
              const costs = globalThis.hwaHelperMissionCosts?.[call.args?.id];
              if (!costs) return [];
              delta = call.args?.result?.win === true ? -costs[1] : 0;
            }
            const actions = resourceAction(record, call, 'energy', delta);
            if (call.name === 'missionRaid' && result?.response) {
              let raidGold = 0;
              const times = call.args?.times || 1;
              for (let i = 0; i < times; i++) {
                if (Number.isFinite(result.response?.[i]?.gold)) {
                  raidGold += result.response[i].gold;
                }
              }
              if (raidGold > 0) {
                actions.push(...resourceAction(record, call, 'gold', raidGold));
              }
            }
            return actions;
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
          const teamLevel = Number(info.level);
          const entries = [
            ...resource('gold', info.gold, record, call.name, 'Gold'),
            ...resource('starMoney', info.starMoney, record, call.name, 'Emeralds')
          ];
          if (typeof info.name === 'string' && info.name.trim()) entries.push({
            key: 'accountStatus', method: call.name, feature: null, group: 'header',
            data: { name: info.name.slice(0, 80), level: teamLevel }, updatedAt: record.timestamp
          });
          for (const item of info.refillable || []) {
            const rule = globalThis.hwaHelperRefillableRules?.[item.id];
            const label = rule?.label || `Refillable #${item.id}`;
            const cap = rule?.capFromTeamLevel && Number.isInteger(teamLevel) && teamLevel > 0 ?
              (teamLevel === 1 ? 60 : 60 + teamLevel) : rule?.cap;
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
            .map((queue, index) => ({
              startDate: queue.startDate,
              durationMs: queue.durationMs,
              buildingId: queue.buildingId,
              researchId: queue.researchId,
              level: queue.level ?? queue.nextLevel,
              queueNumber: queue.queueNumber ?? index
            }));
          return [{ key: call.feature === 'building' ? 'buildingStatus' : 'researchStatus',
            method: call.name, feature: call.feature, group: 'header', data: { queues },
            updatedAt: record.timestamp }];
        }
        if (key === 'startConstruction:building' && result?.response &&
            Number.isFinite(call.args?.startDate) && Number.isFinite(call.args?.durationMs) &&
            call.args.durationMs >= 0) {
          return [{ key: 'buildingStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'start', queue: {
              buildingId: call.args.buildingId, level: call.args.nextLevel ?? call.args.level,
              queueNumber: call.args.queueNumber ?? 0,
              startDate: call.args.startDate, durationMs: call.args.durationMs
            } }, updatedAt: record.timestamp }];
        }
        if (key === 'completeConstruction:building' && result?.response) {
          return [{ key: 'buildingStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'complete', buildingId: call.args?.buildingId },
            updatedAt: record.timestamp }];
        }
        if (key === 'startResearch:personalResearch' && result?.response &&
            Number.isFinite(call.args?.startDate) && Number.isFinite(call.args?.durationMs) &&
            call.args.durationMs >= 0) {
          return [{ key: 'researchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'start', queue: {
              researchId: call.args.researchId, level: call.args.level ?? call.args.nextLevel,
              queueNumber: call.args.queueNumber,
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
            updatedAt: record.timestamp },
          { key: 'rallyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'create',
              rallyId: result.response.rally.rallyId,
              squadId: result.response.squadId,
              waitUntil: result.response.rally.plannedStartTime,
              team: rallyTeam(call.args?.squad) }, updatedAt: record.timestamp }];
        }
        if (key === 'cancelRally:rally' && result?.response && call.args?.rallyId) {
          return [{ key: 'worldEnergyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'cancel', rallyId: call.args.rallyId },
            updatedAt: record.timestamp },
          { key: 'rallyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'cancel', rallyId: call.args.rallyId },
            updatedAt: record.timestamp }];
        }
        if (call.name === 'randomDraft_getInfo' && result?.response) {
          const info = result.response;
          const stageId = Number(info.stageId);
          const matchId = info.matchId ?? null;
          const stageFinishTs = Number.isFinite(info.stageFinishTs) ? info.stageFinishTs : null;
          const enemyUser = info.enemyUser ? {
            id: String(info.enemyUser.id || ''),
            name: String(info.enemyUser.name || ''),
            level: Number(info.enemyUser.level) || null,
            clanTitle: info.enemyUser.clanTitle || null,
            avatarId: info.enemyUser.avatarId || null
          } : null;
          return [{
            key: 'legendDraftStatus',
            method: call.name,
            feature: null,
            group: 'draft',
            data: {
              active: stageId > 0 && stageId < 5,
              stageId,
              matchId,
              stageFinishTs,
              enemyUser,
              rating: info.rating || null,
              winstreak: info.winstreak || null
            },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'randomDraft_saveDefence' && Array.isArray(call.args?.heroes)) {
          return [{
            key: 'legendDraftAction',
            method: call.name,
            feature: null,
            group: 'internal',
            data: { action: 'saveDefence', heroes: call.args.heroes.filter(Number.isInteger) },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'randomDraft_saveAttack' && Array.isArray(call.args?.heroes)) {
          return [{
            key: 'legendDraftAction',
            method: call.name,
            feature: null,
            group: 'internal',
            data: { action: 'saveAttack', heroes: call.args.heroes.filter(Number.isInteger) },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'randomDraft_startBattle' && result?.response?.battleReplay) {
          const replay = result.response.battleReplay;
          return [{
            key: 'legendDraftAction',
            method: call.name,
            feature: null,
            group: 'internal',
            data: {
              action: 'startBattle',
              attackers: replay.attackers ? Object.keys(replay.attackers).map(Number) : [],
              defenders: Array.isArray(replay.defenders) && replay.defenders[0] ?
                Object.keys(replay.defenders[0]).map(Number) : []
            },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'randomDraft_result') {
          return [{
            key: 'legendDraftAction',
            method: call.name,
            feature: null,
            group: 'internal',
            data: {
              action: 'result',
              matchId: call.args?.matchId,
              result: result?.response?.result ?? null,
              rating: result?.response?.rating ?? null,
              reward: result?.response?.reward ?? null
            },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'chatGetAll' && (call.args?.chatType === 'clan' || call.args?.chatType === 'announcement') && result?.response) {
          const messages = Array.isArray(result.response.messages) ? result.response.messages : [];
          const users = result.response.users && typeof result.response.users === 'object' ? result.response.users : {};
          return [{
            key: 'guildChat',
            method: call.name,
            feature: call.args.chatType,
            group: 'chat',
            data: { messages, users },
            updatedAt: record.timestamp
          }];
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
        if (entry.key === 'rallyAction') {
          const current = next.marchStatus;
          if (current?.updatedAt > entry.updatedAt) continue;
          const marches = [...(current?.data?.marches || [])];
          const index = marches.findIndex((march) => march.rally?.id === entry.data.rallyId);
          if (entry.data.action === 'create') {
            if (index >= 0 || !entry.data.squadId ||
                !Number.isFinite(entry.data.waitUntil)) continue;
            marches.push({ squadId: entry.data.squadId, kind: 'raid',
              stage: 'waitingForRallyStart', endsAt: entry.data.waitUntil,
              rally: { id: entry.data.rallyId, waitUntil: entry.data.waitUntil,
                team: entry.data.team } });
          } else if (entry.data.action === 'details') {
            if (index < 0 || current.updatedAt === entry.updatedAt) continue;
            const previous = marches[index];
            marches[index] = { ...previous, rally: { ...previous.rally,
              target: entry.data.target,
              waitUntil: Number.isFinite(entry.data.waitUntil) ?
                entry.data.waitUntil : previous.rally.waitUntil,
              team: entry.data.team?.heroIds?.length ? entry.data.team : previous.rally.team,
              outboundMs: entry.data.outboundMs,
              returnMs: entry.data.returnMs } };
          } else if (entry.data.action === 'cancel') {
            if (index < 0) continue;
            marches.splice(index, 1);
          }
          next.marchStatus = { key: 'marchStatus', method: entry.method,
            feature: entry.feature, group: 'header', data: { marches },
            updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
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
        if (entry.key === 'legendDraftStatus') {
          const previous = next.legendDraftStatus?.data || {};
          if (next.legendDraftStatus && next.legendDraftStatus.updatedAt > entry.updatedAt) continue;
          next.legendDraftStatus = {
            key: 'legendDraftStatus',
            method: entry.method,
            feature: null,
            group: 'draft',
            data: {
              ...previous,
              ...entry.data,
              defenceHeroes: previous.defenceHeroes || [],
              attackHeroes: previous.attackHeroes || []
            },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }
        if (entry.key === 'legendDraftAction') {
          const draft = next.legendDraftStatus ? { ...next.legendDraftStatus.data } : { active: true };
          if (entry.data.action === 'saveDefence') {
            draft.defenceHeroes = entry.data.heroes;
            draft.stageId = 4;
            draft.lastPickAction = 'saveDefence';
          } else if (entry.data.action === 'saveAttack') {
            draft.attackHeroes = entry.data.heroes;
            draft.stageId = 5;
            draft.lastPickAction = 'saveAttack';
          } else if (entry.data.action === 'startBattle') {
            draft.stageId = 5;
            draft.inBattle = true;
            if (entry.data.attackers?.length) draft.attackHeroes = entry.data.attackers;
            if (entry.data.defenders?.length) draft.enemyDefenceHeroes = entry.data.defenders;
          } else if (entry.data.action === 'result') {
            draft.active = false;
            draft.inBattle = false;
            draft.stageId = 0;
            draft.lastResult = entry.data;
          }
          next.legendDraftStatus = {
            key: 'legendDraftStatus',
            method: entry.method,
            feature: null,
            group: 'draft',
            data: draft,
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }
        if (entry.key === 'heroSkillAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token] || !entry.data.heroId) continue;
          const heroId = String(entry.data.heroId);
          const heroSnap = next.heroGetAll?.data?.[heroId];
          if (heroSnap && heroSnap.skills) {
            const skills = { ...heroSnap.skills };
            const sortedKeys = Object.keys(skills).sort((a, b) => Number(a) - Number(b));
            const targetKey = sortedKeys[(entry.data.skillIndex || 1) - 1];
            if (targetKey) {
              skills[targetKey] = (skills[targetKey] || 0) + 1;
              next.heroGetAll = {
                ...next.heroGetAll,
                data: {
                  ...next.heroGetAll.data,
                  [heroId]: {
                    ...heroSnap,
                    skills
                  }
                }
              };
              const history = { ...seen, [entry.data.token]: entry.updatedAt };
              const tokens = Object.keys(history).sort((a, b) =>
                history[b].localeCompare(history[a]));
              for (const token of tokens.slice(500)) delete history[token];
              next.resourceActionHistory = {
                key: 'resourceActionHistory',
                method: entry.method,
                feature: null,
                group: 'internal',
                data: history,
                updatedAt: entry.updatedAt
              };
              changed = true;
            }
          }
          continue;
        }
        if (entry.key === 'guildChat') {
          const existing = next.guildChat?.data || { messages: [], users: {} };
          const incomingMessages = entry.data.messages || [];
          const incomingUsers = entry.data.users || {};
          const mergedUsers = { ...existing.users, ...incomingUsers };
          const msgMap = new Map();
          for (const m of existing.messages || []) {
            if (m?.id) msgMap.set(String(m.id), m);
          }
          for (const m of incomingMessages) {
            if (m?.id) msgMap.set(String(m.id), m);
          }
          const mergedMessages = Array.from(msgMap.values()).sort((a, b) => Number(b.ctime || 0) - Number(a.ctime || 0));
          const latestTime = entry.updatedAt > (next.guildChat?.updatedAt || '') ? entry.updatedAt : (next.guildChat?.updatedAt || entry.updatedAt);
          next.guildChat = {
            key: 'guildChat',
            method: entry.method,
            feature: entry.feature,
            group: entry.group,
            data: {
              messages: mergedMessages,
              users: mergedUsers
            },
            updatedAt: latestTime
          };
          changed = true;
          continue;
        }
        if (next[entry.key] && next[entry.key].updatedAt > entry.updatedAt) continue;
        if (entry.key === 'marchStatus') {
          const previous = next.marchStatus?.data?.marches || [];
          entry.data.marches = entry.data.marches.map((march) => {
            const prior = previous.find((item) => item.squadId &&
              item.squadId === march.squadId && item.rally);
            if (!prior) return march;
            const rally = { ...prior.rally };
            if (march.stage === 'moveToTargetInRally' && Number.isFinite(march.endsAt)) {
              rally.arrivalAt = march.endsAt;
            }
            if (march.stage === 'returnToOutpost' && Number.isFinite(march.endsAt)) {
              rally.returnAt = march.endsAt;
            }
            return { ...march, kind: 'raid', rally };
          });
        }
        if (entry.key === 'buildingStatus' && entry.data.action &&
            next[entry.key]?.updatedAt === entry.updatedAt) continue;
        if (entry.key === 'buildingStatus' && entry.data.action) {
          const queues = [...(next.buildingStatus?.data?.queues || [])];
          if (entry.data.action === 'start') {
            const queue = entry.data.queue;
            const index = queues.findIndex((item) =>
              Number.isInteger(queue.queueNumber) ? item.queueNumber === queue.queueNumber :
                item.buildingId === queue.buildingId);
            if (index >= 0) queues[index] = queue;
            else queues.push(queue);
          } else {
            const index = queues.findIndex((item) => item.buildingId === entry.data.buildingId);
            if (index >= 0) queues.splice(index, 1);
            else if (queues.length === 1) queues.length = 0;
          }
          entry.data = { queues };
        }
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
