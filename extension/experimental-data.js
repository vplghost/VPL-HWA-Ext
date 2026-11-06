(() => {
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
        waitSeconds < 1 || waitSeconds > 3600) return null;
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

  globalThis.hwaHelperExperimentalData = { bossConfigId, lowestPowerHeroes,
    mineConfigId, mineTypeLevel, teamOptions, buildSquad, buildRallyCall,
    buildGatherCall, buildMineSearchCall, rallyPhase };
})();
