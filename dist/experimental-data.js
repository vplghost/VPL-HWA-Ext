(() => {
  // Alliance 1.292.0 globalMapRallySettings f69b9fce.
  const rallyWaitOptions = [60, 300, 900, 1800];
  const capacitySignature = (hero) => JSON.stringify([hero?.level, hero?.star, hero?.power]);
  const capacityExamples = { 16: [80, 3, 799], 67: [70, 4, 740],
    14: [30, 2, 685], 33: [2, 1, 623], 38: [1, 1, 622] };

  function normalizeCapacitySettings(settings) {
    return { defaultHero: Number.isSafeInteger(settings?.defaultHero) && settings.defaultHero > 0 && settings.defaultHero <= 1000000 ? settings.defaultHero : 600,
      base: Number.isSafeInteger(settings?.base) && settings.base >= 0 && settings.base <= 1000000 ? settings.base : 950 };
  }

  function estimateHeroTroopCapacity(power) {
    if (!Number.isFinite(power) || power < 1000) return null;
    let troop;
    if (power < 9000) {
      troop = Math.max(623, Math.floor(469.5 + power / 39.0));
    } else if (power < 30000) {
      troop = Math.floor(578.4 + 1.24 * Math.sqrt(power));
    } else {
      troop = Math.floor(695.0 + power / 315.0);
    }
    // Giảm 2 đơn vị để tránh vượt ngưỡng (zero overflow margin)
    return Math.max(1, troop - 2);
  }

  function heroCapacity(id, hero, saved, fallback = 600) {
    if (Number.isSafeInteger(hero?.troopCapacity) && hero.troopCapacity > 0) return hero.troopCapacity;
    if (saved?.signature === capacitySignature(hero) && Number.isSafeInteger(saved.count) && saved.count > 0) return saved.count;
    const example = capacityExamples[id];
    if (example && hero?.level === example[0] && hero?.star === example[1]) return example[2];
    if (fallback != null) {
      const estimated = estimateHeroTroopCapacity(hero?.power);
      if (estimated != null) return estimated;
    }
    return fallback;
  }
  function squadCapacity(ids, heroes, capacities, base = 950, defaultHero = 600) {
    if (ids?.length !== 5 || new Set(ids).size !== 5 || !Number.isSafeInteger(base) || base < 0) return null;
    return base + ids.reduce((sum, id) => sum + heroCapacity(id, heroes[id], capacities?.[id], defaultHero), 0);
  }

  function capacityModel(ids, heroes, observations, rawSettings, accountId) {
    const settings = normalizeCapacitySettings(rawSettings);
    const known = Object.fromEntries(Object.entries(heroes || {}).map(([id, hero]) => [id, heroCapacity(id, hero, null, null)])
      .filter(([, value]) => value != null));
    const rows = (observations || []).filter((row) => accountId != null && String(row.accountId) === String(accountId) &&
      Number.isSafeInteger(row.total) && row.total > 0 && row.profiles?.length === 5 && new Set(row.profiles.map((profile) => profile.id)).size === 5 &&
      row.profiles.every((profile) => Number.isInteger(profile.id) && heroes[profile.id] && profile.signature === capacitySignature(heroes[profile.id])));
    const unknown = [...new Set(rows.flatMap((row) => row.profiles.map((profile) => profile.id)).filter((id) => known[id] == null))];
    const matrix = rows.map((row) => {
      const members = row.profiles.map((profile) => profile.id);
      return [...unknown.map((id) => members.includes(id) ? 1 : 0),
        row.total - settings.base - members.reduce((sum, id) => sum + (known[id] || 0), 0)];
    }).filter((row) => row.slice(0, -1).some((value) => value) && row.at(-1) >= row.slice(0, -1).reduce((a, b) => a + b, 0) * settings.defaultHero);
    // Solve only identifiable contributions. Free variables retain the configured fallback.
    let pivot = 0;
    for (let column = 0; column < unknown.length && pivot < matrix.length; column++) {
      const found = matrix.findIndex((row, index) => index >= pivot && Math.abs(row[column]) > 1e-7);
      if (found < 0) continue;
      [matrix[pivot], matrix[found]] = [matrix[found], matrix[pivot]];
      const factor = matrix[pivot][column]; matrix[pivot] = matrix[pivot].map((value) => value / factor);
      for (let index = 0; index < matrix.length; index++) if (index !== pivot) {
        const scale = matrix[index][column]; matrix[index] = matrix[index].map((value, col) => value - scale * matrix[pivot][col]);
      }
      pivot++;
    }
    const inferred = {};
    const inconsistent = matrix.some((row) => row.slice(0, -1).every((value) => Math.abs(value) < 1e-7) && Math.abs(row.at(-1)) > 1e-7);
    if (!inconsistent) for (const row of matrix) {
      const columns = row.slice(0, -1).map((value, index) => Math.abs(value) > 1e-7 ? index : -1).filter((index) => index >= 0);
      if (columns.length === 1 && row.at(-1) >= settings.defaultHero && row.at(-1) <= 1000000) inferred[unknown[columns[0]]] = Math.floor(row.at(-1) + 1e-7);
    }
    const counts = (ids || []).map((id) => known[id] ?? inferred[id] ?? estimateHeroTroopCapacity(heroes?.[id]?.power) ?? settings.defaultHero);
    const observed = Math.max(0, ...rows.filter((row) => row.profiles.every((profile) => ids?.includes(profile.id))).map((row) => row.total));
    const total = ids?.length === 5 && new Set(ids).size === 5 ? Math.max(observed, settings.base + counts.reduce((a, b) => a + b, 0)) : null;
    return { total, observed, inferred, counts, settings };
  }

  function unitInfo(id) {
    const level = id % 10, type = Math.floor(id / 10);
    return Number.isInteger(id) && level >= 1 && level <= 9 && type >= 0 && type <= 2 ?
      { type, level, label: ['Marksmen', 'Spearmen', 'Infantry'][type] } : null;
  }
  function allocateTroops(summary, capacity) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) return [];
    // Troop ID ranges: 1–9 Marksmen, 11–19 Spearmen, 21–29 Infantry.
    const stocks = new Map();
    for (const item of summary?.available || []) {
      const id = item.unitId;
      if (unitInfo(id) && Number.isSafeInteger(item.count) && item.count > 0) {
        stocks.set(id, Math.max(stocks.get(id) || 0, item.count));
      }
    }
    const totals = [0, 1, 2].map((type) => [...stocks].filter(([id]) => Math.floor((id - 1) / 10) === type)
      .reduce((sum, [, count]) => sum + count, 0));
    const quotas = [0, 0, 0];
    let left = Math.min(capacity, totals.reduce((a, b) => a + b, 0));
    while (left > 0) {
      const open = quotas.map((count, type) => ({ count, type })).filter(({ count, type }) => count < totals[type]);
      const step = Math.max(1, Math.floor(left / open.length));
      for (const { type } of open) {
        const amount = Math.min(step, totals[type] - quotas[type], left);
        quotas[type] += amount; left -= amount;
      }
    }
    const units = [];
    for (let type = 0; type < 3; type++) {
      let remaining = quotas[type];
      for (let tier = 9; tier >= 1 && remaining > 0; tier--) {
        const unitId = type * 10 + tier;
        const count = Math.min(remaining, stocks.get(unitId) || 0);
        if (count) units.push({ unitId, count });
        remaining -= count;
      }
    }
    return units;
  }

  function rallyMembers(rally) {
    if (!rally?.leader || !Array.isArray(rally.members) || !Number.isInteger(rally.membersCapacityLeft)) return null;
    const ids = new Set([rally.leader, ...rally.members].map((member) => member?.userId).filter((id) => id != null).map(String));
    if (!ids.size) return null;
    return { count: ids.size, total: ids.size + rally.membersCapacityLeft };
  }
  const bossConfigId = (level) => Number.isInteger(level) && level >= 1 && level <= 30 ? 59 + level : null;
  // Captured globalMapMobSolo 7bc90ab7: ordinary IDs 23–52, PvP IDs 53–67 and 74–88.
  const soloMonsterConfigIds = (level) => Number.isInteger(level) && level >= 1 && level <= 30 ?
    [22 + level, (level <= 15 ? 52 : 58) + level] : null;
  const soloMonsterLevel = (configId) => {
    const id = Number(configId);
    if (id >= 23 && id <= 52) return id - 22;
    if (id >= 53 && id <= 67) return id - 52;
    if (id >= 74 && id <= 88) return id - 58;
    return null;
  };
  // Hero Wars: Alliance 1.292.0 globalMapMine remote config 8e714674: levels 1–10.
  const mineConfigs = {
    wood: [12, 20, 21, 22, 23, 24, 55, 56, 57, 58],
    food: [27, 28, 29, 30, 31, 32, 65, 66, 67, 68],
    stone: [35, 36, 37, 38, 39, 40, 75, 76, 77, 78],
    iron: [43, 44, 45, 46, 47, 48, 85, 86, 87, 88]
  };
  const mineConfigId = (type, level) => mineConfigs[type]?.[level - 1] ?? null;
  const mineTypeLevel = (configId) => {
    for (const [type, ids] of Object.entries(mineConfigs)) {
      const index = ids.indexOf(Number(configId));
      if (index >= 0) return { type, level: index + 1 };
    }
    return null;
  };

  function availableHeroIds(heroes, summary, marches = []) {
    const busy = new Set((summary?.squads || []).flatMap((squad) =>
      (squad.heroes || []).map((hero) => Number(hero.id ?? hero.heroId ?? hero))));
    for (const march of marches) {
      for (const id of march.team?.heroIds || []) busy.add(Number(id));
    }
    return Object.keys(heroes || {}).map(Number).filter((id) => !busy.has(id));
  }

  function normalizeCustomTeam(team, heroes) {
    const name = typeof team?.name === 'string' ? team.name.trim().slice(0, 80) : '';
    const heroIds = [...new Set(team?.heroIds || [])];
    const maxTroops = team?.maxTroops;
    if (maxTroops != null && (!Number.isSafeInteger(maxTroops) || maxTroops <= 0)) return null;
    return name && heroIds.length === 5 && heroIds.every((id) => Number.isInteger(id) && heroes?.[id]) ?
      { id: team.id, name, heroIds, ...(maxTroops != null ? { maxTroops } : {}) } : null;
  }

  function lowestPowerHeroes(heroes, availableIds = Object.keys(heroes || {}).map(Number)) {
    return Object.entries(heroes || {})
      .filter(([id, hero]) => Number.isInteger(Number(id)) && availableIds.includes(Number(id)) && Number.isFinite(hero?.power))
      .sort((a, b) => a[1].power - b[1].power || Number(a[0]) - Number(b[0]))
      .slice(0, 5).map(([id]) => Number(id));
  }

  function teamOptions(teams, heroes, customTeams = [], availableIds) {
    const options = customTeams.map((team) => normalizeCustomTeam(team, heroes)).filter(Boolean)
      .map((team) => ({ id: `custom:${team.id}`, label: `Custom · ${team.name}`, heroIds: team.heroIds, maxTroops: team.maxTroops }));
    options.push({ id: 'weakest', label: '5 lowest power heroes', heroIds: lowestPowerHeroes(heroes, availableIds) });
    for (const [mode, members] of Object.entries(teams || {})) {
      if (!Array.isArray(members)) continue;
      const groups = members.some(Array.isArray) ? members : [members];
      groups.forEach((group, index) => {
        const heroIds = (Array.isArray(group) ? group : []).filter((id) =>
          Number.isInteger(id) && heroes?.[id]).slice(0, 5);
        if (heroIds.length) options.push({ id: `${mode}:${index}`,
          label: `${mode}${groups.length > 1 ? ` #${index + 1}` : ''}`, heroIds });
      });
    }
    return options;
  }

  function teamTroopCapacity(automatic, maxTroops) {
    return Number.isSafeInteger(maxTroops) && maxTroops > 0 ? maxTroops : automatic;
  }

  function buildSquad(heroIds, units) {
    const ids = [...new Set(heroIds)].filter(Number.isInteger).slice(0, 5);
    const troops = units.filter((unit) => Number.isInteger(unit.unitId) && unit.unitId > 0 &&
      Number.isInteger(unit.count) && unit.count > 0);
    if (ids.length !== 5 || !troops.length) return null;
    return { heroes: ids.map((heroId) => ({ heroId })), units: troops };
  }

  function buildRallyCall(mapId, mobId, squad, waitSeconds) {
    if (!mapId || !mobId || !squad || !Number.isInteger(waitSeconds) ||
        !rallyWaitOptions.includes(waitSeconds)) return null;
    return { name: 'createRally', feature: 'mob', args: {
      mapId, mobId, squad, startDelay: waitSeconds * 1000
    } };
  }

  function buildGatherCall(mapId, mineId, squad) {
    if (!mapId || !mineId || !squad) return null;
    return { name: 'attackMine', feature: 'mine', args: {
      mapId, mineId, battleType: 'pve', squad
    } };
  }

  function buildMineSearchCall(mapId, center, type, level) {
    const configId = mineConfigId(type, level);
    if (!mapId || !Number.isFinite(center?.x) || !Number.isFinite(center?.y) || !configId) return null;
    return { name: 'searchMine', feature: 'mine', args: {
      mapId, mineConfigIds: [configId], fullOnly: true, center: { x: center.x, y: center.y }
    } };
  }

  function bossLevel(configId) {
    if (!Number.isInteger(configId)) return null;
    if (configId >= 60 && configId <= 89) return configId - 59;
    const name = globalThis.hwaHelperRallyTargets?.[configId];
    if (name) {
      const match = name.match(/level\s+(\d+)/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function buildJoinRallyCall(mapId, rallyId, squad) {
    if (!rallyId || !squad) return null;
    const args = { rallyId, squad };
    if (mapId) args.mapId = mapId;
    return { name: 'joinRally', feature: 'rally', args };
  }

  function rallyPhase(march, now = Date.now()) {
    const rally = march?.rally;
    if (!rally) return null;
    if (march.stage === 'returnToOutpost') return { phase: 'Returning', until: rally.returnAt || march.endsAt,
      result: march.result || null };
    if (march.result) return { phase: 'Battle complete', until: rally.returnAt, result: march.result };
    if (Number.isFinite(rally.waitUntil) && now < rally.waitUntil) return {
      phase: 'Waiting', until: rally.waitUntil, result: null };
    const arrivalAt = rally.arrivalAt ||
      (march.stage === 'moveToTargetInRally' && Number.isFinite(march.endsAt) ? march.endsAt : null) ||
      (Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs) ?
        rally.waitUntil + rally.outboundMs : null);
    if (Number.isFinite(arrivalAt) && now < arrivalAt) return {
      phase: 'Traveling to boss', until: arrivalAt, result: null };
    return { phase: 'Battle / awaiting result', until: null, result: null };
  }

  globalThis.hwaHelperExperimentalData = { rallyWaitOptions, capacitySignature, heroCapacity,
    estimateHeroTroopCapacity,
    squadCapacity, normalizeCapacitySettings, capacityModel, unitInfo, allocateTroops, rallyMembers, bossConfigId, bossLevel, soloMonsterConfigIds, soloMonsterLevel, lowestPowerHeroes,
    mineConfigId, mineTypeLevel, availableHeroIds, normalizeCustomTeam, teamOptions, teamTroopCapacity, buildSquad, buildRallyCall, buildJoinRallyCall,
    buildGatherCall, buildMineSearchCall, rallyPhase };
})();
