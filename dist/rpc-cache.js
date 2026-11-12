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
    'getHealing:unit': 'teams',
    getUnitSummary: 'teams',
    getTrainings: 'teams',
    getHealing: 'teams',
    'startTraining:unit': 'teams',
    'completeTraining:unit': 'teams',
    'startHealing:unit': 'teams',
    startTraining: 'teams',
    completeTraining: 'teams',
    startHealing: 'teams',
    questGetAll: 'other',
    arenaGetAll: 'other',
    expeditionGet: 'other',
    dailyBonusGetInfo: 'other',
    zeppelinGiftGet: 'other',
    missionGetAll: 'other',
    'getDailyQuests:quest': 'events',
    'getSpecialQuestState:quest': 'events',
    clanBoss_getAll: 'other',
    clanWarGetBriefInfo: 'other',
    'getLeaderboardPowerSummary:leaderboardPower': 'other',
    getLeaderboardPowerSummary: 'other',
    'getInfo:clanVersus': 'events',
    'getCurrentBattle:clanVersus': 'events',
    'getUserProgress:clanVersus': 'events',
    'getRewardList:clanVersus': 'events',
    questGetEvents: 'events',
    clanWarChampInfo_getBriefInfo: 'events',
    'getEventInfo:fortress': 'events',
    clanClash_getCurrentState: 'events',
    brawl_getAll: 'events',
    heroEvolve: 'heroes',
    titanEvolve: 'titans',
    'attackMine:mine': 'header',
    'stopMineGathering:mine': 'header',
    'searchMine:mine': 'other',
    'getChunks:globalMap': 'other',
    'getRoutesByIds:globalMap': 'other',
    'getPage:report': 'header',
    'readAndClaimAll:report': 'header',
    'claimReward:report': 'header',
    mailGetAll: 'header',
    mailFarm: 'header',
    quest_multiFarm: 'other',
    quest_farm: 'other',
    questFarm: 'other',
    dailyQuestFarm: 'other',
    dungeonGetInfo: 'events',
    dungeonEndBattle: 'events',
    dungeonSaveProgress: 'events',
    dungeonStartBattle: 'events',
    magicTower_briefInfo: 'other',
    magicTower_getAll: 'other',
    openLootboxChanced: 'items',
    inventory_use: 'items'
  };

  const resourceTypes = new Set(['material', 'coin', 'scroll', 'consumable',
    'speedUpUnitTraining', 'speedUpUniversal', 'speedUpUnitHealing',
    'speedUpConstruction', 'speedUpResearch', 'teleporter', 'lootboxChanced', 'patron']);
  const worldMaterialNames = { 1: 'Elarite Shards', 2: 'Iron', 3: 'Stone',
    4: 'Wood', 5: 'Food', 12: 'Honor Marks' };
  const producedMaterialIds = new Set([1, 2, 3, 4, 5]);
  const typeNames = { speedUpUnitTraining: 'Training Speedup',
    speedUpUniversal: 'Universal Speedup', speedUpUnitHealing: 'Healing Speedup',
    speedUpConstruction: 'Construction Speedup', speedUpResearch: 'Research Speedup',
    teleporter: 'Teleporter', lootboxChanced: 'Chance Lootbox', patron: 'Relic Shard' };

  const SKILL_LEVEL_COSTS = [
    0, 0, 100, 550, 1000, 1450, 1900, 2350, 2800, 3250, 3700, 4150, 4600, 5050, 5500, 5950,
    6400, 6850, 7300, 7750, 8200, 8650, 9200, 9750, 10300, 10850, 11400, 11950, 12500, 13050, 13600,
    14150, 14700, 15250, 15800, 16350, 16900, 17450, 18000, 18550, 19100, 19650, 20200, 21200, 22200, 23200,
    24200, 25200, 26200, 27200, 28200, 29200, 30200, 31200, 32200, 33200, 34200, 35200, 36200, 37200, 38200,
    39200, 40200, 41200, 42200, 43200, 44200, 45200, 46200, 47200, 48200, 49200, 50200, 51300, 52400, 53500,
    54600, 55700, 56800, 57900, 59000, 60100, 61200, 62300, 63400, 64500, 65600, 66700, 67800, 68900, 70000,
    71000, 72000, 73000, 74000, 75000, 76000, 77000, 78000, 79000, 80000, 81000, 82000, 83000, 84000, 85000,
    86000, 87000, 88000, 89000, 90000, 91000, 92000, 93000, 94000, 95000, 96000, 97000, 98000, 99000, 100000
  ];

  function getSkillUpgradeGoldCost(targetLevel) {
    if (!Number.isFinite(targetLevel) || targetLevel <= 1) return 0;
    if (targetLevel < SKILL_LEVEL_COSTS.length) return SKILL_LEVEL_COSTS[targetLevel];
    return (SKILL_LEVEL_COSTS[SKILL_LEVEL_COSTS.length - 1] || 100000) + (targetLevel - (SKILL_LEVEL_COSTS.length - 1)) * 1000;
  }

  function resolveResourceLabel(key) {
    if (key === 'energy') return 'Energy';
    if (key === 'world-energy') return 'World Energy';
    if (key === 'gold') return 'Gold';
    if (key === 'starMoney') return 'Emeralds';
    const [type, idStr] = key.split(':');
    const id = Number(idStr);
    if (type === 'material' && worldMaterialNames[id]) return worldMaterialNames[id];
    if (type === 'speedUpResearch' && id === 2) return '5m Research Speedup';
    if (type === 'patron' && id === 1) return 'Relic Shard';
    const nameMap = globalThis.hwaHelperNameMap;
    if (nameMap && typeof nameMap.item === 'function') {
      const found = nameMap.item(type, id);
      if (found) return found;
    }
    return `${typeNames[type] || type} #${id}`;
  }

  function resource(key, amount, record, method, label, extra = {}) {
    if (key === 'refillable:62' || key === 'world-refillable:62') return []; // Wheel feature is shelved.
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

  function resourceAction(record, call, key, delta, label, tokenSuffix = '') {
    if (!Number.isFinite(delta) || delta === 0 || !call.ident) return [];
    const token = tokenSuffix ? `${call.ident}:${tokenSuffix}:${key}` : `${call.ident}:${key}`;
    return [{ key: 'resourceAction', method: call.name, feature: call.feature || null,
      group: 'internal', data: { resourceKey: `resource:${key}`, delta, label,
        token }, updatedAt: record.timestamp }];
  }

  function extractRewardActions(record, call, rewardObj, tokenPrefix = '') {
    if (!rewardObj || typeof rewardObj !== 'object') return [];
    const aggregated = new Map();
    const addReward = (key, delta) => {
      if (!key || !Number.isFinite(delta) || delta <= 0) return;
      aggregated.set(key, (aggregated.get(key) || 0) + delta);
    };

    const numStamina = Number(rewardObj.stamina);
    if (Number.isFinite(numStamina) && numStamina > 0) {
      addReward('energy', numStamina);
    }
    const numGold = Number(rewardObj.gold);
    if (Number.isFinite(numGold) && numGold > 0) {
      addReward('gold', numGold);
    }
    const numStarMoney = Number(rewardObj.starMoney || rewardObj.starmoney);
    if (Number.isFinite(numStarMoney) && numStarMoney > 0) {
      addReward('starMoney', numStarMoney);
    }
    if (rewardObj.refillableResource && typeof rewardObj.refillableResource === 'object') {
      for (const [rId, amt] of Object.entries(rewardObj.refillableResource)) {
        const numAmt = Number(amt);
        if (Number.isFinite(numAmt) && numAmt > 0) {
          const resKey = rId === '1' ? 'energy' : (rId === '2' ? 'world-energy' : `refillable:${rId}`);
          addReward(resKey, numAmt);
        }
      }
    }
    for (const groupType of ['consumable', 'material', 'coin', 'gear', 'fragmentHero', 'fragmentTitan', 'lootboxChanced', 'patron', 'scroll', 'teleporter']) {
      if (rewardObj[groupType] && typeof rewardObj[groupType] === 'object') {
        for (const [id, amt] of Object.entries(rewardObj[groupType])) {
          const numAmt = Number(amt);
          if (Number.isFinite(numAmt) && numAmt > 0) {
            addReward(`${groupType}:${id}`, numAmt);
          }
        }
      }
    }
    const arrayRewards = Array.isArray(rewardObj.reward) ? rewardObj.reward :
      (Array.isArray(rewardObj.rewards) ? rewardObj.rewards :
      (Array.isArray(rewardObj.claimedRewards) ? rewardObj.claimedRewards : []));
    for (const r of arrayRewards) {
      const numAmt = Number(r?.amount);
      if (Number.isFinite(numAmt) && numAmt > 0 && r?.type) {
        const type = r.type;
        const id = r.id;
        const key = type === 'gold' || type === 'starMoney' ? type :
          (type === 'stamina' || (type === 'refillable' && String(id) === '1')) ? 'energy' :
          (type === 'refillable' && String(id) === '2') ? 'world-energy' :
          resourceTypes.has(type) && (id !== undefined && id !== null) ? `${type}:${id}` : null;
        if (key) {
          addReward(key, numAmt);
        }
      }
    }

    const actions = [];
    for (const [key, totalAmt] of aggregated) {
      const label = resolveResourceLabel(key);
      actions.push(...resourceAction(record, call, key, totalAmt, label, tokenPrefix));
    }
    return actions;
  }

  function extractCostActions(record, call, costObj, tokenPrefix = 'cost') {
    if (!costObj || typeof costObj !== 'object') return [];
    const aggregated = new Map();
    const addCost = (key, delta) => {
      if (!key || !Number.isFinite(delta) || delta <= 0) return;
      aggregated.set(key, (aggregated.get(key) || 0) + delta);
    };

    const numStamina = Number(costObj.stamina);
    if (Number.isFinite(numStamina) && numStamina > 0) {
      addCost('energy', numStamina);
    }
    const numGold = Number(costObj.gold);
    if (Number.isFinite(numGold) && numGold > 0) {
      addCost('gold', numGold);
    }
    const numStarMoney = Number(costObj.starMoney || costObj.starmoney);
    if (Number.isFinite(numStarMoney) && numStarMoney > 0) {
      addCost('starMoney', numStarMoney);
    }
    if (costObj.refillableResource && typeof costObj.refillableResource === 'object') {
      for (const [rId, amt] of Object.entries(costObj.refillableResource)) {
        const numAmt = Number(amt);
        if (Number.isFinite(numAmt) && numAmt > 0) {
          const resKey = rId === '1' ? 'energy' : (rId === '2' ? 'world-energy' : `refillable:${rId}`);
          addCost(resKey, numAmt);
        }
      }
    }
    for (const groupType of ['coin', 'consumable', 'material', 'gear', 'fragmentHero', 'fragmentTitan', 'scroll']) {
      if (costObj[groupType] && typeof costObj[groupType] === 'object') {
        for (const [id, amt] of Object.entries(costObj[groupType])) {
          const numAmt = Number(amt);
          if (Number.isFinite(numAmt) && numAmt > 0) {
            addCost(`${groupType}:${id}`, numAmt);
          }
        }
      }
    }
    const actions = [];
    for (const [key, totalCost] of aggregated) {
      const label = resolveResourceLabel(key);
      actions.push(...resourceAction(record, call, key, -totalCost, label, tokenPrefix));
    }
    return actions;
  }

  function extractMarches(response) {
    const marches = [];
    const seenSquads = new Set();
    for (const [group, stages] of [['marches', response.marches],
      ['scoutMarches', response.scoutMarches]]) {
      if (!stages || typeof stages !== 'object') continue;
      for (const [stage, rawList] of Object.entries(stages)) {
        const list = normalizeArrayData(rawList);
        if (!list.length) continue;
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
            ...(typeof (route?.routeId ?? march.routeId) === 'string' ? { routeId: route?.routeId ?? march.routeId } : {}),
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
        .map((unit) => ({ id: unit.unitId, count: unit.count }))
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

  function extractSocket(record) {
    if (record?.transport !== 'websocket' || record.direction !== 'received' ||
        record.encoding !== 'utf8' || record.payloadTruncated ||
        record.endpoint !== 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt') return [];
    try {
      const message = JSON.parse(record.payload);
      const type = message?.result?.type;
      const body = message?.result?.body;
      if (!body || typeof body !== 'object') return [];
      const entry = (key, group, data, feature = null) => ({
        key, method: type, feature, group, data, updatedAt: record.timestamp
      });
      if (type === 'specialQuestEvents' && Array.isArray(body.events)) {
        return [entry('specialQuestStatus', 'events', {
          events: body.events, accountId: body.pushUserId ?? null
        })];
      }
      if (type === 'chatMessage' && body.chatType === 'clan' && body.id && body.userId) {
        const { id, userId, messageType, chatType, ctime, data, user } = body;
        return [entry('guildChat', 'chat', {
          messages: [{ id: String(id), userId: String(userId), messageType,
            chatType, ctime: String(ctime), data }],
          users: user ? { [String(userId)]: user } : {}
        }, 'clan')];
      }
      if (type === 'newReport' && typeof body.reportId === 'string') {
        return [entry('mailStatus', 'header', { reports: [{
          id: body.reportId, type: body.type || null, read: false,
          claimedReward: false,
          createdAt: Number.isFinite(body.pushTs) ? body.pushTs * 1000 :
            Date.parse(record.timestamp)
        }] }, 'report')];
      }
      if (type === 'mobRallyAttackResult' && typeof body.squadId === 'string' &&
          typeof body.rallyId === 'string') {
        const route = body.routeToOutpost;
        const duration = route?.durationMs ?? route?.duration;
        return [entry('rallyAction', 'internal', {
          action: 'socketResult', squadId: body.squadId, rallyId: body.rallyId,
          returnRouteId: route?.routeId,
          mobConfigId: body.mobConfigId,
          result: body.battleResult?.battleResult,
          returnAt: Number.isFinite(route?.startedAt) && Number.isFinite(duration) ?
            route.startedAt + duration : null
        })];
      }
      if (type === 'rallyUserAutojoined' && typeof body.rallyId === 'string' &&
          typeof body.squad?.squadId === 'string') {
        const route = body.route;
        const duration = route?.durationMs ?? route?.duration;
        return [entry('rallyAction', 'internal', {
          action: 'socketAutojoined', rallyId: body.rallyId,
          squadId: body.squad.squadId, team: rallyTeam(body.squad),
          endsAt: Number.isFinite(route?.startedAt) && Number.isFinite(duration) ?
            route.startedAt + duration : null
        })];
      }
      if (type === 'returnFromMobCompleted' && typeof body.squadId === 'string') {
        return [entry('rallyAction', 'internal', { action: 'socketReturnCompleted',
          squadId: body.squadId })];
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  function extract(record) {
    if (record?.transport === 'websocket') return extractSocket(record);
    if (record?.method !== 'POST' || record.status !== 200 ||
        record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
        record.requestBodyTruncated || record.responseBodyTruncated ||
        typeof record.requestBody !== 'string' || typeof record.responseBody !== 'string') return [];
    try {
      const request = JSON.parse(record.requestBody);
      const response = JSON.parse(record.responseBody);
      if (!Array.isArray(request.calls) || !Array.isArray(response.results)) return [];
      const results = new Map(response.results.map((result) => [result.ident, result.result || result]));
      const actions = request.calls.flatMap((call) => {
        const key = `${call.name}${call.feature ? `:${call.feature}` : ''}`;
        const group = definitions[key];
        const result = results.get(call.ident);
        if (result?.error && ['createRally:mob', 'attackMine:mine', 'getRallyById:rally'].includes(key)) return [];
        if (key === 'searchMob:mob' && call.args?.mobType === 'rally' &&
            (Array.isArray(result?.response?.mobs) || (result?.response?.mobs && typeof result.response.mobs === 'object'))) {
          const mobs = normalizeArrayData(result.response.mobs);
          return [{ key: 'experimentalRallySearch', method: call.name,
            feature: call.feature, group: 'internal', data: {
              mapId: call.args.mapId, mobConfigIds: call.args.mobConfigIds,
              center: call.args.center, mobs
            }, updatedAt: record.timestamp }];
        }
        if (key === 'searchMob:mob' && call.args?.mobType === 'solo' &&
            (Array.isArray(result?.response?.mobs) || (result?.response?.mobs && typeof result.response.mobs === 'object'))) {
          const mobs = normalizeArrayData(result.response.mobs);
          return [{ key: 'experimentalSoloSearch', method: call.name,
            feature: call.feature, group: 'internal', data: {
              mapId: call.args.mapId, mobConfigIds: call.args.mobConfigIds,
              center: call.args.center, mobs
            }, updatedAt: record.timestamp },
          { key: 'experimentalMapContext', method: call.name, feature: call.feature,
            group: 'internal', data: { mapId: call.args.mapId, center: call.args.center },
            updatedAt: record.timestamp }];
        }
        if (key === 'searchMob:mob' && call.args?.mapId && call.args?.center) {
          return [{ key: 'experimentalMapContext', method: call.name,
            feature: call.feature, group: 'internal', data: {
              mapId: call.args.mapId, center: call.args.center
            }, updatedAt: record.timestamp }];
        }
        if (key === 'getMarches:march' && result?.response?.marches) {
          const marches = extractMarches(result.response);
          const actions = [{ key: 'marchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { marches },
            updatedAt: record.timestamp }];
          let marchMapId = null;
          let marchCenter = null;
          const marchOutposts = {};
          for (const stages of Object.values(result.response.marches || {})) {
            if (!Array.isArray(stages)) continue;
            for (const m of stages) {
              if (m?.mapId && !marchMapId) marchMapId = m.mapId;
              if (m?.route?.from?.coordinates && Number.isFinite(m.route.from.coordinates.x)) {
                if (!marchCenter) marchCenter = m.route.from.coordinates;
                if (m.route.leader?.userId) marchOutposts[m.route.leader.userId] = m.route.from.coordinates;
              }
              if (m?.target?.coordinates && Number.isFinite(m.target.coordinates.x) && !marchCenter) {
                marchCenter = m.target.coordinates;
              }
            }
          }
          if (marchMapId && (marchCenter || Object.keys(marchOutposts).length > 0)) {
            actions.push({
              key: 'experimentalMapContext', method: call.name, feature: call.feature,
              group: 'internal',
              data: {
                mapId: marchMapId,
                ...(marchCenter ? { center: marchCenter } : {}),
                ...(Object.keys(marchOutposts).length ? { outposts: marchOutposts } : {})
              },
              updatedAt: record.timestamp
            });
          }
          return actions;
        }
        if (key === 'getRallyById:rally' && result?.response?.rally?.rallyId) {
          const rally = result.response.rally;
          const targetConfigId = rally.target?.objectConfigId ?? rally.mob?.mobConfigId;
          const rallyOutposts = {};
          if (rally.leader?.userId && rally.leaderCoordinates?.x != null && rally.leaderCoordinates?.y != null) {
            rallyOutposts[rally.leader.userId] = rally.leaderCoordinates;
          }
          for (const member of (Array.isArray(rally.members) ? rally.members : [])) {
            if (member?.userId && member.route?.from?.coordinates?.x != null && member.route?.from?.coordinates?.y != null) {
              rallyOutposts[member.userId] = member.route.from.coordinates;
            }
          }
          const actions = [{ key: 'rallyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'details', rallyId: rally.rallyId,
              mapId: rally.mapId, mobId: rally.mob?.mobId || rally.target?.objectId,
              mobConfigId: targetConfigId,
              leader: rally.leader,
              members: rally.members || [],
              membersCapacityLeft: rally.membersCapacityLeft,
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
          if (rally.mapId) {
            actions.push({
              key: 'experimentalMapContext', method: call.name, feature: call.feature,
              group: 'internal',
              data: {
                mapId: rally.mapId,
                center: rally.leaderCoordinates || rally.target?.coordinates,
                ...(Object.keys(rallyOutposts).length ? { outposts: rallyOutposts } : {})
              },
              updatedAt: record.timestamp
            });
          }
          return actions;
        }
        if (key === 'getRoutesByIds:globalMap' && Array.isArray(result?.response?.routes)) {
          const actions = [];
          for (const route of result.response.routes) {
            if (route?.type === 'returnToOutpost') {
              const startedAt = route.startedAt;
              const duration = route.durationMs ?? route.duration;
              if (Number.isFinite(startedAt) && Number.isFinite(duration)) {
                if (route.from?.object?.objectType === 'soloMob') {
                  actions.push({ key: 'soloAttackReturnAction', method: call.name,
                    feature: call.feature, group: 'internal', data: {
                      mobId: route.from.object.objectId,
                      returnAt: startedAt + duration
                    }, updatedAt: record.timestamp });
                  continue;
                }
                actions.push({
                  key: 'rallyAction',
                  method: call.name,
                  feature: call.feature,
                  group: 'internal',
                  data: {
                    action: 'returnRoute',
                    routeId: route.routeId,
                    squadId: route.squadId,
                    rallyId: route.rallyId,
                    mobId: route.from?.object?.objectType === 'rallyMob' ? route.from.object.objectId : null,
                    ownerId: route.leader?.userId,
                    returnAt: startedAt + duration,
                    startedAt,
                    durationMs: duration
                  },
                  updatedAt: record.timestamp
                });
              }
            }
          }
          if (actions.length) return actions;
        }
        if (key === 'getPage:report' && Array.isArray(result?.response?.reports)) {
          const actions = [];
          for (const rep of result.response.reports) {
            if (rep?.type === 'soloMobAttackResult' && rep.id &&
                Number.isFinite(rep.createdAt) && typeof rep.payload?.result === 'string') {
              actions.push({ key: 'soloAttackResultAction', method: call.name,
                feature: call.feature, group: 'internal', data: {
                  reportId: rep.id, createdAt: rep.createdAt,
                  mobConfigId: rep.payload.mobConfigId,
                  result: rep.payload.result
                }, updatedAt: record.timestamp });
            }
            if (rep?.type === 'rallyMobAttackResult' && Number.isFinite(rep.createdAt)) {
              actions.push({
                key: 'rallyAction',
                method: call.name,
                feature: call.feature,
                group: 'internal',
                data: {
                  action: 'battleReport',
                  rallyId: rep.payload?.rallyId,
                  squadId: rep.payload?.squadId,
                  mobId: rep.payload?.mobId,
                  result: rep.payload?.result,
                  createdAt: rep.createdAt,
                  mobConfigId: rep.payload?.mobConfigId
                },
                updatedAt: record.timestamp
              });
            }
          }
          const unclaimedReports = result.response.reports.filter((r) => r && r.claimedReward === false);
          actions.push({
            key: 'mailStatus',
            method: call.name,
            feature: call.feature,
            group: 'header',
            data: {
              unclaimedReportsCount: unclaimedReports.length,
              hasUnclaimedReports: unclaimedReports.length > 0,
              reports: result.response.reports.map((r) => ({
                id: r.id,
                type: r.type,
                read: r.read,
                claimedReward: r.claimedReward,
                createdAt: r.createdAt
              }))
            },
            updatedAt: record.timestamp
          });
          return actions;
        }
        if (key === 'searchMine:mine' && Array.isArray(result?.response?.mines) && Array.isArray(call.args?.mineConfigIds)) {
          const mineConfigId = call.args.mineConfigIds[0];
          const mineType = globalThis.hwaHelperMineTypes?.[mineConfigId] || 'mine';
          const mines = {};
          for (const m of result.response.mines) {
            if (m?.mineId) mines[m.mineId] = { mineConfigId, mineType };
          }
          return [{ key: 'experimentalMineSearch', method: call.name,
            feature: call.feature, group: 'internal', data: {
              mapId: call.args.mapId, mineConfigId,
              center: call.args.center, mines: result.response.mines
            }, updatedAt: record.timestamp },
          ...(call.args?.mapId && call.args?.center ? [{
            key: 'experimentalMapContext', method: call.name,
            feature: call.feature, group: 'internal', data: {
              mapId: call.args.mapId, center: call.args.center
            }, updatedAt: record.timestamp
          }] : []),
          ...(Object.keys(mines).length ? [{ key: 'mineMapAction', method: call.name,
            feature: call.feature, group: 'internal', data: { mines },
            updatedAt: record.timestamp }] : [])];
        }
        if (key === 'getChunks:globalMap' && Array.isArray(result?.response?.chunks)) {
          const mines = {};
          const monsters = {};
          const outposts = {};
          for (const chunk of result.response.chunks) {
            for (const outpost of (Array.isArray(chunk?.outposts) ? chunk.outposts : [])) {
              if (outpost?.userId && Number.isFinite(outpost.coordinates?.x) &&
                  Number.isFinite(outpost.coordinates?.y)) {
                outposts[outpost.userId] = outpost.coordinates;
              }
            }
            for (const mob of (Array.isArray(chunk?.mobs) ? chunk.mobs : [])) {
              if (mob?.mobId && Number.isInteger(mob.mobConfigId) && mob.mobType === 'solo') {
                monsters[mob.mobId] = { mobConfigId: mob.mobConfigId };
              }
            }
            if (Array.isArray(chunk?.mines)) {
              for (const m of chunk.mines) {
                if (m?.mineId && m?.mineConfigId) {
                  const mineType = globalThis.hwaHelperMineTypes?.[m.mineConfigId] || 'mine';
                  mines[m.mineId] = {
                    mineConfigId: m.mineConfigId,
                    mineType,
                    resourceAmount: m.resourceAmount
                  };
                }
              }
            }
          }
          const actions = [];
          if (call.args?.mapId) actions.push({
            key: 'experimentalMapContext', method: call.name,
            feature: call.feature, group: 'internal',
            data: { mapId: call.args.mapId, outposts }, updatedAt: record.timestamp
          });
          if (Object.keys(monsters).length) actions.push({
            key: 'soloMobMapAction', method: call.name, feature: call.feature,
            group: 'internal', data: { monsters }, updatedAt: record.timestamp
          });
          if (Object.keys(mines).length) {
            actions.push({
              key: 'mineMapAction',
              method: call.name,
              feature: call.feature,
              group: 'internal',
              data: { mines },
              updatedAt: record.timestamp
            });
          }
          if (actions.length) return actions;
        }
        if (key === 'attackMob:mob' && result?.response?.squadId && result.response.route) {
          const route = result.response.route;
          const durationMs = route.durationMs ?? route.duration;
          if (!Number.isFinite(route.startedAt) || !Number.isFinite(durationMs) || durationMs < 0) return [];
          const energy = resourceAction(record, call, 'world-energy', -10,
            'World Energy', 'soloMonsterAttack').map((action) => ({
            ...action, data: { ...action.data, requireSnapshot: true }
          }));
          // The captured globalMapMobSolo configuration charges 10 World Energy per attack.
          return [{ key: 'soloAttackAction', method: call.name, feature: call.feature,
            group: 'internal', data: { squadId: result.response.squadId,
              routeId: route.routeId, mobId: call.args?.mobId,
              team: rallyTeam(call.args?.squad), startedAt: route.startedAt,
              durationMs, targetArrivalAt: route.startedAt + durationMs },
            updatedAt: record.timestamp }, ...energy];
        }
        if (key === 'attackMob:mob' && result?.error && call.ident) {
          return [{ key: 'soloAttackResultAction', method: call.name,
            feature: call.feature, group: 'internal', data: {
              reportId: `rpc:${call.ident}`, createdAt: Date.parse(record.timestamp),
              result: 'request_failed', mobId: call.args?.mobId
            }, updatedAt: record.timestamp }];
        }
        if (call.name === 'missionRaid' && (result?.error || result?.response?.error)) {
          const err = result?.error || result?.response?.error;
          const errMsg = typeof err === 'string' ? err : (err?.message || err?.name || 'Raid failed');
          return [{
            key: 'lastCampaignRaidResult',
            method: call.name,
            feature: null,
            group: 'internal',
            data: {
              missionId: call.args?.id,
              times: Number(call.args?.times) || 1,
              error: errMsg,
              failed: true
            },
            updatedAt: record.timestamp
          }];
        }
        if (key === 'attackMine:mine' && result?.response?.squadId && result?.response?.route) {
          const route = result.response.route;
          const startedAt = route.startedAt;
          const duration = route.durationMs ?? route.duration;
          const targetArrivalAt = Number.isFinite(startedAt) && Number.isFinite(duration) ?
            startedAt + duration : null;
          return [{
            key: 'gatherAction',
            method: call.name,
            feature: call.feature,
            group: 'header',
            data: {
              action: 'startGather',
              squadId: result.response.squadId,
              mineId: call.args?.mineId || null,
              startedAt,
              durationMs: duration,
              targetArrivalAt,
              team: rallyTeam(call.args?.squad)
            },
            updatedAt: record.timestamp
          }, ...(call.args?.squad ? [{ key: 'experimentalLastSquad', method: call.name,
            feature: call.feature, group: 'internal', data: call.args?.squad,
            updatedAt: record.timestamp }] : []),
          ...(call.args?.mapId && route.from?.coordinates ? [{
            key: 'experimentalMapContext', method: call.name,
            feature: call.feature, group: 'internal', data: {
              mapId: call.args.mapId, center: route.from.coordinates
            }, updatedAt: record.timestamp
          }] : [])];
        }
        if (key === 'stopMineGathering:mine' && result?.response?.squadId && result?.response?.route) {
          const route = result.response.route;
          const startedAt = route.startedAt;
          const duration = route.durationMs ?? route.duration;
          const returnAt = Number.isFinite(startedAt) && Number.isFinite(duration) ?
            startedAt + duration : null;
          return [{
            key: 'gatherAction',
            method: call.name,
            feature: call.feature,
            group: 'header',
            data: {
              action: 'stopGather',
              squadId: result.response.squadId,
              remainingResourceAmount: result.response.remainingResourceAmount,
              startedAt,
              durationMs: duration,
              returnAt
            },
            updatedAt: record.timestamp
          }];
        }
        if (result && Object.hasOwn(result, 'response') && !result.error) {
          if (call.name === 'skin_upgrade' && Number.isInteger(call.args?.unitId) &&
              Number.isInteger(call.args?.skinId) && call.ident) {
            return [{ key: 'skinUpgradeAction', method: call.name, feature: null,
              group: 'internal', data: { heroId: call.args.unitId,
                skinId: call.args.skinId, token: `${call.ident}:skinUpgrade` },
              updatedAt: record.timestamp }];
          }
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
          if (call.name === 'dungeonStartBattle') {
            return [{
              key: 'dungeonStatus',
              method: call.name,
              feature: null,
              group: 'events',
              data: {
                activeBattle: {
                  teamNum: call.args?.teamNum ?? 0,
                  heroes: Array.isArray(call.args?.heroes) ? call.args.heroes : [],
                  startTime: record.timestamp || Date.now()
                }
              },
              updatedAt: record.timestamp
            }];
          }
          if (call.name === 'dungeonGetInfo' && result?.response &&
              typeof result.response === 'object' && !Array.isArray(result.response)) {
            const snapshot = (result.response.dungeon && typeof result.response.dungeon === 'object')
              ? result.response.dungeon
              : result.response;
            return [{
              key: 'dungeonStatus',
              method: call.name,
              feature: null,
              group: 'events',
              data: {
                floorNumber: Number(snapshot.floorNumber) ||
                  (Number(snapshot.maxFloorPassed) ? Number(snapshot.maxFloorPassed) + 1 : null),
                floorType: snapshot.floorType || null,
                maxFloorPassed: Number(snapshot.maxFloorPassed) || 0,
                maxFloorReached: Number(snapshot.maxFloorReached) || 0,
                respawnFloor: Number(snapshot.respawnFloor) || 0,
                elements: snapshot.elements || {},
                states: snapshot.states || {},
                ...(snapshot.dungeonActivity != null ?
                  { dungeonActivity: Number(snapshot.dungeonActivity) || 0 } : {}),
                currentFloorDoors: Array.isArray(snapshot.floor?.userData) ? snapshot.floor.userData : [],
                activeBattle: null
              },
              updatedAt: record.timestamp
            }];
          }
          if (call.name === 'dungeonEndBattle' && result?.response) {
            const actions = [];
            const rep = result.response;
            const dungeon = rep.dungeon || {};
            const floor = Number.isFinite(Number(dungeon.floorNumber)) ? Number(dungeon.floorNumber) :
              (Number.isFinite(Number(dungeon.maxFloorPassed)) ? Number(dungeon.maxFloorPassed) + 1 : null);
            const progressAttackers = call.args?.progress?.[0]?.attackers?.heroes || {};
            const casualties = [];
            for (const [idStr, titan] of Object.entries(progressAttackers)) {
              if (titan && (titan.isDead === true || (typeof titan.hp === 'number' && titan.hp <= 0))) {
                casualties.push(Number(idStr));
              }
            }
            const serverTitans = dungeon.states?.titans || rep.states?.titans || {};
            for (const idStr of Object.keys(progressAttackers)) {
              const s = serverTitans[idStr];
              if (s && (s.isDead === true || (typeof s.hp === 'number' && s.hp <= 0))) {
                const numId = Number(idStr);
                if (!casualties.includes(numId)) casualties.push(numId);
              }
            }
            // Extract personal titanite progress if returned in quests
            let todayTitanite = null;
            if (Array.isArray(rep.quests)) {
              const tq = rep.quests.find((q) => [10031, 10032, 10108].includes(Number(q.id)));
              if (tq && Number.isFinite(Number(tq.progress))) {
                todayTitanite = Number(tq.progress);
              }
            }
            actions.push({
              key: 'dungeonStatus',
              method: call.name,
              feature: null,
              group: 'events',
              data: {
                ...(floor != null ? { floorNumber: floor } : {}),
                ...(dungeon.floorType ? { floorType: dungeon.floorType } : {}),
                ...(dungeon.maxFloorPassed != null ? { maxFloorPassed: Number(dungeon.maxFloorPassed) || 0 } : {}),
                ...(dungeon.maxFloorReached != null ? { maxFloorReached: Number(dungeon.maxFloorReached) || 0 } : {}),
                ...(dungeon.respawnFloor != null ? { respawnFloor: Number(dungeon.respawnFloor) || 0 } : {}),
                ...(dungeon.elements ? { elements: dungeon.elements } : {}),
                states: dungeon.states || rep.states || {},
                ...(rep.dungeonActivity != null || dungeon.dungeonActivity != null
                  ? { dungeonActivity: rep.dungeonActivity ?? dungeon.dungeonActivity ?? 0 }
                  : {}),
                ...(Array.isArray(dungeon.floor?.userData) ? { currentFloorDoors: dungeon.floor.userData } : {}),
                activeBattle: null,
                ...(todayTitanite != null ? { todayTitanite } : {}),
                lastBattleResult: {
                  win: Boolean(call.args?.result?.win ?? true),
                  stars: Number(call.args?.result?.stars) || 3,
                  reward: rep.reward || null,
                  casualties,
                  deployed: Object.keys(progressAttackers).map(Number)
                }
              },
              updatedAt: record.timestamp
            });
            if (rep.reward) {
              actions.push({
                key: 'dungeonRewardAction',
                method: call.name,
                feature: null,
                group: 'internal',
                data: {
                  token: `${call.ident}:dungeonReward`,
                  reward: rep.reward
                },
                updatedAt: record.timestamp
              });
            }
            return actions;
          }
          if (call.name === 'dungeonSaveProgress' && result?.response) {
            const actions = [];
            const rep = result.response;
            const dungeon = rep.dungeon || {};
            const floor = Number.isFinite(Number(dungeon.floorNumber)) ? Number(dungeon.floorNumber) :
              (Number.isFinite(Number(dungeon.maxFloorPassed)) ? Number(dungeon.maxFloorPassed) + 1 : null);
            if (Object.keys(dungeon).length) actions.push({
              key: 'dungeonStatus',
              method: call.name,
              feature: null,
              group: 'events',
              data: {
                floorNumber: floor,
                floorType: dungeon.floorType || null,
                maxFloorPassed: Number(dungeon.maxFloorPassed) || 0,
                maxFloorReached: Number(dungeon.maxFloorReached) || 0,
                respawnFloor: Number(dungeon.respawnFloor) || 0,
                elements: dungeon.elements || { prime: 'earth', nonprime: ['water', 'fire'] },
                states: dungeon.states || rep.states || {},
                dungeonActivity: rep.dungeonActivity ?? dungeon.dungeonActivity ?? 0,
                currentFloorDoors: dungeon.floor?.userData || [],
                activeBattle: null
              },
              updatedAt: record.timestamp
            });
            if (rep.reward) {
              actions.push({
                key: 'dungeonRewardAction',
                method: call.name,
                feature: null,
                group: 'internal',
                data: {
                  token: `${call.ident}:dungeonReward`,
                  reward: rep.reward
                },
                updatedAt: record.timestamp
              });
            }
            if (Array.isArray(rep.quests)) {
              const coins = {};
              for (const q of rep.quests) {
                if ((q.state === 3 || q.state === 1) && q.reward?.coin) {
                  for (const [coinId, amt] of Object.entries(q.reward.coin)) {
                    coins[coinId] = (coins[coinId] || 0) + Number(amt);
                  }
                }
              }
              if (Object.keys(coins).length) {
                actions.push({
                  key: 'dungeonRewardAction',
                  method: call.name,
                  feature: null,
                  group: 'internal',
                  data: {
                    token: `${call.ident}:dungeonQuests`,
                    reward: { coin: coins }
                  },
                  updatedAt: record.timestamp
                });
              }
            }
            return actions;
          }
          if (call.name === 'openLootboxChanced' && result && !result.error && result.response) {
            const lootBoxId = call.args?.lootBoxId;
            const amount = Number(call.args?.amount) || 1;
            const rawRewards = result.response.reward;
            const rewards = [];
            if (Array.isArray(rawRewards)) {
              for (const r of rawRewards) {
                if (r && r.type && r.id != null && Number(r.amount) > 0) {
                  rewards.push({
                    type: r.type,
                    id: String(r.id),
                    amount: Number(r.amount)
                  });
                }
              }
            }
            return [{
              key: 'chestOpenAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                token: `${call.ident}:openLootbox:${lootBoxId}`,
                boxType: 'lootboxChanced',
                boxId: String(lootBoxId),
                amount,
                rewards
              },
              updatedAt: record.timestamp
            }];
          }
          if (call.name === 'inventory_use' && result && !result.error) {
            const actions = [];
            const libId = call.args?.libId;
            const amount = Number(call.args?.amount);
            const unitId = call.args?.params?.unitId;
            if (libId === 20 && Number.isFinite(amount) && amount > 0) {
              actions.push({
                key: 'inventoryUseAction',
                method: call.name,
                feature: null,
                group: 'internal',
                data: {
                  token: `${call.ident}:inventoryUse:${libId}`,
                  libId: 20,
                  amount,
                  unitId: unitId ? String(unitId) : null
                },
                updatedAt: record.timestamp
              });
            } else if (Array.isArray(result.response) && Number.isFinite(amount) && amount > 0) {
              const rewards = [];
              for (const item of result.response) {
                if (item && typeof item === 'object') {
                  for (const [cat, subMap] of Object.entries(item)) {
                    if (subMap && typeof subMap === 'object') {
                      for (const [subId, subAmt] of Object.entries(subMap)) {
                        const num = Number(subAmt);
                        if (num > 0) {
                          rewards.push({ type: cat, id: String(subId), amount: num });
                        }
                      }
                    }
                  }
                }
              }
              actions.push({
                key: 'chestOpenAction',
                method: call.name,
                feature: null,
                group: 'internal',
                data: {
                  token: `${call.ident}:inventoryUse:${libId}`,
                  boxType: 'consumable',
                  boxId: String(libId),
                  amount,
                  rewards
                },
                updatedAt: record.timestamp
              });
            }
            return actions;
          }
          if (call.name === 'heroEvolve' && Number.isInteger(call.args?.heroId)) {
            return [{
              key: 'heroEvolveAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                heroId: call.args.heroId,
                token: `${call.ident}:heroEvolve:${call.args.heroId}`
              },
              updatedAt: record.timestamp
            }];
          }
          if (call.name === 'titanEvolve' && Number.isInteger(call.args?.titanId)) {
            return [{
              key: 'titanEvolveAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                titanId: call.args.titanId,
                consumable: result?.response?.consumable || null,
                quests: result?.quests || null,
                token: `${call.ident}:titanEvolve:${call.args.titanId}`
              },
              updatedAt: record.timestamp
            }];
          }
          if (call.name === 'heroInsertItem' && Number.isInteger(call.args?.heroId) && Number.isInteger(call.args?.slot) && result && !result.error) {
            return [{
              key: 'heroEquipAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                heroId: call.args.heroId,
                slot: call.args.slot,
                token: `${call.ident || record.timestamp}:heroEquip:${call.args.heroId}:${call.args.slot}`
              },
              updatedAt: record.timestamp
            }];
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
              const resp = result.response;
              const times = Number(call.args?.times) || 1;
              const drops = {
                fragmentGear: {},
                gear: {},
                consumable: {},
                gold: 0,
                experience: 0
              };
              for (let i = 0; i < times; i++) {
                const run = resp[i];
                if (!run) continue;
                if (Number.isFinite(run.gold)) drops.gold += run.gold;
                if (Number.isFinite(run.experience)) drops.experience += run.experience;
                if (run.fragmentGear && typeof run.fragmentGear === 'object') {
                  for (const [gId, count] of Object.entries(run.fragmentGear)) {
                    drops.fragmentGear[gId] = (drops.fragmentGear[gId] || 0) + Number(count);
                  }
                }
                if (run.fragmentScroll && typeof run.fragmentScroll === 'object') {
                  if (!drops.fragmentScroll) drops.fragmentScroll = {};
                  for (const [sId, count] of Object.entries(run.fragmentScroll)) {
                    drops.fragmentScroll[sId] = (drops.fragmentScroll[sId] || 0) + Number(count);
                  }
                }
                if (run.gear && typeof run.gear === 'object') {
                  for (const [gId, count] of Object.entries(run.gear)) {
                    drops.gear[gId] = (drops.gear[gId] || 0) + Number(count);
                  }
                }
                if (run.scroll && typeof run.scroll === 'object') {
                  if (!drops.scroll) drops.scroll = {};
                  for (const [sId, count] of Object.entries(run.scroll)) {
                    drops.scroll[sId] = (drops.scroll[sId] || 0) + Number(count);
                  }
                }
                if (run.consumable && typeof run.consumable === 'object') {
                  for (const [cId, count] of Object.entries(run.consumable)) {
                    drops.consumable[cId] = (drops.consumable[cId] || 0) + Number(count);
                  }
                }
              }
              if (resp.raid?.consumable && typeof resp.raid.consumable === 'object') {
                for (const [cId, count] of Object.entries(resp.raid.consumable)) {
                  drops.consumable[cId] = (drops.consumable[cId] || 0) + Number(count);
                }
              }
              if (drops.gold > 0) {
                actions.push(...resourceAction(record, call, 'gold', drops.gold));
              }
              actions.push({
                key: 'lastCampaignRaidResult',
                method: call.name,
                feature: null,
                group: 'internal',
                data: {
                  missionId: call.args?.id,
                  times,
                  drops,
                  currentDrops: drops,
                  raw: resp
                },
                updatedAt: record.timestamp
              });
            }
            return actions;
          }
          if (call.name === 'readAndClaimAll') {
            const actions = [];
            if (result.response) {
              actions.push(...extractRewardActions(record, call, result.response, 'readAndClaimAll'));
            }
            actions.push({
              key: 'mailStatus',
              method: call.name,
              feature: call.feature || null,
              group: 'header',
              data: {
                action: 'claimAll'
              },
              updatedAt: record.timestamp
            });
            return actions;
          }
          if (call.name === 'mailFarm' && result?.response && typeof result.response === 'object') {
            const actions = [];
            const letterIds = Object.keys(result.response);
            for (const letterId of letterIds) {
              const letterReward = result.response[letterId];
              if (letterReward && typeof letterReward === 'object') {
                actions.push(...extractRewardActions(record, call, letterReward, `mail:${letterId}`));
              }
            }
            actions.push({
              key: 'mailStatus',
              method: call.name,
              feature: call.feature || null,
              group: 'header',
              data: {
                action: 'claimMail',
                letterIds
              },
              updatedAt: record.timestamp
            });
            return actions;
          }
          if (call.name === 'claimReward' && call.feature === 'report') {
            const actions = [];
            if (call.args?.id) {
              actions.push({
                key: 'mailStatus',
                method: call.name,
                feature: call.feature,
                group: 'header',
                data: {
                  action: 'claimReport',
                  reportId: call.args.id
                },
                updatedAt: record.timestamp
              });
            }
            return actions;
          }
          if ((call.name === 'quest_multiFarm' || call.name === 'quest_farm' ||
               call.name === 'questFarm' || call.name === 'dailyQuestFarm') &&
              result?.response) {
            return extractRewardActions(record, call, result.response, 'quest');
          }
          if (call.name === 'completeQuest' && Number.isInteger(call.args?.questId)) {
            return [{ key: 'questClaimAction', method: call.name, feature: call.feature || null,
              group: 'internal', data: { questId: call.args.questId, token: call.ident,
                reward: result.response?.reward || null }, updatedAt: record.timestamp }];
          }
          if (call.name === 'claimChest' && call.feature === 'clanVersus') {
            const chestNumber = call.args?.chestNumber;
            const rewards = globalThis.hwaHelperClanVersusRewards?.[chestNumber];
            const actions = [];
            if (rewards) {
              for (const [resKey, amount] of Object.entries(rewards)) {
                if (Number.isFinite(amount) && amount > 0) {
                  const label = resolveResourceLabel(resKey);
                  actions.push(...resourceAction(record, call, resKey, amount, label));
                }
              }
            }
            actions.push({
              key: 'clanVersusChestAction',
              method: call.name,
              feature: call.feature,
              group: 'internal',
              data: { chestNumber, token: `${call.ident}:chest:${chestNumber}` },
              updatedAt: record.timestamp
            });
            return actions;
          }
        }
        if (call.name === 'getInfo' && call.feature === 'clanVersus' && result?.response) {
          return [{
            key: 'clanVersusStatus',
            method: call.name,
            feature: call.feature,
            group: 'events',
            data: { info: result.response },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'getCurrentBattle' && call.feature === 'clanVersus' && result?.response) {
          return [{
            key: 'clanVersusStatus',
            method: call.name,
            feature: call.feature,
            group: 'events',
            data: { battle: result.response },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'getRewardList' && call.feature === 'clanVersus' && result?.response) {
          return [{
            key: 'clanVersusStatus',
            method: call.name,
            feature: call.feature,
            group: 'events',
            data: { rewards: result.response },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'getUserProgress' && call.feature === 'clanVersus' && result?.response) {
          const score = typeof result.response.progress === 'object' && result.response.progress !== null ?
            (result.response.progress.score ?? 0) : (result.response.progress ?? 0);
          return [{
            key: 'clanVersusStatus',
            method: call.name,
            feature: call.feature,
            group: 'events',
            data: {
              progress: result.response.progress ?? 0,
              score,
              chestNumbers: Array.isArray(result.response.chestNumbers) ? result.response.chestNumbers : []
            },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'questGetEvents' && Array.isArray(result?.response)) {
          return [{
            key: 'questEvents',
            method: call.name,
            feature: null,
            group: 'events',
            data: { events: result.response },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'user_getNextDayTime' && Number.isFinite(result?.response?.ts)) {
          return [{ key: 'questResetStatus', method: call.name, feature: null,
            group: 'events', data: { nextDayAt: result.response.ts * 1000 },
            updatedAt: record.timestamp }];
        }
        if ((call.name === 'getSpecialQuestState' || call.name === 'getDailyQuests') && result?.response?.events) {
          return [{
            key: 'specialQuestStatus',
            method: call.name,
            feature: call.feature || null,
            group: 'events',
            data: { events: result.response.events },
            updatedAt: record.timestamp
          }];
        }
        if (call.name?.startsWith('magicTower_') && !['magicTower_briefInfo', 'magicTower_getAll'].includes(call.name) && result && !result.error) {
          const action = call.name.slice('magicTower_'.length);
          if (['enterNextFloor', 'enterRoom', 'startBattle', 'endBattle', 'activateBuff', 'openChest'].includes(action)) {
            const response = result.response || {};
            return [{
              key: 'towerAction', method: call.name, feature: null, group: 'internal',
              data: {
                token: call.ident, action,
                number: Number(call.args?.number) || null,
                buffId: Number(call.args?.id) || null,
                heroes: Array.isArray(call.args?.heroes) ? call.args.heroes : null,
                win: call.args?.result?.win === true,
                stars: call.args?.result?.stars ?? null,
                floorNumber: Number(response.floorNumber) || null,
                roomNumber: response.currentRoomNumber == null ? null : Number(response.currentRoomNumber),
                rooms: response.rooms || null,
                reward: response.reward || null,
                rewardIndex: response.rewardIndex ?? null,
                completion: result.magicTower_completion || null,
                briefInfo: result.magicTower_briefInfo || null
              }, updatedAt: record.timestamp
            }];
          }
        }
        if ((call.name === 'magicTower_briefInfo' || call.name === 'magicTower_getAll') && result?.response) {
          const resp = result.response;
          const isCleared = resp.state === 'win' || resp.state === 'completed' || (Number(resp.floorData?.floorNumber) > 25);
          return [{
            key: 'towerStatus',
            method: call.name,
            feature: null,
            group: 'other',
            data: {
              state: resp.state || (resp.floorData ? 'inProgress' : 'unknown'),
              isCleared,
              ...(resp.skipState != null ? { skipState: resp.skipState } : {}),
              deadHeroesCount: resp.deadHeroesCount ?? 0,
              floorNumber: resp.floorData?.floorNumber ?? (isCleared ? 26 : 0),
              floorData: resp.floorData ? {
                floorNumber: resp.floorData.floorNumber,
                currentRoomNumber: resp.floorData.currentRoomNumber,
                rooms: resp.floorData.rooms || {}
              } : null
            },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'clanWarChampInfo_getBriefInfo' && result?.response) {
          return [{
            key: 'clanWarChampStatus',
            method: call.name,
            feature: null,
            group: 'events',
            data: result.response,
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'getEventInfo' && call.feature === 'fortress' && result?.response) {
          return [{
            key: 'fortressEventStatus',
            method: call.name,
            feature: call.feature,
            group: 'events',
            data: result.response,
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'clanClash_getCurrentState' && result?.response) {
          return [{
            key: 'clanClashStatus',
            method: call.name,
            feature: null,
            group: 'events',
            data: result.response,
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'brawl_getAll' && Array.isArray(result?.response)) {
          return [{
            key: 'brawlStatus',
            method: call.name,
            feature: null,
            group: 'events',
            data: { brawls: result.response },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'mailGetAll' && result?.response) {
          const letters = Array.isArray(result.response.letters) ? result.response.letters : [];
          const unclaimedLetters = letters.filter((l) =>
            l && !l.deleted && (l.reward || l.q_reward || l.items) &&
            !l.claimed && !l.rewardReceived && !l.rewardClaimed
          );
          return [{
            key: 'mailStatus',
            method: call.name,
            feature: null,
            group: 'header',
            data: {
              unclaimedLettersCount: unclaimedLetters.length,
              hasUnclaimedLetters: unclaimedLetters.length > 0,
              letters
            },
            updatedAt: record.timestamp
          }];
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
          const completed = Array.isArray(result.response)
            ? result.response.filter((mission) => Number.isFinite(mission?.stars) && mission.stars > 0)
                .map((mission) => Number(mission?.id ?? 0))
            : Object.entries(result.response).filter(([id, mission]) =>
                /^\d+$/.test(id) && Number.isFinite(mission?.stars) && mission.stars > 0)
                .map(([id, mission]) => Number(mission?.id ?? id));
          const progress = { key: 'missionProgressStatus', method: call.name, feature: null,
            group: 'internal', data: { completed }, updatedAt: record.timestamp };
          return group ? [progress, { key, method: call.name, feature: null,
            group, data: result.response, updatedAt: record.timestamp }] : [progress];
        }
        if ((call.name === 'inventoryCraftFragments' || call.name === 'inventoryCraftRecipe') && result?.response) {
          const records = [{
            key: 'lastCraftResult',
            method: call.name,
            feature: null,
            group: 'internal',
            data: {
              action: call.name,
              args: call.args,
              result: result.response
            },
            updatedAt: record.timestamp
          }];
          if (call.args?.libId && call.ident) {
            records.push({
              key: 'gearCraftAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                action: call.name,
                libId: call.args.libId,
                amount: call.args.amount || 1,
                args: call.args,
                result: result.response,
                token: `${call.ident}:gearCraft`
              },
              updatedAt: record.timestamp
            });
          }
          return records;
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
            data: { name: info.name.slice(0, 80), level: teamLevel, id: info.id ? Number(info.id) : null }, updatedAt: record.timestamp
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
            result?.response) {
          const rawQueues = Array.isArray(result.response.queues)
            ? result.response.queues
            : (result.response.queues && typeof result.response.queues === 'object' ? Object.values(result.response.queues) : []);
          const queues = rawQueues.filter((queue) => {
            const dur = queue.durationMs ?? queue.duration;
            return Number.isFinite(queue.startDate) && Number.isFinite(dur) && dur >= 0;
          })
            .map((queue, index) => ({
              startDate: queue.startDate,
              durationMs: queue.durationMs ?? queue.duration,
              buildingId: queue.buildingId,
              researchId: queue.researchId,
              level: queue.level ?? queue.nextLevel,
              queueNumber: queue.queueNumber ?? index
            }));
          const isBuilding = call.feature === 'building';
          const buildings = isBuilding && Array.isArray(result?.response?.buildings) ? result.response.buildings : undefined;
          const completedResearches = !isBuilding && Array.isArray(result?.response?.completedResearches) ? result.response.completedResearches : undefined;
          return [{ key: isBuilding ? 'buildingStatus' : 'researchStatus',
            method: call.name, feature: call.feature, group: 'header',
            data: {
              queues,
              ...(buildings ? { buildings } : {}),
              ...(completedResearches ? { completedResearches } : {})
            },
            updatedAt: record.timestamp }];
        }
        if ((key === 'startConstruction:building' || (call.name === 'startConstruction' && (!call.feature || call.feature === 'building'))) &&
            result?.response &&
            Number.isFinite(call.args?.startDate) && Number.isFinite(call.args?.durationMs) &&
            call.args.durationMs >= 0) {
          return [{ key: 'buildingStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'start', queue: {
              buildingId: call.args.buildingId, level: call.args.nextLevel ?? call.args.level,
              queueNumber: call.args.queueNumber ?? 0,
              startDate: call.args.startDate, durationMs: call.args.durationMs
            } }, updatedAt: record.timestamp }];
        }
        if ((key === 'completeConstruction:building' || (call.name === 'completeConstruction' && (!call.feature || call.feature === 'building'))) &&
            result?.response) {
          return [{ key: 'buildingStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'complete', buildingId: call.args?.buildingId },
            updatedAt: record.timestamp }];
        }
        if ((key === 'startResearch:personalResearch' || (call.name === 'startResearch' && (!call.feature || call.feature === 'personalResearch'))) &&
            result?.response &&
            Number.isFinite(call.args?.startDate) && Number.isFinite(call.args?.durationMs) &&
            call.args.durationMs >= 0) {
          return [{ key: 'researchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'start', queue: {
              researchId: call.args.researchId, level: call.args.level ?? call.args.nextLevel,
              queueNumber: call.args.queueNumber,
              startDate: call.args.startDate, durationMs: call.args.durationMs
            } }, updatedAt: record.timestamp }];
        }
        if ((key === 'completeResearch:personalResearch' || (call.name === 'completeResearch' && (!call.feature || call.feature === 'personalResearch'))) &&
            result?.response) {
          return [{ key: 'researchStatus', method: call.name, feature: call.feature,
            group: 'header', data: { action: 'complete', researchId: call.args?.researchId },
            updatedAt: record.timestamp }];
        }
        if (key === 'createRally:mob' && result?.response?.rally?.rallyId) {
          return [{ key: 'worldEnergyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'create', rallyId: result.response.rally.rallyId },
            updatedAt: record.timestamp },
          ...(call.args?.squad ? [{ key: 'experimentalLastSquad', method: call.name,
            feature: call.feature, group: 'internal', data: call.args.squad,
            updatedAt: record.timestamp }] : []),
          { key: 'rallyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'create',
              mobId: call.args?.mobId, mapId: call.args?.mapId,
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
        if ((key === 'joinRally:rally' || key === 'joinRally:mob') && result?.response && !result.error && call.args?.rallyId) {
          return [{ key: 'rallyAction', method: call.name, feature: call.feature,
            group: 'internal', data: { action: 'join', rallyId: call.args.rallyId,
              squadId: result.response.squadId, team: rallyTeam(call.args?.squad) },
            updatedAt: record.timestamp }];
        }
        if (call.name === 'shopBuy') {
          const resp = result?.response;
          const cost = resp?.slot?.cost || resp?.cost || call.args?.cost;
          const reward = resp?.reward || resp?.slot?.reward || call.args?.reward;
          const slotId = resp?.slot?.id ?? call.args?.slot ?? 'default';
          const actions = [];
          if (cost) {
            actions.push(...extractCostActions(record, call, cost, `shopBuy:cost:${slotId}`));
          }
          if (reward) {
            actions.push(...extractRewardActions(record, call, reward, `shopBuy:reward:${slotId}`));
          }
          return actions;
        }
        if (call.name === 'randomDraft_register') {
          return [
            ...resourceAction(record, call, 'refillable:60', -1, 'Draft Chips', 'randomDraft_register'),
            {
              key: 'legendDraftStatus',
              method: call.name,
              feature: null,
              group: 'draft',
              data: {
                active: true,
                stageId: 1,
                matchId: null,
                stageFinishTs: null,
                defenceHeroes: [],
                attackHeroes: [],
                enemyDefenceHeroes: [],
                enemyAttackHeroes: [],
                lastResult: null,
                lastPickAction: null,
                inBattle: false
              },
              updatedAt: record.timestamp
            }
          ];
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
              active: stageId > 0 && stageId < 7,
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
          if (result?.error || result?.response?.error) {
            return [{
              key: 'legendDraftAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                action: 'saveDefence',
                error: result?.response?.error || result?.error || 'Invalid heroes list',
                errorCode: result?.response?.errorCode || null
              },
              updatedAt: record.timestamp
            }];
          }
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
          if (result?.error || result?.response?.error) {
            return [{
              key: 'legendDraftAction',
              method: call.name,
              feature: null,
              group: 'internal',
              data: {
                action: 'saveAttack',
                error: result?.response?.error || result?.error || 'Invalid heroes list',
                errorCode: result?.response?.errorCode || null
              },
              updatedAt: record.timestamp
            }];
          }
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
          const stars = (heroes) => Object.fromEntries(Object.entries(heroes || {})
            .filter(([, hero]) => Number.isInteger(hero?.star))
            .map(([id, hero]) => [id, hero.star]));
          return [{
            key: 'legendDraftAction',
            method: call.name,
            feature: null,
            group: 'internal',
            data: {
              action: 'startBattle',
              attackers: replay.attackers ? Object.keys(replay.attackers).map(Number) : [],
              defenders: Array.isArray(replay.defenders) && replay.defenders[0] ?
                Object.keys(replay.defenders[0]).map(Number) : [],
              attackStars: stars(replay.attackers),
              enemyDefenceStars: stars(replay.defenders?.[0])
            },
            updatedAt: record.timestamp
          }];
        }
        if (call.name === 'randomDraft_result') {
          const resp = result?.response;
          const stars = (heroes) => Object.fromEntries(Object.entries(heroes || {})
            .filter(([, hero]) => Number.isInteger(hero?.star))
            .map(([id, hero]) => [id, hero.star]));
          const attackHeroes = resp?.attackReplay?.attackers ?
            Object.keys(resp.attackReplay.attackers).map(Number) : [];
          const enemyDefenceHeroes = Array.isArray(resp?.attackReplay?.defenders) && resp.attackReplay.defenders[0] ?
            Object.keys(resp.attackReplay.defenders[0]).map(Number) : [];
          const defenceHeroes = Array.isArray(resp?.defenceReplay?.defenders) && resp.defenceReplay.defenders[0] ?
            Object.keys(resp.defenceReplay.defenders[0]).map(Number) : [];
          const enemyAttackHeroes = resp?.defenceReplay?.attackers ?
            Object.keys(resp.defenceReplay.attackers).map(Number) : [];
          return [{
            key: 'legendDraftAction',
            method: call.name,
            feature: null,
            group: 'internal',
            data: {
              action: 'result',
              matchId: call.args?.matchId ?? resp?.matchId ?? null,
              result: resp?.result ?? null,
              resultDetails: resp?.resultDetails ?? null,
              rating: resp?.rating ?? null,
              reward: resp?.reward ?? null,
              attackHeroes,
              enemyDefenceHeroes,
              defenceHeroes,
              enemyAttackHeroes,
              attackStars: stars(resp?.attackReplay?.attackers),
              enemyDefenceStars: stars(resp?.attackReplay?.defenders?.[0]),
              defenceStars: stars(resp?.defenceReplay?.defenders?.[0]),
              enemyAttackStars: stars(resp?.defenceReplay?.attackers)
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
        if ((key === 'completeTraining:unit' || call.name === 'completeTraining') && result?.response) {
          const unitId = Number(call.args?.unitId);
          if (Number.isInteger(unitId)) {
            return [{
              key: 'completeTrainingAction',
              method: call.name,
              feature: call.feature || null,
              group: 'internal',
              data: { unitId, token: call.ident },
              updatedAt: record.timestamp
            }];
          }
        }
        if ((key === 'startTraining:unit' || call.name === 'startTraining') && result?.response) {
          const unitId = Number(call.args?.unitId);
          if (Number.isInteger(unitId)) {
            return [{
              key: 'startTrainingAction',
              method: call.name,
              feature: call.feature || null,
              group: 'internal',
              data: {
                unitId,
                count: Number(call.args?.count) || 0,
                startDate: Number(call.args?.startDate) || Date.parse(record.timestamp) || Date.now(),
                duration: Number(call.args?.duration) || 0,
                token: call.ident
              },
              updatedAt: record.timestamp
            }];
          }
        }
        if ((key === 'startHealing:unit' || call.name === 'startHealing') && result?.response) {
          const units = Array.isArray(call.args?.units) ? call.args.units.map((u) => ({
            unitId: Number(u?.unitId),
            count: Number(u?.count) || 0
          })) : [];
          return [{
            key: 'startHealingAction',
            method: call.name,
            feature: call.feature || null,
            group: 'internal',
            data: {
              startDate: Number(call.args?.startDate) || Date.parse(record.timestamp) || Date.now(),
              duration: Number(call.args?.duration) || 0,
              units,
              token: call.ident
            },
            updatedAt: record.timestamp
          }];
        }
        if (!group || !result || !Object.hasOwn(result, 'response') || result.response == null) return [];
        return [{ key, method: call.name, feature: call.feature || null,
          group, data: result.response, updatedAt: record.timestamp }];
      });
      const experimentalCalls = new Set(['searchMob:mob', 'searchMine:mine', 'createRally:mob', 'cancelRally:rally',
        'joinRally:rally', 'joinRally:mob', 'attackMine:mine', 'stopMineGathering:mine']);
      for (const call of request.calls) {
        if (!experimentalCalls.has(`${call.name}:${call.feature}`)) continue;
        const result = results.get(call.ident);
        if (!result) continue;
        const rawError = result.error;
        const error = typeof rawError === 'string' ? rawError :
          (rawError?.message || rawError?.description || null);
        actions.push({ key: 'experimentalActionStatus', method: call.name,
          feature: call.feature, group: 'internal', data: {
            name: call.name, ok: Boolean(result.response && !rawError),
            error: error ? String(error).slice(0, 200) : null
          }, updatedAt: record.timestamp });
      }
      return actions;
    } catch (_) {
      return [];
    }
  }

  function matchRallyMarch(marches, data, accountId) {
    if (data.ownerId != null && accountId != null && String(data.ownerId) !== String(accountId)) return -1;
    let matches = marches.map((march, index) => ({ march, index })).filter(({ march }) => march.rally);
    if (data.rallyId || data.squadId) {
      matches = matches.filter(({ march }) => (!data.rallyId || march.rally.id === data.rallyId) &&
        (!data.squadId || march.squadId === data.squadId));
    } else {
      const routes = data.routeId ? matches.filter(({ march }) =>
        march.routeId === data.routeId || march.rally.returnRouteId === data.routeId) : [];
      if (routes.length) matches = routes;
      else if (data.mobId && (data.action === 'battleReport' ||
          (data.ownerId != null && accountId != null && String(data.ownerId) === String(accountId)))) {
        matches = matches.filter(({ march }) => march.rally.mobId === data.mobId &&
          (data.action !== 'returnRoute' || !Number.isFinite(march.rally.waitUntil) || data.startedAt >= march.rally.waitUntil));
      } else return -1;
    }
    return matches.length === 1 ? matches[0].index : -1;
  }

  function normalizeArrayData(raw) {
    if (Array.isArray(raw)) return [...raw];
    if (raw && typeof raw === 'object') return Object.values(raw);
    return [];
  }

  function observeSquad(cache, team, source, at) {
    const accountId = cache.accountStatus?.data?.id;
    const heroes = cache.heroGetAll?.data || {};
    const ids = [...new Set(team?.heroIds || [])].sort((a, b) => a - b);
    const total = (team?.units || []).reduce((sum, unit) => sum + (Number.isSafeInteger(unit.count) && unit.count > 0 ? unit.count : 0), 0);
    if (!accountId || ids.length !== 5 || !total || !ids.every((id) => Number.isInteger(heroes[id]?.level) &&
        Number.isInteger(heroes[id]?.star) && Number.isFinite(heroes[id]?.power)) || cache.heroGetAll?.updatedAt > at) return false;
    const profiles = ids.map((id) => ({ id, signature: JSON.stringify([heroes[id].level, heroes[id].star, heroes[id].power]) }));
    const key = JSON.stringify([accountId, profiles]);
    const prior = normalizeArrayData(cache.troopCapacityEvidence?.data);
    const previous = prior.find((row) => row.key === key);
    if (previous && previous.total >= total) return false;
    cache.troopCapacityEvidence = { key: 'troopCapacityEvidence', group: 'internal', method: source, updatedAt: at,
      data: [{ key, accountId, profiles, total, source, observedAt: at }, ...prior.filter((row) => row.key !== key)].slice(0, 100) };
    return true;
  }

  function merge(cache, records, maxBytes = 5 * 1024 * 1024) {
    let next = { ...(cache && typeof cache === 'object' ? cache : {}) };
    let changed = false;
    for (const record of records) {
      const entries = record && record.key ? [record] : extract(record);
      for (const entry of entries) {
        if (entry.key === 'experimentalRallySearch') {
          const won = normalizeArrayData(next.experimentalDefeatedBosses?.data);
          const mobs = normalizeArrayData(entry.data?.mobs);
          entry.data = { ...entry.data, mobs: mobs.filter((mob) =>
            mob && !won.some((item) => item?.mapId === entry.data?.mapId && item?.mobId === mob?.mobId)) };
        }
        if (entry.key === 'questClaimAction') {
          const previous = next.questClaimStatus?.data || { claims: [] };
          if (previous.claims?.some((claim) => claim.token === entry.data.token)) continue;
          const quest = Array.isArray(next.questGetAll?.data) ?
            next.questGetAll.data.find((item) => item.id === entry.data.questId) : null;
          const reward = entry.data.reward || quest?.reward || null;
          if (reward) {
            entries.push(...extractRewardActions(record,
              { name: 'completeQuest', feature: entry.feature, ident: entry.data.token },
              reward, `quest:${entry.data.questId}`));
          }
          const claim = { id: entry.data.questId, token: entry.data.token,
            needsSync: !reward, at: entry.updatedAt };
          next.questClaimStatus = { key: 'questClaimStatus', method: entry.method,
            feature: entry.feature, group: 'internal',
            data: { claims: [...normalizeArrayData(previous.claims), claim].slice(-50) },
            updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'soloMobMapAction') {
          const monsters = { ...(next.soloMobMap?.data || {}), ...entry.data.monsters };
          const ids = Object.keys(monsters);
          for (const id of ids.slice(0, Math.max(0, ids.length - 300))) delete monsters[id];
          next.soloMobMap = { key: 'soloMobMap', method: entry.method,
            feature: entry.feature, group: 'internal', data: monsters,
            updatedAt: entry.updatedAt };
          const existingMarches = normalizeArrayData(next.marchStatus?.data?.marches);
          if (existingMarches.some((march) =>
              march.kind === 'attack' && !Number.isInteger(march.mobConfigId) &&
              Number.isInteger(monsters[march.mobId]?.mobConfigId))) {
            next.marchStatus = { ...next.marchStatus, data: {
              marches: existingMarches.map((march) =>
                march.kind === 'attack' && !Number.isInteger(march.mobConfigId) &&
                Number.isInteger(monsters[march.mobId]?.mobConfigId) ?
                  { ...march, mobConfigId: monsters[march.mobId].mobConfigId } : march)
            } };
          }
          changed = true;
          continue;
        }
        if (entry.key === 'soloAttackAction') {
          const current = next.marchStatus;
          if (current?.updatedAt > entry.updatedAt) continue;
          const marches = normalizeArrayData(current?.data?.marches);
          const target = next.soloMobMap?.data?.[entry.data.mobId];
          const march = { squadId: entry.data.squadId, kind: 'attack',
            stage: 'moveToTargetInSolo', routeId: entry.data.routeId,
            mobId: entry.data.mobId, mobConfigId: target?.mobConfigId,
            team: entry.data.team, startedAt: entry.data.startedAt,
            durationMs: entry.data.durationMs,
            targetArrivalAt: entry.data.targetArrivalAt,
            endsAt: entry.data.targetArrivalAt };
          const index = marches.findIndex((item) => item.squadId === march.squadId);
          if (index >= 0) {
            if (marches[index].routeId === march.routeId) continue;
            marches[index] = march;
          } else marches.push(march);
          next.marchStatus = { key: 'marchStatus', method: entry.method,
            feature: entry.feature, group: 'header', data: { marches },
            updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'soloAttackReturnAction') {
          const current = next.marchStatus;
          const marches = normalizeArrayData(current?.data?.marches);
          const matches = marches.map((march, index) => ({ march, index }))
            .filter(({ march }) => march.kind === 'attack' &&
              march.mobId === entry.data.mobId &&
              (!Number.isFinite(march.startedAt) || entry.data.returnAt > march.startedAt));
          if (matches.length !== 1) continue;
          const { march, index } = matches[0];
          marches[index] = { ...march, stage: 'returnToOutpost',
            returnAt: entry.data.returnAt, endsAt: entry.data.returnAt,
            returnEstimated: false };
          next.marchStatus = { key: 'marchStatus', method: entry.method,
            feature: entry.feature, group: 'header', data: { marches },
            updatedAt: current?.updatedAt > entry.updatedAt ? current.updatedAt : entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'soloAttackResultAction') {
          const previous = normalizeArrayData(next.soloAttackResults?.data);
          if (previous.some((report) => report?.reportId === entry.data.reportId)) continue;
          const report = { ...entry.data };
          next.soloAttackResults = { key: 'soloAttackResults', method: entry.method,
            feature: entry.feature, group: 'other',
            data: [...previous, report].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
            updatedAt: entry.updatedAt };
          const current = next.marchStatus;
          const marches = normalizeArrayData(current?.data?.marches);
          const candidates = marches.map((march, index) => ({ march, index }))
            .filter(({ march }) => march.kind === 'attack' && !march.result &&
              Number.isFinite(march.startedAt) && report.createdAt >= march.startedAt &&
              (!Number.isInteger(march.mobConfigId) || march.mobConfigId === report.mobConfigId) &&
              Math.abs(report.createdAt - march.targetArrivalAt) <= 120000)
            .sort((a, b) => Math.abs(report.createdAt - a.march.targetArrivalAt) -
              Math.abs(report.createdAt - b.march.targetArrivalAt));
          if (candidates.length === 1 || (candidates.length > 1 &&
              Math.abs(report.createdAt - candidates[0].march.targetArrivalAt) <
              Math.abs(report.createdAt - candidates[1].march.targetArrivalAt))) {
            const { march, index } = candidates[0];
            const actualReturn = march.stage === 'returnToOutpost' &&
              Number.isFinite(march.endsAt);
            const returnAt = actualReturn ? march.endsAt : report.createdAt + march.durationMs;
            marches[index] = { ...march, result: report.result,
              reportId: report.reportId, stage: 'returnToOutpost',
              returnAt, endsAt: returnAt, returnEstimated: !actualReturn };
            next.marchStatus = { key: 'marchStatus', method: entry.method,
              feature: entry.feature, group: 'header', data: { marches },
              updatedAt: current?.updatedAt > entry.updatedAt ? current.updatedAt : entry.updatedAt };
          }
          changed = true;
          continue;
        }
        if (entry.key === 'rallyAction') {
          if (['create', 'socketAutojoined', 'join'].includes(entry.data.action)) changed = observeSquad(next, entry.data.team, entry.method, entry.updatedAt) || changed;
          if (entry.data.action === 'details') {
            const accountId = next.accountStatus?.data?.id;
            const member = [entry.data.leader, ...(entry.data.members || [])].find((member) => accountId && String(member?.userId) === String(accountId));
            if (member?.squad) changed = observeSquad(next, rallyTeam(member.squad), entry.method, entry.updatedAt) || changed;
          }
          if (entry.data.action === 'socketReturnCompleted') {
            next.experimentalRallyReturns = { key: 'experimentalRallyReturns', group: 'internal',
              method: entry.method, updatedAt: entry.updatedAt,
              data: [{ squadId: entry.data.squadId, returnedAt: Date.parse(entry.updatedAt) },
                ...normalizeArrayData(next.experimentalRallyReturns?.data).filter((item) => item.squadId !== entry.data.squadId)].slice(0, 200) };
            changed = true;
          }
          if (['create', 'details'].includes(entry.data.action) && entry.data.mobId && entry.data.mapId) {
            next.experimentalRallyTargets = { key: 'experimentalRallyTargets', group: 'internal',
              method: entry.method, updatedAt: entry.updatedAt,
              data: [{ rallyId: entry.data.rallyId, mobId: entry.data.mobId, mapId: entry.data.mapId },
                ...normalizeArrayData(next.experimentalRallyTargets?.data).filter((item) => item.rallyId !== entry.data.rallyId)].slice(0, 200) };
          }
          const current = next.marchStatus;
          if (current?.updatedAt > entry.updatedAt && entry.data.action !== 'socketResult') continue;
          const marches = normalizeArrayData(current?.data?.marches);
          let index = marches.findIndex((march) => march.rally?.id === entry.data.rallyId);
          if (entry.data.action === 'socketAutojoined') {
            if (index < 0) index = marches.findIndex((march) =>
              march.squadId === entry.data.squadId);
            const previous = index >= 0 ? marches[index] : null;
            const joined = { ...previous, squadId: entry.data.squadId,
              kind: 'raid', stage: 'moveToRallyLeader', endsAt: entry.data.endsAt,
              rally: { ...previous?.rally, id: entry.data.rallyId,
                isAutoJoin: true, team: entry.data.team,
                memberEta: entry.data.endsAt } };
            if (index >= 0) marches[index] = joined;
            else marches.push(joined);
          } else if (entry.data.action === 'socketResult') {
            if (index < 0) index = marches.findIndex((march) =>
              march.kind === 'raid' && march.squadId === entry.data.squadId);
            const alreadyReturned = normalizeArrayData(next.experimentalRallyReturns?.data).some((item) => item?.squadId === entry.data.squadId);
            if (index < 0 && !alreadyReturned && Number.isFinite(entry.data.returnAt) && !(current?.updatedAt > entry.updatedAt)) {
              marches.push({ squadId: entry.data.squadId, kind: 'raid',
                ...(entry.data.returnRouteId ? { routeId: entry.data.returnRouteId } : {}),
                stage: 'returnToOutpost', endsAt: entry.data.returnAt,
                result: entry.data.result,
                rally: { id: entry.data.rallyId, returnAt: entry.data.returnAt,
                  returnRouteId: entry.data.returnRouteId,
                  mobConfigId: entry.data.mobConfigId } });
              index = marches.length - 1;
            }
            if (index >= 0) {
              const previous = marches[index];
              const returnAt = Number.isFinite(entry.data.returnAt) ? entry.data.returnAt :
                previous.rally?.returnAt ?? previous.endsAt;
              marches[index] = { ...previous, stage: 'returnToOutpost', endsAt: returnAt,
                ...(entry.data.returnRouteId ? { routeId: entry.data.returnRouteId } : {}),
                result: entry.data.result || previous.result,
                rally: { ...previous.rally, id: entry.data.rallyId,
                  returnRouteId: entry.data.returnRouteId || previous.rally?.returnRouteId,
                  returnAt, mobConfigId: entry.data.mobConfigId ?? previous.rally?.mobConfigId } };
            }
          } else if (entry.data.action === 'socketReturnCompleted') {
            index = marches.findIndex((march) => ['raid', 'attack'].includes(march.kind) &&
              march.squadId === entry.data.squadId);
            if (index < 0) continue;
            marches.splice(index, 1);
          } else if (entry.data.action === 'create') {
            if (!entry.data.squadId ||
                !Number.isFinite(entry.data.waitUntil)) continue;
            if (index < 0) index = marches.findIndex((march) => march.squadId === entry.data.squadId);
            const created = { squadId: entry.data.squadId, kind: 'raid',
              stage: 'waitingForRallyStart', endsAt: entry.data.waitUntil,
              rally: { id: entry.data.rallyId, waitUntil: entry.data.waitUntil,
                mobId: entry.data.mobId, mapId: entry.data.mapId,
                team: entry.data.team } };
            if (index >= 0) {
              if (marches[index].rally?.id === entry.data.rallyId) continue;
              marches[index] = { ...marches[index], kind: 'raid', rally: created.rally };
            } else {
              marches.push(created);
            }
          } else if (entry.data.action === 'details') {
            const accountId = next.accountStatus?.data?.id ?? next.userGetInfo?.data?.id;
            const ownSquads = new Set(marches.map((march) => march.squadId).filter(Boolean));
            const isOwn = (member) => accountId != null ? String(member?.userId) === String(accountId) : ownSquads.has(member?.squad?.squadId);
            const isLeader = isOwn(entry.data.leader);
            const myMember = (entry.data.members || []).find(isOwn);
            const ownSquadId = myMember?.squad?.squadId || (isLeader ? entry.data.squadId : null);
            if (index < 0 && ownSquadId) {
              index = marches.findIndex((march) => march.squadId === ownSquadId);
            }

            if (index >= 0) {
              const previous = marches[index];
              const squadId = myMember?.squad?.squadId || previous.squadId || entry.data.squadId;
              const team = myMember ? rallyTeam(myMember.squad) : (isLeader && entry.data.team?.heroIds?.length ? entry.data.team : previous.rally?.team);
              marches[index] = {
                ...previous,
                squadId,
                stage: myMember && Number.isFinite(myMember.eta) && Date.now() < myMember.eta ? 'moveToRallyLeader' : previous.stage,
                endsAt: myMember && Number.isFinite(myMember.eta) && Date.now() < myMember.eta ? myMember.eta : previous.endsAt,
                rally: {
                  ...previous.rally,
                  id: entry.data.rallyId,
                  mobId: entry.data.mobId || previous.rally?.mobId,
                  mapId: entry.data.mapId || previous.rally?.mapId,
                  mobConfigId: entry.data.mobConfigId ?? previous.rally?.mobConfigId,
                  target: entry.data.target,
                  waitUntil: Number.isFinite(entry.data.waitUntil) ? entry.data.waitUntil : previous.rally?.waitUntil,
                  team,
                  leaderName: entry.data.leader?.user?.name || previous.rally?.leaderName,
                  isAutoJoin: isLeader ? false : myMember ? true : previous.rally?.isAutoJoin || false,
                  memberEta: myMember?.eta,
                  outboundMs: entry.data.outboundMs,
                  returnMs: entry.data.returnMs
                }
              };
            } else if (isLeader || myMember) {
              const squadId = myMember?.squad?.squadId || entry.data.squadId;
              const team = myMember ? rallyTeam(myMember.squad) : entry.data.team;
              const now = Date.now();
              const stage = myMember && Number.isFinite(myMember.eta) && now < myMember.eta ?
                'moveToRallyLeader' : 'waitingForRallyStart';
              const endsAt = stage === 'moveToRallyLeader' ? myMember.eta : entry.data.waitUntil;

              marches.push({
                squadId,
                kind: 'raid',
                stage,
                endsAt,
                rally: {
                  id: entry.data.rallyId,
                  mobId: entry.data.mobId, mapId: entry.data.mapId, mobConfigId: entry.data.mobConfigId,
                  target: entry.data.target,
                  waitUntil: entry.data.waitUntil,
                  team,
                  leaderName: entry.data.leader?.user?.name,
                  isAutoJoin: Boolean(myMember && !isLeader),
                  memberEta: myMember?.eta,
                  outboundMs: entry.data.outboundMs,
                  returnMs: entry.data.returnMs
                }
              });
            }
          } else if (entry.data.action === 'cancel') {
            if (index < 0) continue;
            marches.splice(index, 1);
          } else if (['returnRoute', 'battleReport'].includes(entry.data.action)) {
            index = matchRallyMarch(marches, entry.data, next.accountStatus?.data?.id ?? next.userGetInfo?.data?.id);
            if (index < 0) continue;
            const march = marches[index];
            if (entry.data.action === 'returnRoute') {
              marches[index] = { ...march, stage: 'returnToOutpost', endsAt: entry.data.returnAt,
                routeId: entry.data.routeId || march.routeId,
                rally: { ...march.rally, returnAt: entry.data.returnAt,
                  returnRouteId: entry.data.routeId || march.rally.returnRouteId } };
            } else {
              if (Number.isFinite(march.rally.waitUntil) && entry.data.createdAt < march.rally.waitUntil) continue;
              const returnMs = march.rally.returnMs || march.rally.outboundMs || 60000;
              const returnAt = march.rally.returnAt || entry.data.createdAt + returnMs;
              marches[index] = { ...march, stage: 'returnToOutpost', endsAt: returnAt,
                result: march.result || entry.data.result || null,
                rally: { ...march.rally, arrivalAt: march.rally.arrivalAt || entry.data.createdAt, returnAt } };
            }
          }
          if (entry.data.action === 'socketResult') {
            const march = marches.find((item) => item.rally?.id === entry.data.rallyId);
            const target = normalizeArrayData(next.experimentalRallyTargets?.data).find((item) => item?.rallyId === entry.data.rallyId);
            const prior = normalizeArrayData(next.experimentalRallyHistory?.data);
            const latest = { rallyId: entry.data.rallyId, squadId: entry.data.squadId,
              returnedAt: normalizeArrayData(next.experimentalRallyReturns?.data).find((item) => item?.squadId === entry.data.squadId)?.returnedAt || null,
              mobId: march?.rally?.mobId || target?.mobId, mapId: march?.rally?.mapId || target?.mapId,
              result: entry.data.result || null, mobConfigId: entry.data.mobConfigId,
              waitUntil: march?.rally?.waitUntil || null,
              arrivalAt: march?.rally?.arrivalAt || null,
              returnAt: entry.data.returnAt || null,
              updatedAt: entry.updatedAt };
            next.experimentalRallyHistory = { key: 'experimentalRallyHistory',
              method: entry.method, feature: entry.feature, group: 'internal',
              data: [latest, ...prior.filter((item) => item?.rallyId !== latest.rallyId)].slice(0, 20),
              updatedAt: entry.updatedAt };
            if (latest.result === 'win' && latest.mobId && latest.mapId) {
              const previousWins = normalizeArrayData(next.experimentalDefeatedBosses?.data);
              next.experimentalDefeatedBosses = { key: 'experimentalDefeatedBosses',
                method: entry.method, group: 'internal', updatedAt: entry.updatedAt,
                data: [{ mapId: latest.mapId, mobId: latest.mobId }, ...previousWins.filter((item) =>
                  item && (item.mapId !== latest.mapId || item.mobId !== latest.mobId))].slice(0, 200) };
              const search = next.experimentalRallySearch;
              if (search?.data?.mapId === latest.mapId) {
                const searchMobs = normalizeArrayData(search.data?.mobs);
                next.experimentalRallySearch = {
                  ...search, data: { ...search.data, mobs: searchMobs.filter((mob) => mob && mob.mobId !== latest.mobId) } };
              }
            }
          }
          next.marchStatus = current?.updatedAt > entry.updatedAt ? current : { key: 'marchStatus', method: entry.method,
            feature: entry.feature, group: 'header', data: { marches },
            updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'mineMapAction') {
          const existing = next.mineMap || {};
          const merged = { ...existing, ...entry.data.mines };
          const keys = Object.keys(merged);
          if (keys.length > 500) {
            for (const k of keys.slice(0, keys.length - 500)) delete merged[k];
          }
          next.mineMap = merged;
          continue;
        }
        if (entry.key === 'gatherAction') {
          if (entry.data.action === 'startGather') changed = observeSquad(next, entry.data.team, entry.method, entry.updatedAt) || changed;
          const current = next.marchStatus;
          if (current?.updatedAt > entry.updatedAt) continue;
          const marches = normalizeArrayData(current?.data?.marches);
          const squadId = entry.data.squadId;
          const index = marches.findIndex((m) => m.squadId === squadId);
          if (entry.data.action === 'startGather') {
            const mineInfo = next.mineMap?.[entry.data.mineId];
            const kind = mineInfo?.mineType || 'mine';
            const gatherMarch = {
              squadId,
              mineId: entry.data.mineId,
              mineConfigId: mineInfo?.mineConfigId,
              kind,
              stage: 'moveToTargetInSolo',
              startedAt: entry.data.startedAt,
              durationMs: entry.data.durationMs,
              targetArrivalAt: entry.data.targetArrivalAt,
              endsAt: entry.data.targetArrivalAt,
              team: entry.data.team
            };
            if (index >= 0) marches[index] = { ...marches[index], ...gatherMarch };
            else marches.push(gatherMarch);
          } else if (entry.data.action === 'stopGather') {
            if (index >= 0) {
              const prev = marches[index];
              marches[index] = {
                ...prev,
                kind: 'return',
                stage: 'returnToOutpost',
                previousKind: prev.kind,
                endsAt: entry.data.returnAt,
                returnAt: entry.data.returnAt,
                remainingResourceAmount: entry.data.remainingResourceAmount
              };
            } else {
              marches.push({
                squadId,
                kind: 'return',
                stage: 'returnToOutpost',
                endsAt: entry.data.returnAt,
                returnAt: entry.data.returnAt,
                remainingResourceAmount: entry.data.remainingResourceAmount
              });
            }
          }
          next.marchStatus = {
            key: 'marchStatus',
            method: entry.method,
            feature: entry.feature,
            group: 'header',
            data: { marches },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }
        if (entry.key === 'clanVersusStatus') {
          const existing = next.clanVersusStatus?.data || {};
          const incoming = entry.data || {};
          const isNewDay = next.clanVersusStatus?.updatedAt && entry.updatedAt &&
            new Date(next.clanVersusStatus.updatedAt).toDateString() !== new Date(entry.updatedAt).toDateString();
          const isNewRound = existing.info?.roundNumber && incoming.info?.roundNumber &&
            existing.info.roundNumber !== incoming.info.roundNumber;

          let chestNumbers;
          if (incoming.chestNumbers !== undefined) {
            chestNumbers = Array.isArray(incoming.chestNumbers) ? [...incoming.chestNumbers].sort((a, b) => a - b) : [];
          } else if (isNewDay || isNewRound) {
            chestNumbers = [];
          } else {
            chestNumbers = existing.chestNumbers || [];
          }

          const mergedData = {
            ...existing,
            ...incoming,
            info: incoming.info ? { ...existing.info, ...incoming.info } : existing.info,
            battle: incoming.battle ? { ...existing.battle, ...incoming.battle } : existing.battle,
            rewards: incoming.rewards ? { ...existing.rewards, ...incoming.rewards } : existing.rewards,
            chestNumbers
          };
          if (incoming.score !== undefined) {
            mergedData.score = incoming.score;
          } else if (incoming.rewards?.userRoundPoints !== undefined) {
            mergedData.score = incoming.rewards.userRoundPoints;
          } else if (isNewDay || isNewRound) {
            mergedData.score = 0;
          } else if (existing.score !== undefined) {
            mergedData.score = existing.score;
          }
          if (incoming.progress !== undefined) {
            mergedData.progress = incoming.progress;
          } else if (isNewDay || isNewRound) {
            mergedData.progress = 0;
          }
          const latestTime = entry.updatedAt > (next.clanVersusStatus?.updatedAt || '') ?
            entry.updatedAt : (next.clanVersusStatus?.updatedAt || entry.updatedAt);
          next.clanVersusStatus = {
            key: 'clanVersusStatus',
            method: entry.method,
            feature: entry.feature,
            group: 'events',
            data: mergedData,
            updatedAt: latestTime
          };
          changed = true;
          continue;
        }
        if (entry.key === 'clanVersusChestAction') {
          const isNewDay = next.clanVersusStatus?.updatedAt && entry.updatedAt &&
            new Date(next.clanVersusStatus.updatedAt).toDateString() !== new Date(entry.updatedAt).toDateString();
          const status = (next.clanVersusStatus && !isNewDay) ? { ...next.clanVersusStatus.data } : { progress: 0, chestNumbers: [] };
          const chests = new Set(status.chestNumbers || []);
          if (entry.data.chestNumber && !chests.has(entry.data.chestNumber)) {
            chests.add(entry.data.chestNumber);
            status.chestNumbers = Array.from(chests).sort((a, b) => a - b);
            next.clanVersusStatus = {
              key: 'clanVersusStatus',
              method: entry.method,
              feature: entry.feature,
              group: 'internal',
              data: status,
              updatedAt: entry.updatedAt
            };
            changed = true;
          }
          continue;
        }
        if (entry.key === 'resourceAction') {
          const resourceEntry = next[entry.data.resourceKey];
          if (entry.data.requireSnapshot && !resourceEntry) continue;
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token]) continue;
          if (resourceEntry && resourceEntry.updatedAt > entry.updatedAt) continue;
          const actionAt = Date.parse(entry.updatedAt);
          if (!Number.isFinite(actionAt)) continue;
          const data = resourceEntry ? { ...resourceEntry.data } : {
            amount: 0,
            label: entry.data.label || resolveResourceLabel(entry.data.resourceKey.replace(/^resource:/, ''))
          };
          if (!Number.isFinite(data.amount)) data.amount = 0;
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
          next[entry.data.resourceKey] = { key: entry.data.resourceKey, method: entry.method, feature: null, group: 'resources',
            data, updatedAt: entry.updatedAt };
          if (entry.data.resourceKey === 'resource:energy') {
            next.energyStatus = { key: 'energyStatus', method: entry.method,
              feature: null, group: 'header', data: { energy: data.amount },
              updatedAt: entry.updatedAt };
          } else if (entry.data.resourceKey === 'resource:world-energy') {
            next.worldEnergyStatus = { key: 'worldEnergyStatus', method: entry.method,
              feature: null, group: 'header', data: { energy: data.amount },
              updatedAt: entry.updatedAt };
          }
          const rawResKey = entry.data.resourceKey.replace(/^resource:/, '');
          if (rawResKey === 'gold') {
            if (next.userGetInfo?.data) {
              next.userGetInfo = {
                ...next.userGetInfo,
                data: { ...next.userGetInfo.data, gold: data.amount }
              };
            }
          } else if (rawResKey === 'starMoney' && next.userGetInfo?.data) {
            next.userGetInfo = {
              ...next.userGetInfo,
              data: { ...next.userGetInfo.data, starMoney: data.amount }
            };
          } else if (rawResKey.includes(':')) {
            const [rType, rId] = rawResKey.split(':');
            if (next.inventoryGet?.data?.[rType]) {
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  [rType]: { ...next.inventoryGet.data[rType], [rId]: data.amount }
                }
              };
            }
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

          const isNewMatch = Boolean(
            entry.method === 'randomDraft_register' ||
            (entry.data.matchId && previous.matchId && entry.data.matchId !== previous.matchId) ||
            (entry.data.stageId >= 1 && entry.data.stageId <= 5 && (previous.stageId === 0 || previous.stageId === 7 || previous.lastResult != null || !previous.active)) ||
            (entry.data.stageId === 1 && previous.stageId !== 1) ||
            (entry.data.stageId === 2 && previous.stageId !== 2)
          );

          const defenceHeroes = isNewMatch ? [] : (previous.defenceHeroes || []);
          const attackHeroes = isNewMatch ? [] : (previous.attackHeroes || []);
          const enemyDefenceHeroes = isNewMatch ? [] : (previous.enemyDefenceHeroes || []);
          const enemyAttackHeroes = isNewMatch ? [] : (previous.enemyAttackHeroes || []);
          const defenceStars = isNewMatch ? {} : (previous.defenceStars || {});
          const attackStars = isNewMatch ? {} : (previous.attackStars || {});
          const enemyDefenceStars = isNewMatch ? {} : (previous.enemyDefenceStars || {});
          const enemyAttackStars = isNewMatch ? {} : (previous.enemyAttackStars || {});
          const lastResult = isNewMatch ? null : (previous.lastResult || null);
          const lastPickAction = isNewMatch ? null : (previous.lastPickAction || null);

          next.legendDraftStatus = {
            key: 'legendDraftStatus',
            method: entry.method,
            feature: null,
            group: 'draft',
            data: {
              ...(isNewMatch ? {} : previous),
              ...entry.data,
              defenceHeroes,
              attackHeroes,
              enemyDefenceHeroes,
              enemyAttackHeroes,
              defenceStars,
              attackStars,
              enemyDefenceStars,
              enemyAttackStars,
              lastResult,
              lastPickAction,
              inBattle: isNewMatch ? false : Boolean(previous.inBattle)
            },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }
        if (entry.key === 'legendDraftAction') {
          const draft = next.legendDraftStatus ? { ...next.legendDraftStatus.data } : { active: true };
          if (entry.data.error) {
            draft.lastError = entry.data.error;
            draft.lastErrorCode = entry.data.errorCode;
            draft.lastErrorAction = entry.data.action;
            draft.lastErrorTime = entry.updatedAt;
            next.legendDraftStatus = {
              ...next.legendDraftStatus,
              data: draft,
              updatedAt: entry.updatedAt
            };
            changed = true;
            continue;
          }
          delete draft.lastError;
          delete draft.lastErrorCode;
          delete draft.lastErrorAction;
          delete draft.lastErrorTime;
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
            draft.attackStars = entry.data.attackStars;
            draft.enemyDefenceStars = entry.data.enemyDefenceStars;
          } else if (entry.data.action === 'result') {
            draft.active = false;
            draft.inBattle = false;
            draft.stageId = 0;
            draft.lastResult = entry.data;
            if (entry.data.attackHeroes?.length && !draft.attackHeroes?.length) draft.attackHeroes = entry.data.attackHeroes;
            if (entry.data.defenceHeroes?.length && !draft.defenceHeroes?.length) draft.defenceHeroes = entry.data.defenceHeroes;
            if (entry.data.enemyDefenceHeroes?.length) draft.enemyDefenceHeroes = entry.data.enemyDefenceHeroes;
            if (entry.data.enemyAttackHeroes?.length) draft.enemyAttackHeroes = entry.data.enemyAttackHeroes;
            draft.attackStars = entry.data.attackStars;
            draft.defenceStars = entry.data.defenceStars;
            draft.enemyDefenceStars = entry.data.enemyDefenceStars;
            draft.enemyAttackStars = entry.data.enemyAttackStars;
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
        if (entry.key === 'skinUpgradeAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token]) continue;
          const heroId = String(entry.data.heroId);
          const skinId = String(entry.data.skinId);
          const heroSnap = next.heroGetAll?.data?.[heroId];
          const level = Number(heroSnap?.skins?.[skinId]);
          if (Number.isInteger(level) && next.heroGetAll.updatedAt <= entry.updatedAt) {
            next.heroGetAll = { ...next.heroGetAll, updatedAt: entry.updatedAt,
              data: { ...next.heroGetAll.data,
                [heroId]: { ...heroSnap, skins: { ...heroSnap.skins,
                  [skinId]: level + 1 } } } };
          }
          const history = { ...seen, [entry.data.token]: entry.updatedAt };
          const tokens = Object.keys(history).sort((a, b) =>
            history[b].localeCompare(history[a]));
          for (const token of tokens.slice(500)) delete history[token];
          next.resourceActionHistory = { key: 'resourceActionHistory',
            method: entry.method, feature: null, group: 'internal',
            data: history, updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'heroEvolveAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token] || !entry.data.heroId) continue;
          const heroId = String(entry.data.heroId);
          const heroSnap = next.heroGetAll?.data?.[heroId];
          if (heroSnap) {
            const currentStar = Number(heroSnap.star) || 1;
            const nextStar = Math.min(6, currentStar + 1);
            const evolveCost = { 2: 20, 3: 50, 4: 100, 5: 150, 6: 300 }[nextStar] || 0;

            next.heroGetAll = {
              ...next.heroGetAll,
              data: {
                ...next.heroGetAll.data,
                [heroId]: {
                  ...heroSnap,
                  star: nextStar
                }
              }
            };

            if (next.inventoryGet?.data?.fragmentHero) {
              const frags = { ...next.inventoryGet.data.fragmentHero };
              const currentFrags = frags[heroId] ?? 0;
              frags[heroId] = Math.max(0, currentFrags - evolveCost);
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  fragmentHero: frags
                }
              };
            }

            const fragResKey = `resource:fragmentHero:${heroId}`;
            if (next[fragResKey]?.data) {
              const curAmt = next[fragResKey].data.amount ?? 0;
              next[fragResKey] = {
                ...next[fragResKey],
                data: {
                  ...next[fragResKey].data,
                  amount: Math.max(0, curAmt - evolveCost)
                },
                updatedAt: entry.updatedAt
              };
            }

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
          continue;
        }
        if (entry.key === 'titanEvolveAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token] || !entry.data.titanId) continue;
          const titanId = String(entry.data.titanId);
          const titanSnap = next.titanGetAll?.data?.[titanId];
          const currentStar = Number(titanSnap?.star) || 1;
          const nextStar = Math.min(6, currentStar + 1);
          const evolveTitanFragmentCost = { 2: 50, 3: 150, 4: 500, 5: 900, 6: 1500 };
          const evolveCost = evolveTitanFragmentCost[nextStar] || 0;
          const starPowerMultipliers = { 2: 1.466, 3: 1.364, 4: 1.333, 5: 1.250, 6: 1.200 };
          const curPower = Number(titanSnap?.power);
          const nextPower = Number.isFinite(curPower) && curPower > 0
            ? Math.round(curPower * (starPowerMultipliers[nextStar] || 1.2))
            : (titanSnap?.power ?? null);

          if (next.titanGetAll?.data) {
            next.titanGetAll = {
              ...next.titanGetAll,
              data: {
                ...next.titanGetAll.data,
                [titanId]: {
                  ...(titanSnap || { id: Number(titanId) }),
                  star: nextStar,
                  ...(nextPower !== null ? { power: nextPower } : {})
                }
              }
            };
          }

          if (next.inventoryGet?.data?.fragmentTitan) {
            const frags = { ...next.inventoryGet.data.fragmentTitan };
            const currentFrags = frags[titanId] ?? 0;
            frags[titanId] = Math.max(0, currentFrags - evolveCost);
            next.inventoryGet = {
              ...next.inventoryGet,
              data: {
                ...next.inventoryGet.data,
                fragmentTitan: frags
              }
            };
          }

          const fragResKey = `resource:fragmentTitan:${titanId}`;
          if (next[fragResKey]?.data) {
            const curAmt = next[fragResKey].data.amount ?? 0;
            next[fragResKey] = {
              ...next[fragResKey],
              data: {
                ...next[fragResKey].data,
                amount: Math.max(0, curAmt - evolveCost)
              },
              updatedAt: entry.updatedAt
            };
          }

          const evolveTitanGoldCost = { 2: 75000, 3: 300000, 4: 750000, 5: 1250000, 6: 2500000 };
          const goldCost = evolveTitanGoldCost[nextStar] || 0;
          if (goldCost > 0) {
            if (next['resource:gold']?.data) {
              next['resource:gold'] = {
                ...next['resource:gold'],
                data: {
                  ...next['resource:gold'].data,
                  amount: Math.max(0, (next['resource:gold'].data.amount ?? 0) - goldCost)
                },
                updatedAt: entry.updatedAt
              };
            }
            if (next.userGetInfo?.data?.gold !== undefined) {
              next.userGetInfo = {
                ...next.userGetInfo,
                data: {
                  ...next.userGetInfo.data,
                  gold: Math.max(0, (next.userGetInfo.data.gold ?? 0) - goldCost)
                }
              };
            }
          }

          if (Array.isArray(entry.data.quests) && next.questGetAll?.data) {
            const updatedQuests = { ...next.questGetAll.data };
            for (const q of entry.data.quests) {
              if (q?.id) updatedQuests[q.id] = { ...(updatedQuests[q.id] || {}), ...q };
            }
            next.questGetAll = { ...next.questGetAll, data: updatedQuests, updatedAt: entry.updatedAt };
          }

          if (entry.data.consumable && typeof entry.data.consumable === 'object') {
            for (const [cId, amt] of Object.entries(entry.data.consumable)) {
              const numAmt = Number(amt);
              if (!Number.isFinite(numAmt)) continue;
              if (next.inventoryGet?.data) {
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    consumable: { ...(next.inventoryGet.data.consumable || {}), [cId]: numAmt }
                  }
                };
              }
              const resKey = `resource:consumable:${cId}`;
              if (next[resKey]?.data) {
                next[resKey] = {
                  ...next[resKey],
                  data: { ...next[resKey].data, amount: numAmt },
                  updatedAt: entry.updatedAt
                };
              }
            }
          }

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
              const nextLevel = (skills[targetKey] || 0) + 1;
              skills[targetKey] = nextLevel;
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

              const goldCost = getSkillUpgradeGoldCost(nextLevel);
              if (goldCost > 0) {
                if (next['resource:gold']?.data) {
                  next['resource:gold'] = {
                    ...next['resource:gold'],
                    data: {
                      ...next['resource:gold'].data,
                      amount: Math.max(0, (next['resource:gold'].data.amount ?? 0) - goldCost)
                    },
                    updatedAt: entry.updatedAt
                  };
                }
                if (next.userGetInfo?.data?.gold !== undefined) {
                  next.userGetInfo = {
                    ...next.userGetInfo,
                    data: {
                      ...next.userGetInfo.data,
                      gold: Math.max(0, (next.userGetInfo.data.gold ?? 0) - goldCost)
                    }
                  };
                }
              }

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
        if (entry.key === 'heroEquipAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token] || !entry.data.heroId || entry.data.slot === undefined) continue;
          const heroId = String(entry.data.heroId);
          const slotIdx = Number(entry.data.slot);
          const heroSnap = next.heroGetAll?.data?.[heroId];

          let equippedItemId = null;
          if (heroSnap) {
            let nextSlots;
            if (Array.isArray(heroSnap.slots)) {
              nextSlots = [...heroSnap.slots];
              while (nextSlots.length <= slotIdx) nextSlots.push(null);
              nextSlots[slotIdx] = 0;
            } else if (heroSnap.slots && typeof heroSnap.slots === 'object') {
              nextSlots = { ...heroSnap.slots, [slotIdx]: 0, [String(slotIdx)]: 0 };
            } else {
              nextSlots = { [slotIdx]: 0, [String(slotIdx)]: 0 };
            }
            next.heroGetAll = {
              ...next.heroGetAll,
              data: {
                ...next.heroGetAll.data,
                [heroId]: {
                  ...heroSnap,
                  slots: nextSlots
                }
              }
            };

            const heroColor = String(heroSnap.color || 1);
            const equipList = globalThis.hwaHelperHeroMetadata?.[heroId]?.equipment?.[heroColor];
            equippedItemId = equipList ? equipList[slotIdx] : null;
          }

          if (equippedItemId) {
            const strItemId = String(equippedItemId);
            if (next.inventoryGet?.data?.gear) {
              const curGear = Number(next.inventoryGet.data.gear[strItemId] ?? next.inventoryGet.data.gear[equippedItemId] ?? 0);
              if (curGear > 0) {
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    gear: {
                      ...next.inventoryGet.data.gear,
                      [strItemId]: Math.max(0, curGear - 1)
                    }
                  }
                };
              }
            }
            const resKey = `resource:gear:${strItemId}`;
            if (next[resKey]?.data) {
              next[resKey] = {
                ...next[resKey],
                data: {
                  ...next[resKey].data,
                  amount: Math.max(0, (next[resKey].data.amount ?? 0) - 1)
                },
                updatedAt: entry.updatedAt
              };
            }
          }

          const history = { ...seen, [entry.data.token]: entry.updatedAt };
          const tokens = Object.keys(history).sort((a, b) => history[b].localeCompare(history[a]));
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
          continue;
        }
        if (entry.key === 'gearCraftAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token] || !entry.data.libId) continue;
          const libId = String(entry.data.libId);
          const amount = Math.max(1, Number(entry.data.amount) || 1);
          const isScrollType = entry.data.args?.type === 'scroll';
          const craftInfo = isScrollType
            ? (globalThis.hwaHelperScrollCraftData?.[libId] || globalThis.hwaHelperGearCraftData?.[libId])
            : (globalThis.hwaHelperGearCraftData?.[libId] || globalThis.hwaHelperScrollCraftData?.[libId]);

          // 1. Add crafted items
          const responseGears = entry.data.result?.gear;
          const responseScrolls = entry.data.result?.scroll;
          if (responseGears && typeof responseGears === 'object') {
            for (const [gId, count] of Object.entries(responseGears)) {
              const numCount = Number(count) || 0;
              if (numCount > 0) {
                if (next.inventoryGet) {
                  const curGear = Number(next.inventoryGet.data?.gear?.[gId] || 0);
                  next.inventoryGet = {
                    ...next.inventoryGet,
                    data: {
                      ...next.inventoryGet.data,
                      gear: { ...(next.inventoryGet.data?.gear || {}), [gId]: curGear + numCount }
                    }
                  };
                }
                const resKey = `resource:gear:${gId}`;
                if (next[resKey]?.data) {
                  next[resKey] = {
                    ...next[resKey],
                    data: {
                      ...next[resKey].data,
                      amount: (next[resKey].data.amount ?? 0) + numCount
                    },
                    updatedAt: entry.updatedAt
                  };
                }
              }
            }
          }
          if (responseScrolls && typeof responseScrolls === 'object') {
            for (const [sId, count] of Object.entries(responseScrolls)) {
              const numCount = Number(count) || 0;
              if (numCount > 0) {
                if (next.inventoryGet) {
                  const curScroll = Number(next.inventoryGet.data?.scroll?.[sId] || 0);
                  next.inventoryGet = {
                    ...next.inventoryGet,
                    data: {
                      ...next.inventoryGet.data,
                      scroll: { ...(next.inventoryGet.data?.scroll || {}), [sId]: curScroll + numCount }
                    }
                  };
                }
                const resKey = `resource:scroll:${sId}`;
                if (next[resKey]?.data) {
                  next[resKey] = {
                    ...next[resKey],
                    data: {
                      ...next[resKey].data,
                      amount: (next[resKey].data.amount ?? 0) + numCount
                    },
                    updatedAt: entry.updatedAt
                  };
                }
              }
            }
          }

          // 2. Deduct fragments or recipe components
          if (entry.data.action === 'inventoryCraftFragments') {
            const fragField = isScrollType ? 'fragmentScroll' : 'fragmentGear';
            const fragCost = (craftInfo?.fragmentCount || 0) * amount;
            if (fragCost > 0) {
              if (next.inventoryGet) {
                const curFrags = Number(next.inventoryGet.data?.[fragField]?.[libId] || 0);
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    [fragField]: { ...(next.inventoryGet.data?.[fragField] || {}), [libId]: Math.max(0, curFrags - fragCost) }
                  }
                };
              }
              const resKey = `resource:${fragField}:${libId}`;
              if (next[resKey]?.data) {
                next[resKey] = {
                  ...next[resKey],
                  data: {
                    ...next[resKey].data,
                    amount: Math.max(0, (next[resKey].data.amount ?? 0) - fragCost)
                  },
                  updatedAt: entry.updatedAt
                };
              }
            }
          } else if (entry.data.action === 'inventoryCraftRecipe' && craftInfo?.recipe) {
            for (const [ingId, ingCount] of Object.entries(craftInfo.recipe)) {
              const ingCost = (Number(ingCount) || 1) * amount;
              if (ingCost > 0) {
                if (next.inventoryGet) {
                  const curIng = Number(next.inventoryGet.data?.gear?.[ingId] || 0);
                  next.inventoryGet = {
                    ...next.inventoryGet,
                    data: {
                      ...next.inventoryGet.data,
                      gear: { ...(next.inventoryGet.data?.gear || {}), [ingId]: Math.max(0, curIng - ingCost) }
                    }
                  };
                }
                const resKey = `resource:gear:${ingId}`;
                if (next[resKey]?.data) {
                  next[resKey] = {
                    ...next[resKey],
                    data: {
                      ...next[resKey].data,
                      amount: Math.max(0, (next[resKey].data.amount ?? 0) - ingCost)
                    },
                    updatedAt: entry.updatedAt
                  };
                }
              }
            }
            if (craftInfo.scroll && typeof craftInfo.scroll === 'object') {
              for (const [sId, sCount] of Object.entries(craftInfo.scroll)) {
                const sCost = (Number(sCount) || 1) * amount;
                if (sCost > 0) {
                  if (next.inventoryGet) {
                    const curScroll = Number(next.inventoryGet.data?.scroll?.[sId] || 0);
                    next.inventoryGet = {
                      ...next.inventoryGet,
                      data: {
                        ...next.inventoryGet.data,
                        scroll: { ...(next.inventoryGet.data?.scroll || {}), [sId]: Math.max(0, curScroll - sCost) }
                      }
                    };
                  }
                  const resKey = `resource:scroll:${sId}`;
                  if (next[resKey]?.data) {
                    next[resKey] = {
                      ...next[resKey],
                      data: {
                        ...next[resKey].data,
                        amount: Math.max(0, (next[resKey].data.amount ?? 0) - sCost)
                      },
                      updatedAt: entry.updatedAt
                    };
                  }
                }
              }
            }
          }

          // 3. Deduct gold
          const goldCost = (Number(craftInfo?.gold) || 0) * amount;
          if (goldCost > 0) {
            if (next['resource:gold']?.data) {
              next['resource:gold'] = {
                ...next['resource:gold'],
                data: {
                  ...next['resource:gold'].data,
                  amount: Math.max(0, (next['resource:gold'].data.amount ?? 0) - goldCost)
                },
                updatedAt: entry.updatedAt
              };
            }
            if (next.userGetInfo?.data?.gold !== undefined) {
              next.userGetInfo = {
                ...next.userGetInfo,
                data: {
                  ...next.userGetInfo.data,
                  gold: Math.max(0, (next.userGetInfo.data.gold ?? 0) - goldCost)
                }
              };
            }
          }

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
          continue;
        }
        if (entry.key === 'dungeonRewardAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token] || !entry.data.reward) continue;
          const reward = entry.data.reward;
          
          if (reward.consumable) {
            for (const [id, amt] of Object.entries(reward.consumable)) {
              const numAmt = Number(amt) || 0;
              if (next.inventoryGet) {
                const cur = next.inventoryGet.data?.consumable?.[id] ?? 0;
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    consumable: { ...(next.inventoryGet.data?.consumable || {}), [id]: cur + numAmt }
                  }
                };
              }
              const resKey = `resource:consumable:${id}`;
              next[resKey] = {
                key: resKey,
                method: entry.method,
                feature: null,
                group: 'resources',
                data: {
                  ...(next[resKey]?.data || {}),
                  amount: (next[resKey]?.data?.amount ?? 0) + numAmt,
                  label: next[resKey]?.data?.label || (id === '20' ? 'Titan potion' : `Consumable #${id}`)
                },
                updatedAt: entry.updatedAt
              };
            }
          }

          if (reward.fragmentTitan) {
            for (const [id, amt] of Object.entries(reward.fragmentTitan)) {
              const numAmt = Number(amt) || 0;
              if (next.inventoryGet) {
                const cur = next.inventoryGet.data?.fragmentTitan?.[id] ?? 0;
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    fragmentTitan: { ...(next.inventoryGet.data?.fragmentTitan || {}), [id]: cur + numAmt }
                  }
                };
              }
              const resKey = `resource:fragmentTitan:${id}`;
              next[resKey] = {
                key: resKey,
                method: entry.method,
                feature: null,
                group: 'resources',
                data: {
                  ...(next[resKey]?.data || {}),
                  amount: (next[resKey]?.data?.amount ?? 0) + numAmt,
                  label: next[resKey]?.data?.label || `Titan Soul #${id}`
                },
                updatedAt: entry.updatedAt
              };
            }
          }

          if (reward.gold) {
            const numAmt = Number(reward.gold) || 0;
            const resKey = 'resource:gold';
            next[resKey] = {
              key: resKey,
              method: entry.method,
              feature: null,
              group: 'resources',
              data: {
                ...(next[resKey]?.data || {}),
                amount: (next[resKey]?.data?.amount ?? 0) + numAmt,
                label: next[resKey]?.data?.label || 'Gold'
              },
              updatedAt: entry.updatedAt
            };
          }

          if (reward.coin) {
            for (const [id, amt] of Object.entries(reward.coin)) {
              const numAmt = Number(amt) || 0;
              if (next.inventoryGet) {
                const cur = next.inventoryGet.data?.coin?.[id] ?? 0;
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    coin: { ...(next.inventoryGet.data?.coin || {}), [id]: cur + numAmt }
                  }
                };
              }
              const resKey = `resource:coin:${id}`;
              next[resKey] = {
                key: resKey,
                method: entry.method,
                feature: null,
                group: 'resources',
                data: {
                  ...(next[resKey]?.data || {}),
                  amount: (next[resKey]?.data?.amount ?? 0) + numAmt,
                  label: next[resKey]?.data?.label || `Coin #${id}`
                },
                updatedAt: entry.updatedAt
              };
            }
          }

          const history = { ...seen, [entry.data.token]: entry.updatedAt };
          const tokens = Object.keys(history).sort((a, b) => history[b].localeCompare(history[a]));
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
          continue;
        }

        if (entry.key === 'chestOpenAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token]) continue;
          const { boxType, boxId, amount, rewards } = entry.data;

          if (boxType === 'lootboxChanced') {
            if (next.inventoryGet?.data?.lootboxChanced) {
              const cur = Number(next.inventoryGet.data.lootboxChanced[boxId]) || 0;
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  lootboxChanced: {
                    ...next.inventoryGet.data.lootboxChanced,
                    [boxId]: Math.max(0, cur - amount)
                  }
                }
              };
            }
            const resKey = `resource:lootboxChanced:${boxId}`;
            if (next[resKey]?.data) {
              next[resKey] = {
                ...next[resKey],
                data: {
                  ...next[resKey.data || {}],
                  amount: Math.max(0, (next[resKey].data.amount ?? 0) - amount)
                },
                updatedAt: entry.updatedAt
              };
            }
          } else if (boxType === 'consumable') {
            if (next.inventoryGet?.data?.consumable) {
              const cur = Number(next.inventoryGet.data.consumable[boxId]) || 0;
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  consumable: {
                    ...next.inventoryGet.data.consumable,
                    [boxId]: Math.max(0, cur - amount)
                  }
                }
              };
            }
            const resKey = `resource:consumable:${boxId}`;
            if (next[resKey]?.data) {
              next[resKey] = {
                ...next[resKey],
                data: {
                  ...next[resKey.data || {}],
                  amount: Math.max(0, (next[resKey].data.amount ?? 0) - amount)
                },
                updatedAt: entry.updatedAt
              };
            }
          }

          if (Array.isArray(rewards)) {
            for (const r of rewards) {
              const rewardAmt = Number(r.amount) || 0;
              if (rewardAmt <= 0) continue;
              const rType = r.type;
              const rId = String(r.id);

              if (next.inventoryGet?.data) {
                const group = next.inventoryGet.data[rType] || {};
                const cur = Number(group[rId]) || 0;
                next.inventoryGet = {
                  ...next.inventoryGet,
                  data: {
                    ...next.inventoryGet.data,
                    [rType]: {
                      ...group,
                      [rId]: cur + rewardAmt
                    }
                  }
                };
              }

              if (rType === 'gold') {
                const resKey = 'resource:gold';
                next[resKey] = {
                  key: resKey,
                  method: entry.method,
                  feature: null,
                  group: 'resources',
                  data: {
                    ...(next[resKey]?.data || {}),
                    amount: (next[resKey]?.data?.amount ?? 0) + rewardAmt,
                    label: 'Gold'
                  },
                  updatedAt: entry.updatedAt
                };
              } else if (rType === 'fragmentHero') {
                const resKey = `resource:fragmentHero:${rId}`;
                if (next[resKey]?.data) {
                  next[resKey] = {
                    ...next[resKey],
                    data: {
                      ...next[resKey].data,
                      amount: (next[resKey].data.amount ?? 0) + rewardAmt
                    },
                    updatedAt: entry.updatedAt
                  };
                }
              } else if (rType === 'fragmentTitan') {
                const resKey = `resource:fragmentTitan:${rId}`;
                if (next[resKey]?.data) {
                  next[resKey] = {
                    ...next[resKey],
                    data: {
                      ...next[resKey].data,
                      amount: (next[resKey].data.amount ?? 0) + rewardAmt
                    },
                    updatedAt: entry.updatedAt
                  };
                }
              } else if (resourceTypes.has(rType)) {
                const resKey = `resource:${rType}:${rId}`;
                const label = next[resKey]?.data?.label || resolveResourceLabel(`${rType}:${rId}`);
                next[resKey] = {
                  key: resKey,
                  method: entry.method,
                  feature: null,
                  group: 'resources',
                  data: {
                    ...(next[resKey]?.data || {}),
                    amount: (next[resKey]?.data?.amount ?? 0) + rewardAmt,
                    label
                  },
                  updatedAt: entry.updatedAt
                };
              }
            }
          }

          const history = { ...seen, [entry.data.token]: entry.updatedAt };
          const tokens = Object.keys(history).sort((a, b) => history[b].localeCompare(history[a]));
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
          continue;
        }

        if (entry.key === 'inventoryUseAction') {
          const seen = next.resourceActionHistory?.data || {};
          if (seen[entry.data.token]) continue;
          const { libId, amount, unitId } = entry.data;

          if (libId === 20 && amount > 0) {
            if (next.inventoryGet?.data?.consumable) {
              const cur = next.inventoryGet.data.consumable['20'] ?? 0;
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  consumable: { ...next.inventoryGet.data.consumable, '20': Math.max(0, cur - amount) }
                }
              };
            }
            const resKey = 'resource:consumable:20';
            if (next[resKey]?.data) {
              next[resKey] = {
                ...next[resKey],
                data: { ...next[resKey].data, amount: Math.max(0, (next[resKey].data.amount ?? 0) - amount) },
                updatedAt: entry.updatedAt
              };
            }

            if (unitId && next.titanGetAll?.data?.[unitId]) {
              const titan = next.titanGetAll.data[unitId];
              const curXp = Number(titan.xp) || 0;
              next.titanGetAll = {
                ...next.titanGetAll,
                data: {
                  ...next.titanGetAll.data,
                  [unitId]: {
                    ...titan,
                    xp: curXp + amount
                  }
                }
              };
            }
          }

          const history = { ...seen, [entry.data.token]: entry.updatedAt };
          const tokens = Object.keys(history).sort((a, b) => history[b].localeCompare(history[a]));
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
          continue;
        }

        if (entry.key === 'dungeonStatus') {
          const previous = next.dungeonStatus?.data || {};
          const isNewDay = next.dungeonStatus?.updatedAt && entry.updatedAt &&
            new Date(next.dungeonStatus.updatedAt).toDateString() !== new Date(entry.updatedAt).toDateString();
          const isGetInfo = entry.method === 'dungeonGetInfo';

          let mergedTitans;
          if (isNewDay) {
            // Daily rest reset: clear fallen titan states and restore fresh HP/energy
            mergedTitans = entry.data.states?.titans ? { ...entry.data.states.titans } : {};
          } else if (isGetInfo && entry.data.states?.titans !== undefined) {
            // Full snapshot from dungeonGetInfo
            mergedTitans = { ...entry.data.states.titans };
          } else {
            // Battle progress update: merge titan state deltas
            mergedTitans = {
              ...(previous.states?.titans || {}),
              ...(entry.data.states?.titans || {})
            };
          }

          // Daily combat log tracking
          const todayDate = entry.updatedAt ? new Date(entry.updatedAt).toDateString() : new Date().toDateString();
          let dailyCombatLog;
          if (isNewDay || !previous.dailyCombatLog || previous.dailyCombatLog.date !== todayDate) {
            dailyCombatLog = {
              date: todayDate,
              todayTitanite: entry.data.todayTitanite ?? 0,
              flawlessCount: 0,
              totalBattles: 0,
              casualtyBattles: []
            };
          } else {
            dailyCombatLog = {
              ...previous.dailyCombatLog,
              todayTitanite: entry.data.todayTitanite ?? previous.dailyCombatLog.todayTitanite ?? 0,
              casualtyBattles: [...normalizeArrayData(previous.dailyCombatLog.casualtyBattles)]
            };
          }

          if (entry.method === 'dungeonEndBattle' && entry.data.lastBattleResult) {
            const res = entry.data.lastBattleResult;
            dailyCombatLog.totalBattles = (dailyCombatLog.totalBattles || 0) + 1;
            if (entry.data.todayTitanite != null) {
              dailyCombatLog.todayTitanite = entry.data.todayTitanite;
            } else if (res.reward?.dungeonActivity != null) {
              dailyCombatLog.todayTitanite = (dailyCombatLog.todayTitanite || 0) + Number(res.reward.dungeonActivity);
            }
            const casualties = normalizeArrayData(res.casualties);
            if (casualties.length === 0 && res.win) {
              dailyCombatLog.flawlessCount = (dailyCombatLog.flawlessCount || 0) + 1;
            } else {
              // Battle with titan casualties or defeat: record detailed entry
              const floor = entry.data.floorNumber || previous.floorNumber || null;
              dailyCombatLog.casualtyBattles.unshift({
                floorNumber: floor,
                timestamp: entry.updatedAt,
                win: res.win,
                stars: res.stars,
                casualties,
                deployed: normalizeArrayData(res.deployed)
              });
              if (dailyCombatLog.casualtyBattles.length > 50) {
                dailyCombatLog.casualtyBattles = dailyCombatLog.casualtyBattles.slice(0, 50);
              }
            }
          }

          next.dungeonStatus = {
            key: 'dungeonStatus',
            method: entry.method,
            feature: entry.feature,
            group: 'events',
            data: {
              ...previous,
              ...entry.data,
              todayTitanite: dailyCombatLog.todayTitanite,
              dailyCombatLog,
              states: {
                ...previous.states,
                ...entry.data.states,
                titans: mergedTitans
              }
            },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }

        if (entry.key === 'guildChat') {
          const existing = next.guildChat?.data || { messages: [], users: {} };
          const incomingMessages = Array.isArray(entry.data?.messages)
            ? entry.data.messages
            : (entry.data?.messages && typeof entry.data.messages === 'object' ? Object.values(entry.data.messages) : []);
          const incomingUsers = entry.data?.users && typeof entry.data.users === 'object' ? entry.data.users : {};
          const existingUsers = existing.users && typeof existing.users === 'object' ? existing.users : {};
          const mergedUsers = { ...existingUsers, ...incomingUsers };
          const msgMap = new Map();
          const existingMessages = Array.isArray(existing.messages)
            ? existing.messages
            : (existing.messages && typeof existing.messages === 'object' ? Object.values(existing.messages) : []);
          for (const m of existingMessages) {
            if (m?.id) msgMap.set(String(m.id), m);
          }
          for (const m of incomingMessages) {
            if (m?.id) msgMap.set(String(m.id), m);
          }
          const sorted = Array.from(msgMap.values()).sort((a, b) => Number(b.ctime || 0) - Number(a.ctime || 0));
          const recordTimeSec = Math.floor((Date.parse(entry.updatedAt) || Date.now()) / 1000);
          const cutoffSec = recordTimeSec - (3 * 24 * 60 * 60); // Auto clear messages older than 3 days
          const mergedMessages = sorted.filter((m) => !m.ctime || Number(m.ctime) >= cutoffSec);
          const activeUserIds = new Set(mergedMessages.map((m) => String(m.userId)));
          const prunedUsers = Object.fromEntries(
            Object.entries(mergedUsers).filter(([uid]) => activeUserIds.has(String(uid)))
          );
          const latestTime = entry.updatedAt > (next.guildChat?.updatedAt || '') ? entry.updatedAt : (next.guildChat?.updatedAt || entry.updatedAt);
          next.guildChat = {
            key: 'guildChat',
            method: entry.method,
            feature: entry.feature,
            group: entry.group,
            data: {
              messages: mergedMessages,
              users: Object.keys(prunedUsers).length > 0 ? prunedUsers : mergedUsers
            },
            updatedAt: latestTime
          };
          changed = true;
          continue;
        }
        if (entry.key === 'specialQuestStatus') {
          if (next.specialQuestStatus?.updatedAt > entry.updatedAt) continue;
          const accountId = next.accountStatus?.data?.id;
          if (accountId != null && entry.data?.accountId != null &&
              String(accountId) !== String(entry.data.accountId)) continue;
          const existing = normalizeArrayData(next.specialQuestStatus?.data?.events);
          const incoming = normalizeArrayData(entry.data?.events);
          const fullSnapshot = ['specialQuestEvents', 'getSpecialQuestState'].includes(entry.method);
          const evMap = new Map();
          const recordTime = Date.parse(entry.updatedAt) || Date.now();
          for (const ev of fullSnapshot ? [] : existing) {
            if (ev?.id && (!Number.isFinite(ev.end) || ev.end >= recordTime - 1800000)) {
              evMap.set(ev.id, ev);
            }
          }
          for (const ev of incoming) {
            if (ev?.id && (!Number.isFinite(ev.end) || ev.end >= recordTime - 1800000)) {
              evMap.set(ev.id, ev);
            }
          }
          next.specialQuestStatus = {
            key: 'specialQuestStatus',
            method: entry.method,
            feature: entry.feature,
            group: 'events',
            data: { events: Array.from(evMap.values()) },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }
        if (entry.key === 'towerAction') {
          const action = entry.data;
          const previous = next.towerSession?.data || {};
          if (previous.updatedAt > entry.updatedAt || previous.tokens?.includes(action.token)) continue;
          const fresh = (action.action === 'enterNextFloor' && action.floorNumber === 1) ||
            (previous.completed && action.action === 'enterRoom' && action.number === 1);
          const session = fresh ? { floorNumber: 1, roomNumber: 0, rooms: {}, history: [], tokens: [], completed: false, team: [] } : {
            floorNumber: previous.floorNumber || 1,
            roomNumber: previous.roomNumber || 0,
            rooms: previous.rooms || {},
            history: [...normalizeArrayData(previous.history)],
            tokens: [...normalizeArrayData(previous.tokens)],
            completed: Boolean(previous.completed),
            completion: previous.completion || null,
            team: previous.team || []
          };
          const floor = session.floorNumber;
          const room = session.rooms?.[session.roomNumber];
          const event = { action: action.action, floor, room: session.roomNumber, at: entry.updatedAt };
          if (action.action === 'enterNextFloor') {
            if (action.floorNumber) session.floorNumber = action.floorNumber;
            session.roomNumber = action.roomNumber || 0;
            session.rooms = action.rooms || {};
            session.completed = false;
          } else if (action.action === 'enterRoom') {
            session.roomNumber = action.roomNumber || action.number || session.roomNumber;
          } else if (action.action === 'startBattle') {
            session.team = action.heroes || [];
          } else if (action.action === 'endBattle') {
            event.room = session.roomNumber;
            event.win = action.win;
            event.stars = action.stars;
            event.reward = action.reward;
            event.enemyIds = room?.defenders?.units?.map((unit) => unit.id) || [];
            event.team = session.team;
            session.history.push(event);
            session.roomNumber = action.roomNumber ?? session.roomNumber;
            if (action.completion || action.briefInfo?.state === 'win') {
              session.completed = true;
              session.completion = action.completion;
              next.towerStatus = {
                key: 'towerStatus', method: entry.method, feature: null, group: 'other',
                data: { state: 'win', isCleared: true, floorNumber: floor,
                  deadHeroesCount: action.briefInfo?.deadHeroesCount ?? 0 },
                updatedAt: entry.updatedAt
              };
            }
          } else if (action.action === 'activateBuff') {
            event.buffId = action.buffId;
            event.options = Array.isArray(room?.buffs) ? room.buffs : [];
            session.history.push(event);
          } else if (action.action === 'openChest') {
            event.number = action.number;
            event.reward = action.reward;
            event.rewardIndex = action.rewardIndex;
            event.options = room?.openCosts || {};
            event.possibleRewards = room?.rewards?.map((item) => item.reward) || [];
            session.history.push(event);
          }
          session.history = session.history.slice(-100);
          session.tokens = [...session.tokens, action.token].slice(-150);
          session.updatedAt = entry.updatedAt;
          if (fresh) next.towerStatus = {
            key: 'towerStatus', method: entry.method, feature: null, group: 'other',
            data: { state: 'inProgress', isCleared: false, floorNumber: session.floorNumber },
            updatedAt: entry.updatedAt
          };
          next.towerSession = { key: 'towerSession', method: entry.method, feature: null,
            group: 'other', data: session, updatedAt: entry.updatedAt };
          changed = true;
          continue;
        }
        if (entry.key === 'towerStatus') {
          if (next.towerStatus?.updatedAt > entry.updatedAt) continue;
          const incomingFloor = entry.data?.floorData;
          if (incomingFloor) {
            const previous = next.towerSession?.data || {};
            const floorNumber = Number(incomingFloor.floorNumber) || previous.floorNumber || 0;
            const fresh = previous.completed && !entry.data.isCleared;
            const session = fresh ? { history: [], tokens: [] } : previous;
            next.towerSession = {
              key: 'towerSession', method: entry.method, feature: null, group: 'other',
              data: { ...session, floorNumber,
                roomNumber: Number(incomingFloor.currentRoomNumber) || 0,
                rooms: incomingFloor.rooms || {}, completed: Boolean(entry.data.isCleared),
                updatedAt: entry.updatedAt }, updatedAt: entry.updatedAt
            };
          } else if (entry.data?.isCleared && next.towerSession) {
            next.towerSession = { ...next.towerSession,
              data: { ...next.towerSession.data, completed: true }, updatedAt: entry.updatedAt };
          }
          const existing = next.towerStatus?.data || {};
          const incoming = entry.data || {};
          next.towerStatus = {
            ...entry,
            data: {
              ...existing,
              ...incoming,
              isCleared: Boolean(incoming.isCleared || incoming.state === 'win')
            }
          };
          changed = true;
          continue;
        }
        if (entry.key === 'mailStatus') {
          if (next.mailStatus && next.mailStatus.updatedAt === entry.updatedAt) continue;
          const existing = next.mailStatus?.data || {};
          const existingReports = normalizeArrayData(existing.reports);
          const existingLetters = normalizeArrayData(existing.letters);
          if (entry.data?.action === 'claimAll') {
            const isReportOnly = entry.feature === 'report';
            const unclaimedReportsCount = 0;
            const unclaimedLettersCount = isReportOnly ? (existing.unclaimedLettersCount || 0) : 0;
            const totalUnclaimed = unclaimedReportsCount + unclaimedLettersCount;
            next.mailStatus = {
              ...entry,
              data: {
                ...existing,
                unclaimedReportsCount,
                unclaimedLettersCount,
                totalUnclaimed,
                hasUnclaimed: totalUnclaimed > 0,
                reports: existingReports.map((r) => ({ ...r, claimedReward: true })),
                letters: isReportOnly ? existingLetters : existingLetters.map((l) => ({ ...l, claimed: true }))
              }
            };
          } else if (entry.data?.action === 'claimMail') {
            const claimedIds = new Set(normalizeArrayData(entry.data.letterIds).map(String));
            const updatedLetters = existingLetters.map((l) => {
              if (claimedIds.has(String(l.id)) || claimedIds.has(String(l.letterId))) {
                return { ...l, claimed: true, rewardReceived: true, rewardClaimed: true };
              }
              return l;
            });
            const remainingLetters = updatedLetters.filter((l) =>
              l && !l.deleted && (l.reward || l.q_reward || l.items) &&
              !l.claimed && !l.rewardReceived && !l.rewardClaimed
            );
            const unclaimedLettersCount = remainingLetters.length;
            const unclaimedReportsCount = existing.unclaimedReportsCount || 0;
            const totalUnclaimed = unclaimedReportsCount + unclaimedLettersCount;
            next.mailStatus = {
              ...entry,
              data: {
                ...existing,
                letters: updatedLetters,
                unclaimedLettersCount,
                unclaimedReportsCount,
                totalUnclaimed,
                hasUnclaimed: totalUnclaimed > 0
              }
            };
          } else if (entry.data?.action === 'claimReport') {
            const reportId = String(entry.data.reportId);
            const updatedReports = existingReports.map((r) => {
              if (String(r.id) === reportId) {
                return { ...r, claimedReward: true };
              }
              return r;
            });
            const remainingReports = updatedReports.filter((r) => r && r.claimedReward === false);
            const unclaimedReportsCount = remainingReports.length;
            const unclaimedLettersCount = existing.unclaimedLettersCount || 0;
            const totalUnclaimed = unclaimedReportsCount + unclaimedLettersCount;
            next.mailStatus = {
              ...entry,
              data: {
                ...existing,
                reports: updatedReports,
                unclaimedReportsCount,
                unclaimedLettersCount,
                totalUnclaimed,
                hasUnclaimed: totalUnclaimed > 0
              }
            };
          } else {
            let reports = existingReports;
            let unclaimedReportsCount = existing.unclaimedReportsCount || 0;
            const incomingReports = normalizeArrayData(entry.data?.reports);
            if (incomingReports.length > 0 || Array.isArray(entry.data?.reports)) {
              const repMap = new Map(reports.map((r) => [String(r.id), r]));
              for (const rep of incomingReports) {
                const prev = repMap.get(String(rep.id));
                repMap.set(String(rep.id), prev ? { ...prev, ...rep } : rep);
              }
              reports = Array.from(repMap.values());
              unclaimedReportsCount = reports.filter((r) => r && r.claimedReward === false).length;
            } else if (entry.data?.unclaimedReportsCount !== undefined) {
              unclaimedReportsCount = entry.data.unclaimedReportsCount;
            }

            let letters = existingLetters;
            let unclaimedLettersCount = existing.unclaimedLettersCount || 0;
            const incomingLetters = normalizeArrayData(entry.data?.letters);
            if (incomingLetters.length > 0 || Array.isArray(entry.data?.letters)) {
              const letterMap = new Map(letters.map((l) => [String(l.id || l.letterId), l]));
              for (const l of incomingLetters) {
                const lId = String(l.id || l.letterId);
                const prev = letterMap.get(lId);
                letterMap.set(lId, prev ? { ...prev, ...l } : l);
              }
              letters = Array.from(letterMap.values());
              unclaimedLettersCount = letters.filter((l) =>
                l && !l.deleted && (l.reward || l.q_reward || l.items) &&
                !l.claimed && !l.rewardReceived && !l.rewardClaimed
              ).length;
            } else if (entry.data?.unclaimedLettersCount !== undefined) {
              unclaimedLettersCount = entry.data.unclaimedLettersCount;
            }

            const totalUnclaimed = unclaimedReportsCount + unclaimedLettersCount;
            next.mailStatus = {
              ...entry,
              data: {
                ...existing,
                ...entry.data,
                reports,
                letters,
                unclaimedReportsCount,
                unclaimedLettersCount,
                totalUnclaimed,
                hasUnclaimed: totalUnclaimed > 0
              }
            };
          }
          changed = true;
          continue;
        }

        if (entry.key === 'completeTrainingAction') {
          const unitId = entry.data.unitId;
          let trainedCount = 0;
          for (const trainKey of ['getTrainings:unit', 'getTrainings']) {
            if (next[trainKey]?.data?.trainingQueues) {
              const queues = [...next[trainKey].data.trainingQueues];
              const idx = queues.findIndex((q) => Number(q.unitId) === unitId);
              if (idx >= 0) {
                trainedCount = Number(queues[idx].unitCount) || 0;
                queues.splice(idx, 1);
                next[trainKey] = {
                  ...next[trainKey],
                  data: { ...next[trainKey].data, trainingQueues: queues },
                  updatedAt: entry.updatedAt
                };
                changed = true;
              }
            }
          }
          for (const sumKey of ['getUnitSummary:unit', 'getUnitSummary']) {
            if (next[sumKey]?.data?.available) {
              const available = next[sumKey].data.available.map((item) => ({ ...item }));
              const idx = available.findIndex((item) => Number(item.unitId) === unitId);
              if (idx >= 0) {
                available[idx].count = (Number(available[idx].count) || 0) + trainedCount;
              } else if (trainedCount > 0) {
                available.push({ unitId, count: trainedCount });
              }
              next[sumKey] = {
                ...next[sumKey],
                data: { ...next[sumKey].data, available },
                updatedAt: entry.updatedAt
              };
              changed = true;
            }
          }
          continue;
        }

        if (entry.key === 'startTrainingAction') {
          const { unitId, count, startDate, duration } = entry.data;
          const trainKey = next['getTrainings:unit'] ? 'getTrainings:unit' : 'getTrainings';
          const prevData = next[trainKey]?.data || { trainingQueues: [], upgradeQueues: [] };
          const queues = [...normalizeArrayData(prevData.trainingQueues)];
          const idx = queues.findIndex((q) => Number(q.unitId) === unitId);
          const queueItem = { unitId, unitCount: count, startDate, duration };
          if (idx >= 0) {
            queues[idx] = queueItem;
          } else {
            queues.push(queueItem);
          }
          next[trainKey] = {
            ...(next[trainKey] || { key: trainKey, method: 'getTrainings', feature: 'unit', group: 'teams' }),
            data: { ...prevData, trainingQueues: queues },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }

        if (entry.key === 'startHealingAction') {
          const { startDate, duration, units } = entry.data;
          const healKey = next['getHealing:unit'] ? 'getHealing:unit' : 'getHealing';
          const prevData = next[healKey]?.data || { injuredUnits: [], healing: null };
          next[healKey] = {
            ...(next[healKey] || { key: healKey, method: 'getHealing', feature: 'unit', group: 'teams' }),
            data: {
              ...prevData,
              healing: { startDate, duration, units }
            },
            updatedAt: entry.updatedAt
          };
          changed = true;
          continue;
        }

        if (entry.key.startsWith('experimental') && next[entry.key]?.updatedAt === entry.updatedAt &&
            JSON.stringify(next[entry.key].data) === JSON.stringify(entry.data)) continue;
        if (entry.key === 'lastCampaignRaidResult') {
          const prev = next.lastCampaignRaidResult;
          if (prev && prev.updatedAt >= entry.updatedAt) continue;

          if (entry.data?.failed) {
            next.lastCampaignRaidResult = entry;
            changed = true;
            continue;
          }

          if (next.missionGetAll?.data && entry.data?.missionId) {
            const mId = Number(entry.data.missionId);
            const times = Number(entry.data.times) || 1;
            if (Array.isArray(next.missionGetAll.data)) {
              const item = next.missionGetAll.data.find((m) => Number(m?.id) === mId);
              if (item) {
                item.triesSpent = (Number(item.triesSpent) || 0) + times;
              }
            } else if (typeof next.missionGetAll.data === 'object') {
              const item = next.missionGetAll.data[String(mId)] || next.missionGetAll.data[mId];
              if (item) {
                item.triesSpent = (Number(item.triesSpent) || 0) + times;
              }
            }
          }

          // Merge newly dropped items directly into inventoryGet ONLY if inventoryGet was not updated in this same response
          const currentDrops = entry.data?.currentDrops || entry.data?.drops;
          if (next.inventoryGet?.data && currentDrops && next.inventoryGet.updatedAt !== entry.updatedAt) {
            const inv = { ...next.inventoryGet.data };
            if (currentDrops.fragmentGear) {
              inv.fragmentGear = { ...(inv.fragmentGear || {}) };
              for (const [id, count] of Object.entries(currentDrops.fragmentGear)) {
                inv.fragmentGear[id] = (Number(inv.fragmentGear[id]) || 0) + Number(count);
              }
            }
            if (currentDrops.fragmentScroll) {
              inv.fragmentScroll = { ...(inv.fragmentScroll || {}) };
              for (const [id, count] of Object.entries(currentDrops.fragmentScroll)) {
                inv.fragmentScroll[id] = (Number(inv.fragmentScroll[id]) || 0) + Number(count);
              }
            }
            if (currentDrops.gear) {
              inv.gear = { ...(inv.gear || {}) };
              for (const [id, count] of Object.entries(currentDrops.gear)) {
                inv.gear[id] = (Number(inv.gear[id]) || 0) + Number(count);
              }
            }
            if (currentDrops.scroll) {
              inv.scroll = { ...(inv.scroll || {}) };
              for (const [id, count] of Object.entries(currentDrops.scroll)) {
                inv.scroll[id] = (Number(inv.scroll[id]) || 0) + Number(count);
              }
            }
            if (currentDrops.consumable) {
              inv.consumable = { ...(inv.consumable || {}) };
              for (const [id, count] of Object.entries(currentDrops.consumable)) {
                inv.consumable[id] = (Number(inv.consumable[id]) || 0) + Number(count);
              }
            }
            next.inventoryGet = {
              ...next.inventoryGet,
              data: inv,
              updatedAt: entry.updatedAt || new Date().toISOString()
            };
          }

          const prevTime = prev?.updatedAt ? Date.parse(prev.updatedAt) : 0;
          const currTime = entry.updatedAt ? Date.parse(entry.updatedAt) : 0;
          if (prev && !prev.data?.failed && prev.data?.missionId === entry.data?.missionId && currTime - prevTime < 15000 && currTime > prevTime) {
            const combinedDrops = {
              fragmentGear: { ...(prev.data?.drops?.fragmentGear || {}) },
              fragmentScroll: { ...(prev.data?.drops?.fragmentScroll || {}) },
              gear: { ...(prev.data?.drops?.gear || {}) },
              scroll: { ...(prev.data?.drops?.scroll || {}) },
              consumable: { ...(prev.data?.drops?.consumable || {}) },
              gold: (prev.data?.drops?.gold || 0) + (entry.data?.drops?.gold || 0),
              experience: (prev.data?.drops?.experience || 0) + (entry.data?.drops?.experience || 0)
            };
            if (entry.data?.drops?.fragmentGear) {
              for (const [k, v] of Object.entries(entry.data.drops.fragmentGear)) {
                combinedDrops.fragmentGear[k] = (combinedDrops.fragmentGear[k] || 0) + v;
              }
            }
            if (entry.data?.drops?.fragmentScroll) {
              for (const [k, v] of Object.entries(entry.data.drops.fragmentScroll)) {
                combinedDrops.fragmentScroll[k] = (combinedDrops.fragmentScroll[k] || 0) + v;
              }
            }
            if (entry.data?.drops?.gear) {
              for (const [k, v] of Object.entries(entry.data.drops.gear)) {
                combinedDrops.gear[k] = (combinedDrops.gear[k] || 0) + v;
              }
            }
            if (entry.data?.drops?.scroll) {
              for (const [k, v] of Object.entries(entry.data.drops.scroll)) {
                combinedDrops.scroll[k] = (combinedDrops.scroll[k] || 0) + v;
              }
            }
            if (entry.data?.drops?.consumable) {
              for (const [k, v] of Object.entries(entry.data.drops.consumable)) {
                combinedDrops.consumable[k] = (combinedDrops.consumable[k] || 0) + v;
              }
            }
            entry.data = {
              ...entry.data,
              times: (prev.data?.times || 0) + (entry.data?.times || 1),
              drops: combinedDrops,
              currentDrops: entry.data?.currentDrops || entry.data?.drops
            };
          }
          next.lastCampaignRaidResult = entry;
          changed = true;
          continue;
        }
        if (['lastCampaignRaidResult', 'lastCraftResult'].includes(entry.key) &&
            next[entry.key] && next[entry.key].updatedAt >= entry.updatedAt) continue;
        if (next[entry.key] && next[entry.key].updatedAt > entry.updatedAt) continue;
        if (entry.key === 'experimentalMapContext' &&
            next.experimentalMapContext?.data?.mapId === entry.data?.mapId) {
          entry.data = { ...next.experimentalMapContext.data, ...entry.data,
            outposts: { ...next.experimentalMapContext.data.outposts,
              ...entry.data.outposts } };
          const ids = Object.keys(entry.data.outposts);
          for (const id of ids.slice(0, Math.max(0, ids.length - 100))) {
            delete entry.data.outposts[id];
          }
        }
        if (entry.key === 'marchStatus') {
          const previous = normalizeArrayData(next.marchStatus?.data?.marches);
          const incoming = normalizeArrayData(entry.data?.marches);
          entry.data.marches = incoming.map((march) => {
            const prior = previous.find((item) => item.squadId &&
              item.squadId === march.squadId);
            if (!prior) return march;
            if (prior.rally) {
              const rally = { ...prior.rally };
            if (march.stage === 'moveToTargetInRally' && Number.isFinite(march.endsAt)) {
              rally.arrivalAt = march.endsAt;
            }
            if (march.stage === 'returnToOutpost' && Number.isFinite(march.endsAt)) {
              rally.returnAt = march.endsAt;
            }
              return { ...march, kind: 'raid', rally,
                result: march.result || prior.result || null };
            }
            if (prior.kind === 'attack') {
              const returning = march.stage === 'returnToOutpost';
              const returnAt = returning && Number.isFinite(march.endsAt) ?
                march.endsAt : prior.returnAt;
              return { ...march, kind: 'attack', routeId: march.routeId || prior.routeId,
                mobId: prior.mobId, mobConfigId: prior.mobConfigId,
                team: prior.team, startedAt: prior.startedAt,
                durationMs: prior.durationMs, targetArrivalAt: prior.targetArrivalAt,
                result: prior.result, reportId: prior.reportId,
                returnAt, returnEstimated: returning ? false : prior.returnEstimated };
            }
            const enriched = { ...march };
            if (prior.mineId && !enriched.mineId) enriched.mineId = prior.mineId;
            if (prior.mineConfigId && !enriched.mineConfigId) enriched.mineConfigId = prior.mineConfigId;
            if (prior.team && !enriched.team) enriched.team = prior.team;
            if (prior.targetArrivalAt && !enriched.targetArrivalAt) enriched.targetArrivalAt = prior.targetArrivalAt;
            if (prior.returnAt) {
              enriched.returnAt = prior.returnAt;
              if (enriched.stage === 'returnToOutpost') enriched.endsAt = prior.returnAt;
            }
            if (prior.previousKind && !enriched.previousKind) enriched.previousKind = prior.previousKind;
            return enriched;
          });
        }
        if (entry.key === 'buildingStatus' && entry.data.action &&
            next[entry.key]?.updatedAt === entry.updatedAt) continue;
        if (entry.key === 'buildingStatus' && entry.data.action) {
          const rawQ = next.buildingStatus?.data?.queues;
          const queues = Array.isArray(rawQ) ? [...rawQ] : (rawQ && typeof rawQ === 'object' ? Object.values(rawQ) : []);
          const rawB = next.buildingStatus?.data?.buildings;
          let buildings = Array.isArray(rawB) ? [...rawB] : (rawB && typeof rawB === 'object' ? Object.values(rawB) : []);
          if (entry.data.action === 'start') {
            const queue = entry.data.queue;
            const index = queues.findIndex((item) =>
              Number.isInteger(queue.queueNumber) ? item.queueNumber === queue.queueNumber :
                item.buildingId === queue.buildingId);
            if (index >= 0) queues[index] = queue;
            else queues.push(queue);
          } else {
            const index = queues.findIndex((item) => item.buildingId === entry.data.buildingId);
            if (index >= 0) {
              const q = queues[index];
              if (q?.level) {
                const bIdx = buildings.findIndex((b) => b.buildingId === entry.data.buildingId);
                if (bIdx >= 0) buildings[bIdx] = { ...buildings[bIdx], level: q.level };
                else buildings.push({ buildingId: entry.data.buildingId, level: q.level });
              }
              queues.splice(index, 1);
            } else if (queues.length === 1) queues.length = 0;
          }
          entry.data = { queues, buildings };
        } else if (entry.key === 'buildingStatus' && !entry.data.action) {
          if (!entry.data.buildings && next.buildingStatus?.data?.buildings) {
            entry.data.buildings = next.buildingStatus.data.buildings;
          }
        }
        if (entry.key === 'researchStatus' && entry.data.action &&
            next[entry.key]?.updatedAt === entry.updatedAt) continue;
        if (entry.key === 'researchStatus' && entry.data.action) {
          const rawQ = next.researchStatus?.data?.queues;
          const queues = Array.isArray(rawQ) ? [...rawQ] : (rawQ && typeof rawQ === 'object' ? Object.values(rawQ) : []);
          const rawR = next.researchStatus?.data?.completedResearches;
          let completedResearches = Array.isArray(rawR) ? [...rawR] : (rawR && typeof rawR === 'object' ? Object.values(rawR) : []);
          if (entry.data.action === 'start') {
            const queue = entry.data.queue;
            const index = queues.findIndex((item) =>
              Number.isInteger(queue.queueNumber) ? item.queueNumber === queue.queueNumber :
                item.researchId === queue.researchId);
            if (index >= 0) queues[index] = queue;
            else queues.push(queue);
          } else {
            const index = queues.findIndex((item) => item.researchId === entry.data.researchId);
            if (index >= 0) {
              const q = queues[index];
              if (q?.level) {
                const rIdx = completedResearches.findIndex((r) => r.researchId === entry.data.researchId);
                if (rIdx >= 0) completedResearches[rIdx] = { ...completedResearches[rIdx], level: q.level };
                else completedResearches.push({ researchId: entry.data.researchId, level: q.level });
              }
              queues.splice(index, 1);
            } else if (queues.length === 1) queues.length = 0;
          }
          entry.data = { queues, completedResearches };
        } else if (entry.key === 'researchStatus' && !entry.data.action) {
          if (!entry.data.completedResearches && next.researchStatus?.data?.completedResearches) {
            entry.data.completedResearches = next.researchStatus.data.completedResearches;
          }
        }
        if (entry.key === 'resource:energy' && !Number.isFinite(entry.data.cap) &&
            Number.isFinite(next[entry.key]?.data?.cap)) {
          entry.data.cap = next[entry.key].data.cap;
        }
        if (entry.key === 'inventoryGet' && entry.data) {
          for (const k of Object.keys(next)) {
            if (k.startsWith('resource:coin:')) {
              const id = k.replace('resource:coin:', '');
              if (entry.data.coin && !Object.hasOwn(entry.data.coin, id) && next[k]?.data) {
                next[k].data.amount = 0;
              }
            } else if (k.startsWith('resource:consumable:')) {
              const id = k.replace('resource:consumable:', '');
              if (entry.data.consumable && !Object.hasOwn(entry.data.consumable, id) && next[k]?.data) {
                next[k].data.amount = 0;
              }
            }
          }
        }
        next[entry.key] = entry;
        changed = true;
      }
    }
    const pruned = pruneCache(next);
    if (pruned.changed) {
      next = pruned.cache;
      changed = true;
    }
    if (!changed) return { cache: next, changed: false };
    const size = () => new TextEncoder().encode(JSON.stringify(next)).byteLength;
    while (size() > maxBytes && Object.keys(next).length > 1) {
      const oldest = Object.values(next).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      delete next[oldest.key];
    }
    return { cache: next, changed: true };
  }

    function pruneCache(cache, now = Date.now()) {
    if (!cache || typeof cache !== 'object') return { cache: {}, changed: false };
    const next = { ...cache };
    let changed = false;

    // 1. Prune guildChat (drop messages older than 3 days relative to last chat update and orphaned users)
    if (next.guildChat?.data) {
      const existing = next.guildChat.data;
      const refTimeMs = Date.parse(next.guildChat.updatedAt) || now;
      const cutoffSec = Math.floor(refTimeMs / 1000) - (3 * 86400);
      const rawMsgs = Array.isArray(existing.messages)
        ? existing.messages
        : (existing.messages && typeof existing.messages === 'object' ? Object.values(existing.messages) : []);
      const msgs = rawMsgs.filter((m) => {
        const ctime = Number(m?.ctime || 0);
        return !ctime || ctime >= cutoffSec;
      });
      const originalCount = Array.isArray(existing.messages) ? existing.messages.length : (existing.messages ? Object.keys(existing.messages).length : 0);
      if (msgs.length !== originalCount || !Array.isArray(existing.messages)) {
        const activeUids = new Set(msgs.map((m) => String(m.userId)));
        const users = Object.fromEntries(
          Object.entries(existing.users || {}).filter(([uid]) => activeUids.has(String(uid)))
        );
        next.guildChat = {
          ...next.guildChat,
          data: {
            ...existing,
            messages: msgs,
            users: Object.keys(users).length > 0 ? users : (existing.users || {})
          }
        };
        changed = true;
      }
    }

    // 2. Prune specialQuestStatus (drop events expired > 30 minutes relative to last update)
    if (next.specialQuestStatus?.data?.events) {
      const rawEvents = Array.isArray(next.specialQuestStatus.data.events)
        ? next.specialQuestStatus.data.events
        : (next.specialQuestStatus.data.events && typeof next.specialQuestStatus.data.events === 'object' ? Object.values(next.specialQuestStatus.data.events) : []);
      const refTimeMs = Date.parse(next.specialQuestStatus.updatedAt) || now;
      const validEvents = rawEvents.filter((ev) => !Number.isFinite(ev?.end) || ev.end >= refTimeMs - 1800000);
      const originalCount = Array.isArray(next.specialQuestStatus.data.events) ? next.specialQuestStatus.data.events.length : Object.keys(next.specialQuestStatus.data.events).length;
      if (validEvents.length !== originalCount || !Array.isArray(next.specialQuestStatus.data.events)) {
        next.specialQuestStatus = {
          ...next.specialQuestStatus,
          data: {
            ...next.specialQuestStatus.data,
            events: validEvents
          }
        };
        changed = true;
      }
    }

    return { cache: next, changed };
  }

  globalThis.hwaHelperRpcCache = { extract, merge, definitions, pruneCache };
})();
