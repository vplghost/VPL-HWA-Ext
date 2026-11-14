(() => {
  const list = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  const fresh = (entry, now) => Number.isFinite(Date.parse(entry?.updatedAt)) && Date.parse(entry.updatedAt) <= now && now - Date.parse(entry.updatedAt) <= 60000;
  function hospital(cache, now) {
    const buildings = cache.buildingStatus, healing = cache['getHealing:unit'];
    if (!fresh(buildings, now) || !fresh(healing, now) || !Array.isArray(buildings.data?.buildings) || !Array.isArray(healing.data?.injuredUnits)) return null;
    let capacity = 0, wounded = 0;
    for (const row of buildings.data.buildings) {
      if (![162, 174, 175].includes(row.buildingId)) continue;
      const value = globalThis.hwaHelperMineDefenseData?.capacities[row.buildingId]?.[row.level];
      if (!Number.isSafeInteger(value) || value < 0) return null;
      capacity += value;
    }
    for (const unit of healing.data.injuredUnits) {
      if (!Number.isSafeInteger(unit.count) || unit.count < 0) return null;
      wounded += unit.count;
    }
    return { capacity, wounded, free: Math.max(0, capacity - wounded) };
  }
  function unsafeMineIds(cache, state, now) {
    const unsafe = new Set(list(cache.incomingMineAttacks?.data?.attacks).filter(a => a.impactAt > now).map(a => a.mineId));
    for (const mine of list(state?.interrupted).filter(m => m.defense)) {
      const observed = cache.mineMap?.[mine.mineId];
      if (now < mine.resumeAfter || !observed || !fresh({ updatedAt: observed.observedAt }, now) || Date.parse(observed.observedAt) < mine.resumeAfter ||
          !Object.hasOwn(observed, 'gatheringUserId') || observed.gatheringUserId != null) unsafe.add(mine.mineId);
    }
    return unsafe;
  }
  function plan(cache, state, now) {
    const account = cache.accountStatus?.data?.id, data = cache.incomingMineAttacks?.data;
    if (account == null || String(data?.accountId) !== String(account)) return null;
    const smart = globalThis.hwaHelperSmartGather;
    const rows = list(data.attacks).filter(a => a.attackerId !== String(account) && a.impactAt > now).sort((a, b) => a.impactAt - b.impactAt);
    for (const attack of rows) {
      const march = list(cache.marchStatus?.data?.marches).find(m => smart.gathering(m) && m.mineId === attack.mineId &&
        (m.mapId || smart.context(cache).mapId) === attack.mapId);
      if (!march || state?.attempted?.includes(attack.routeId + ':' + march.squadId)) continue;
      const base = { attack, march, wakeAt: now < attack.impactAt - 10000 ? attack.impactAt - 10000 : Math.min(now + 1000, attack.impactAt) };
      const room = hospital(cache, now), summary = cache['getUnitSummary:unit'];
      if (!room || room.capacity <= 0 || !fresh(cache.marchStatus, now) || !fresh(summary, now)) return { ...base, action: 'refresh', reason: 'Refreshing hospital and threatened gathering squad' };
      const squad = list(summary.data?.squads).find(s => (s.squadId ?? s.id) === march.squadId);
      const units = squad?.units;
      if (!Array.isArray(units) || !units.length) return { ...base, action: 'refresh', reason: 'Threatened squad troops unavailable' };
      let count = 0;
      for (const unit of units) {
        const n = unit.state?.survived ?? unit.count;
        if (!Number.isSafeInteger(n) || n < 0) return { ...base, action: 'refresh', reason: 'Threatened squad troop count unknown' };
        count += n;
      }
      if (room.wounded <= room.capacity * 0.5) continue;
      if (now < attack.impactAt - 10000) return { ...base, action: 'wait', reason: 'Mine threatened · recall scheduled for final 10s', room, count };
      const configId = march.mineConfigId ?? cache.mineMap?.[march.mineId]?.mineConfigId;
      if (!configId) return { ...base, action: 'refresh', reason: 'Threatened mine configuration unavailable' };
      return { ...base, action: 'recall', reason: 'Withdrawing threatened gatherers · Infirmary occupancy above 50%',
        call: { name: 'stopMineGathering', feature: 'mine', args: { squadId: march.squadId } },
        mine: { mineId: march.mineId, mapId: attack.mapId, configId, coordinates: march.targetCoordinates,
          resumeAfter: attack.impactAt + 1000, defense: true }, room, count };
    }
    return null;
  }
  function sync(state, record, cache, now) {
    const defense = state.defense || { attempted: [] };
    const process = pending => {
      if (!pending) return null;
      const child = globalThis.hwaHelperSmartGather.sync({ accountId: state.accountId, pending, interrupted: [] }, record, cache, now);
      if (child.error) defense.status = child.error;
      state.interrupted = [...list(state.interrupted), ...list(child.interrupted).filter(m => !list(state.interrupted).some(old => old.mineId === m.mineId))].slice(-20);
      return child.pending || null;
    };
    defense.pending = process(defense.pending);
    defense.waiting = list(defense.waiting).map(process).filter(Boolean);
    state.defense = defense;
    return state;
  }
  globalThis.hwaHelperMineDefense = { hospital, unsafeMineIds, plan, sync };
})();
