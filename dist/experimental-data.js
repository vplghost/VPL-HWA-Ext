(() => {
  // Alliance 1.292.0 globalMapRallySettings f69b9fce.
  const rallyWaitOptions = [60, 300, 900, 1800];
  const capacitySignature = (hero) => JSON.stringify([hero?.level, hero?.star, hero?.power]);
  const capacityExamples = { 16: [80, 3, 799], 67: [70, 4, 740],
    14: [30, 2, 685], 33: [2, 1, 623], 38: [1, 1, 622] };

  function heroCapacity(id, hero, saved) {
    if (saved?.signature === capacitySignature(hero) && Number.isSafeInteger(saved.count) && saved.count > 0) return saved.count;
    if (saved) return null;
    // Observed in game by the user, 2026-11-06; never extrapolate to other levels/stars.
    const example = capacityExamples[id];
    return example && hero?.level === example[0] && hero?.star === example[1] ? example[2] : null;
  }

  function squadCapacity(ids, heroes, capacities, base) {
    if (ids?.length !== 5 || new Set(ids).size !== 5 || !Number.isSafeInteger(base) || base < 0) return null;
    const counts = ids.map((id) => heroCapacity(id, heroes[id], capacities?.[id]));
    return counts.every((n) => Number.isSafeInteger(n) && n > 0) ? base + counts.reduce((a, b) => a + b, 0) : null;
  }

  function allocateTroops(summary, capacity) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) return [];
    // unit config fecf9b97: IDs 1–10 front, 11–20 middle, 21–30 back; tier ascends.
    const stocks = new Map();
    for (const item of summary?.available || []) {
      const id = item.unitId;
      if (Number.isInteger(id) && id >= 1 && id <= 30 && Number.isSafeInteger(item.count) && item.count > 0) {
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
      for (let tier = 10; tier >= 1 && remaining > 0; tier--) {
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

  function lowestPowerHeroes(heroes) {
    return Object.entries(heroes || {})
      .filter(([id, hero]) => Number.isInteger(Number(id)) && Number.isFinite(hero?.power))
      .sort((a, b) => a[1].power - b[1].power || Number(a[0]) - Number(b[0]))
      .slice(0, 5).map(([id]) => Number(id));
  }

  function teamOptions(teams, heroes) {
    const options = [{ id: 'weakest', label: '5 lowest power heroes', heroIds: lowestPowerHeroes(heroes) }];
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
    squadCapacity, allocateTroops, rallyMembers, bossConfigId, lowestPowerHeroes,
    mineConfigId, mineTypeLevel, teamOptions, buildSquad, buildRallyCall,
    buildGatherCall, buildMineSearchCall, rallyPhase };
})();
