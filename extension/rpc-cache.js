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

    if (Number.isFinite(rewardObj.stamina) && rewardObj.stamina > 0) {
      addReward('energy', rewardObj.stamina);
    }
    if (Number.isFinite(rewardObj.gold) && rewardObj.gold > 0) {
      addReward('gold', rewardObj.gold);
    }
    if (Number.isFinite(rewardObj.starMoney) && rewardObj.starMoney > 0) {
      addReward('starMoney', rewardObj.starMoney);
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
    for (const groupType of ['consumable', 'material', 'coin', 'lootboxChanced', 'patron', 'scroll', 'teleporter']) {
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
        if (key === 'getRoutesByIds:globalMap' && Array.isArray(result?.response?.routes)) {
          const actions = [];
          for (const route of result.response.routes) {
            if (route?.type === 'returnToOutpost') {
              const startedAt = route.startedAt;
              const duration = route.durationMs ?? route.duration;
              if (Number.isFinite(startedAt) && Number.isFinite(duration)) {
                actions.push({
                  key: 'rallyAction',
                  method: call.name,
                  feature: call.feature,
                  group: 'internal',
                  data: {
                    action: 'returnRoute',
                    routeId: route.routeId,
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
            if (rep?.type === 'rallyMobAttackResult' && Number.isFinite(rep.createdAt)) {
              actions.push({
                key: 'rallyAction',
                method: call.name,
                feature: call.feature,
                group: 'internal',
                data: {
                  action: 'battleReport',
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
          if (Object.keys(mines).length) {
            return [{
              key: 'mineMapAction',
              method: call.name,
              feature: call.feature,
              group: 'internal',
              data: { mines },
              updatedAt: record.timestamp
            }];
          }
        }
        if (key === 'getChunks:globalMap' && Array.isArray(result?.response?.chunks)) {
          const mines = {};
          for (const chunk of result.response.chunks) {
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
          if (Object.keys(mines).length) {
            return [{
              key: 'mineMapAction',
              method: call.name,
              feature: call.feature,
              group: 'internal',
              data: { mines },
              updatedAt: record.timestamp
            }];
          }
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
          }];
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
                    if (call.name === 'dungeonEndBattle' && result?.response) {
            const actions = [];
            const rep = result.response;
            const dungeon = rep.dungeon || {};
            const floor = Number.isFinite(dungeon.floorNumber) ? dungeon.floorNumber :
              (Number.isFinite(Number(dungeon.maxFloorPassed)) ? Number(dungeon.maxFloorPassed) + 1 : null);
            actions.push({
              key: 'dungeonStatus',
              method: call.name,
              feature: null,
              group: 'events',
              data: {
                floorNumber: floor,
                maxFloorPassed: Number(dungeon.maxFloorPassed) || 0,
                maxFloorReached: dungeon.maxFloorReached || 0,
                respawnFloor: Number(dungeon.respawnFloor) || 0,
                elements: dungeon.elements || { prime: 'earth', nonprime: ['water', 'fire'] },
                states: dungeon.states || rep.states || {},
                dungeonActivity: rep.dungeonActivity ?? dungeon.dungeonActivity ?? 0,
                currentFloorDoors: dungeon.floor?.userData || []
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
            const floor = Number.isFinite(dungeon.floorNumber) ? dungeon.floorNumber :
              (Number.isFinite(Number(dungeon.maxFloorPassed)) ? Number(dungeon.maxFloorPassed) + 1 : null);
            actions.push({
              key: 'dungeonStatus',
              method: call.name,
              feature: null,
              group: 'events',
              data: {
                floorNumber: floor,
                maxFloorPassed: Number(dungeon.maxFloorPassed) || 0,
                maxFloorReached: dungeon.maxFloorReached || 0,
                respawnFloor: Number(dungeon.respawnFloor) || 0,
                elements: dungeon.elements || { prime: 'earth', nonprime: ['water', 'fire'] },
                states: dungeon.states || rep.states || {},
                dungeonActivity: rep.dungeonActivity ?? dungeon.dungeonActivity ?? 0,
                currentFloorDoors: dungeon.floor?.userData || []
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
              deadHeroesCount: resp.deadHeroesCount ?? 0,
              floorNumber: resp.floorData?.floorNumber ?? (isCleared ? 26 : 0)
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
          const resp = result?.response;
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
              enemyAttackHeroes
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
          } else if (entry.data.action === 'returnRoute') {
            let updated = false;
            for (let i = 0; i < marches.length; i++) {
              if (marches[i].rally) {
                marches[i] = {
                  ...marches[i],
                  stage: 'returnToOutpost',
                  endsAt: entry.data.returnAt,
                  rally: {
                    ...marches[i].rally,
                    returnAt: entry.data.returnAt
                  }
                };
                updated = true;
              }
            }
            if (!updated) continue;
          } else if (entry.data.action === 'battleReport') {
            let updated = false;
            for (let i = 0; i < marches.length; i++) {
              if (marches[i].rally) {
                const returnMs = marches[i].rally.returnMs || marches[i].rally.outboundMs || 60000;
                const returnAt = entry.data.createdAt + returnMs;
                marches[i] = {
                  ...marches[i],
                  stage: 'returnToOutpost',
                  endsAt: marches[i].rally.returnAt || returnAt,
                  rally: {
                    ...marches[i].rally,
                    arrivalAt: entry.data.createdAt,
                    returnAt: marches[i].rally.returnAt || returnAt
                  }
                };
                updated = true;
              }
            }
            if (!updated) continue;
          }
          next.marchStatus = { key: 'marchStatus', method: entry.method,
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
          const current = next.marchStatus;
          if (current?.updatedAt > entry.updatedAt) continue;
          const marches = [...(current?.data?.marches || [])];
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
          const chestSet = new Set([
            ...(existing.chestNumbers || []),
            ...(incoming.chestNumbers || [])
          ]);
          const mergedData = {
            ...existing,
            ...incoming,
            info: incoming.info ? { ...existing.info, ...incoming.info } : existing.info,
            battle: incoming.battle ? { ...existing.battle, ...incoming.battle } : existing.battle,
            rewards: incoming.rewards ? { ...existing.rewards, ...incoming.rewards } : existing.rewards,
            chestNumbers: Array.from(chestSet).sort((a, b) => a - b)
          };
          if (incoming.score !== undefined) {
            mergedData.score = incoming.score;
          } else if (incoming.rewards?.userRoundPoints !== undefined) {
            mergedData.score = incoming.rewards.userRoundPoints;
          } else if (existing.score !== undefined) {
            mergedData.score = existing.score;
          }
          if (incoming.progress !== undefined) {
            mergedData.progress = incoming.progress;
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
          const status = next.clanVersusStatus ? { ...next.clanVersusStatus.data } : { progress: 0, chestNumbers: [] };
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
            if (next.inventoryGet?.data?.coin) {
              next.inventoryGet = {
                ...next.inventoryGet,
                data: { ...next.inventoryGet.data, coin: { ...next.inventoryGet.data.coin, '1': data.amount } }
              };
            }
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
          next.legendDraftStatus = {
            key: 'legendDraftStatus',
            method: entry.method,
            feature: null,
            group: 'draft',
            data: {
              ...previous,
              ...entry.data,
              defenceHeroes: previous.defenceHeroes || [],
              attackHeroes: previous.attackHeroes || [],
              enemyDefenceHeroes: previous.enemyDefenceHeroes || [],
              enemyAttackHeroes: previous.enemyAttackHeroes || []
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
            if (entry.data.attackHeroes?.length) draft.attackHeroes = entry.data.attackHeroes;
            if (entry.data.defenceHeroes?.length) draft.defenceHeroes = entry.data.defenceHeroes;
            if (entry.data.enemyDefenceHeroes?.length) draft.enemyDefenceHeroes = entry.data.enemyDefenceHeroes;
            if (entry.data.enemyAttackHeroes?.length) draft.enemyAttackHeroes = entry.data.enemyAttackHeroes;
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
            if (next.inventoryGet?.data?.coin?.['1'] !== undefined) {
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  coin: {
                    ...next.inventoryGet.data.coin,
                    '1': Math.max(0, (next.inventoryGet.data.coin['1'] ?? 0) - goldCost)
                  }
                }
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
            if (next.inventoryGet) {
              const cur = next.inventoryGet.data?.coin?.['1'] ?? 0;
              next.inventoryGet = {
                ...next.inventoryGet,
                data: {
                  ...next.inventoryGet.data,
                  coin: { ...(next.inventoryGet.data?.coin || {}), '1': cur + numAmt }
                }
              };
            }
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
          next.dungeonStatus = {
            key: 'dungeonStatus',
            method: entry.method,
            feature: entry.feature,
            group: 'events',
            data: {
              ...previous,
              ...entry.data,
              states: {
                ...previous.states,
                ...entry.data.states,
                titans: {
                  ...(previous.states?.titans || {}),
                  ...(entry.data.states?.titans || {})
                }
              }
            },
            updatedAt: entry.updatedAt
          };
          changed = true;
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
        if (entry.key === 'specialQuestStatus') {
          const existing = next.specialQuestStatus?.data?.events || [];
          const incoming = entry.data?.events || [];
          const evMap = new Map();
          for (const ev of existing) {
            if (ev?.id) evMap.set(ev.id, ev);
          }
          for (const ev of incoming) {
            if (ev?.id) evMap.set(ev.id, ev);
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
        if (entry.key === 'towerStatus') {
          const existing = next.towerStatus?.data || {};
          const incoming = entry.data || {};
          next.towerStatus = {
            ...entry,
            data: {
              ...existing,
              ...incoming,
              isCleared: Boolean(incoming.isCleared || existing.isCleared || incoming.state === 'win' || existing.state === 'win')
            }
          };
          changed = true;
          continue;
        }
        if (entry.key === 'mailStatus') {
          if (next.mailStatus && next.mailStatus.updatedAt === entry.updatedAt) continue;
          const existing = next.mailStatus?.data || {};
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
                reports: (existing.reports || []).map((r) => ({ ...r, claimedReward: true })),
                letters: isReportOnly ? existing.letters : (existing.letters || []).map((l) => ({ ...l, claimed: true }))
              }
            };
          } else if (entry.data?.action === 'claimMail') {
            const claimedIds = new Set((entry.data.letterIds || []).map(String));
            const updatedLetters = (existing.letters || []).map((l) => {
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
            const updatedReports = (existing.reports || []).map((r) => {
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
            let reports = existing.reports || [];
            let unclaimedReportsCount = existing.unclaimedReportsCount || 0;
            if (Array.isArray(entry.data?.reports)) {
              const repMap = new Map(reports.map((r) => [String(r.id), r]));
              for (const rep of entry.data.reports) {
                const prev = repMap.get(String(rep.id));
                repMap.set(String(rep.id), prev ? { ...prev, ...rep } : rep);
              }
              reports = Array.from(repMap.values());
              unclaimedReportsCount = reports.filter((r) => r && r.claimedReward === false).length;
            } else if (entry.data?.unclaimedReportsCount !== undefined) {
              unclaimedReportsCount = entry.data.unclaimedReportsCount;
            }

            let letters = existing.letters || [];
            let unclaimedLettersCount = existing.unclaimedLettersCount || 0;
            if (Array.isArray(entry.data?.letters)) {
              const letterMap = new Map(letters.map((l) => [String(l.id || l.letterId), l]));
              for (const l of entry.data.letters) {
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
        if (next[entry.key] && next[entry.key].updatedAt > entry.updatedAt) continue;
        if (entry.key === 'marchStatus') {
          const previous = next.marchStatus?.data?.marches || [];
          entry.data.marches = entry.data.marches.map((march) => {
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
              return { ...march, kind: 'raid', rally };
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
