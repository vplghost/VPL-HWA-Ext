(() => {
  const data = globalThis.hwaHelperExperimentalData;
  const terminal = (state) => !state || ['complete', 'stopped'].includes(state.phase);
  const rosterCalls = () => [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }];
  const rallyEnergyCost = 25;
  function stop(state, reason) { return { ...state, bossQueue: null, phase: 'stopped', reason, wakeAt: null }; }
  function issue(state, phase, calls, now, expiresAt = now + 120000) {
    return { state: { ...state, phase, sentAt: now, wakeAt: expiresAt, expected: calls }, calls, expiresAt };
  }
  function energyAt(cache, now) {
    const energy = cache?.['resource:world-energy']?.data;
    if (Number.isFinite(energy?.amount)) {
      if (Number.isFinite(energy.lastRefillAt) && Number.isFinite(energy.refillEveryMs) &&
          energy.refillEveryMs > 0 && Number.isFinite(energy.cap)) {
        return Math.min(energy.cap, energy.amount +
          Math.floor(Math.max(0, now - energy.lastRefillAt) / energy.refillEveryMs));
      }
      return energy.amount;
    }
    return cache?.worldEnergyStatus?.data?.energy;
  }
  function search(state, now) {
    return issue(state, 'searching', [{ name: 'searchMob', feature: 'mob', args: {
      mapId: state.options.mapId, center: state.options.center, mobType: 'rally',
      mobConfigIds: [data.bossConfigId(state.options.level)] } }], now);
  }
  function nextBoss(state, cache, now) {
    if (state.bossQueue.remain_raid_count === 0) return { state: { ...state, phase: 'complete', wakeAt: null } };
    if (!state.bossQueue.queue.length) return search(state, now);
    const energy = energyAt(cache, now);
    if (Number.isFinite(energy) && energy < rallyEnergyCost) {
      return { state: stop(state, `Not enough World Energy for a rally (need ${rallyEnergyCost}).`) };
    }
    const mobId = state.bossQueue.queue[0].mobId;
    const call = data.buildRallyCall(state.options.mapId, mobId, state.squad, state.options.waitSeconds);
    if (!call) return { state: stop(state, 'No available troops. Refresh the form.') };
    state.current = { mobId, mapId: state.options.mapId };
    return issue(state, 'creating', [call], now);
  }
  function consumeBoss(state, failed = false) {
    const mobId = state.current?.mobId;
    state.bossQueue = { ...state.bossQueue,
      queue: state.bossQueue.queue.filter((boss) => boss.mobId !== mobId),
      remain_raid_count: state.bossQueue.remain_raid_count - (failed ? 0 : 1) };
    if (failed) state.failedBossIds = [...new Set([...(state.failedBossIds || []), mobId])];
    else state.wonBossIds = [...new Set([...(state.wonBossIds || []), mobId])];
    state.current = null;
  }
  function start(options, tabId, accountId, now, cache, settings) {
    if (!accountId || !Number.isInteger(tabId) || !options?.mapId ||
        !Number.isFinite(options.center?.x) || !Number.isFinite(options.center?.y) ||
        !data.bossConfigId(options.level) || !data.rallyWaitOptions.includes(options.waitSeconds) ||
        !Number.isInteger(options.count) || options.count < 1 || options.count > 100 ||
        !Number.isInteger(options.minMembers) || options.minMembers < 1 || options.minMembers > 6 ||
        (options.autoCancel != null && typeof options.autoCancel !== 'boolean') ||
        options.heroIds?.length !== 5 || new Set(options.heroIds).size !== 5) return null;
    const state = { id: `${now}:${tabId}`, tabId, accountId, options: { ...options, autoCancel: options.autoCancel !== false }, started: 0, completed: 0,
      bossQueue: { remain_raid_count: options.count, queue: [] }, failedBossIds: [], wonBossIds: [],
      phase: 'refreshing', current: null };
    if (!cache) return issue(state, 'refreshing', rosterCalls(), now);
    const search = cache.experimentalRallySearch?.data;
    const heroes = cache.heroGetAll?.data;
    const summary = cache['getUnitSummary:unit']?.data;
    if (search?.mapId !== options.mapId ||
        !search.mobConfigIds?.includes(data.bossConfigId(options.level)) ||
        !search.mobs?.some((mob) => mob.mobId === options.firstMobId) ||
        cache.experimentalDefeatedBosses?.data?.some((boss) =>
          boss.mapId === options.mapId && boss.mobId === options.firstMobId) ||
        !heroes || !summary ||
        options.heroIds.some((id) => !heroes[id]) ||
        summary.squads?.some((squad) => squad.heroes?.some((hero) =>
          options.heroIds.includes(hero.id ?? hero.heroId)))) return null;
    const cap = data.capacityModel(options.heroIds, heroes, cache.troopCapacityEvidence?.data,
      settings, accountId).total;
    const squad = data.buildSquad(options.heroIds, data.allocateTroops(summary, cap));
    const won = cache.experimentalDefeatedBosses?.data || [];
    const bosses = search.mobs.filter((mob) => mob.mobId &&
      !won.some((item) => item.mapId === options.mapId && item.mobId === mob.mobId));
    const ordered = [bosses.find((mob) => mob.mobId === options.firstMobId),
      ...bosses.filter((mob) => mob.mobId !== options.firstMobId)];
    return nextBoss({ ...state, squad, bossQueue: { ...state.bossQueue,
      queue: [...new Map(ordered.map((mob) => [mob.mobId, { mobId: mob.mobId }])).values()] } }, cache, now);
  }
  function responses(record) {
    if (record?.method !== 'POST' || record.status !== 200 || record.requestBodyTruncated ||
        record.responseBodyTruncated || record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc') return [];
    try {
      const request = JSON.parse(record.requestBody), response = JSON.parse(record.responseBody);
      return (request.calls || []).map((call) => ({ call,
        result: response.results?.find((result) => result.ident === call.ident)?.result }));
    } catch { return []; }
  }
  const sameCall = (a, b) => a.name === b.name && (a.feature || '') === (b.feature || '') &&
    JSON.stringify(a.args || {}) === JSON.stringify(b.args || {});
  function advance(previous, record, cache, now, settings) {
    if (terminal(previous)) return { state: previous };
    let state = { ...previous, current: previous.current ? { ...previous.current } : null };
    if (!state.bossQueue) state.bossQueue = { remain_raid_count: Math.max(0,
      (state.options?.count || 0) - (state.completed || 0)),
      queue: state.current?.mobId ? [{ mobId: state.current.mobId }] : [] };
    if (cache?.accountStatus?.data?.id != null && String(cache.accountStatus.data.id) !== String(state.accountId)) {
      return { state: stop(state, 'Game account changed.') };
    }
    const fresh = record && Date.parse(record.timestamp) >= state.sentAt;
    const replies = fresh ? responses(record) : [];
    for (const { call, result } of replies) {
      if (result?.error && state.expected?.some((expected) => sameCall(call, expected))) {
        const detail = typeof result.error === 'string' ? result.error :
          result.error.message || result.error.description || result.error.code || 'Game rejected the request';
        if (call.name === 'createRally' && state.phase === 'creating') {
          if (/energy|stamina|refillable|resource/i.test(JSON.stringify(result.error))) {
            return { state: stop(state, `Not enough World Energy: ${String(detail).slice(0, 160)}.`) };
          }
          consumeBoss(state, true);
          return nextBoss(state, cache, now);
        }
        return { state: stop(state, `${call.name} failed: ${String(detail).slice(0, 160)}. No automatic retry.`) };
      }
    }
    if (state.phase === 'refreshing') {
      state.roster = { ...state.roster };
      for (const { call, result } of replies) {
        if (call.name === 'heroGetAll' && result?.response) state.roster.heroes = result.response;
        if (call.name === 'getUnitSummary' && call.feature === 'unit' && result?.response) state.roster.units = result.response;
      }
      if (state.roster.heroes && state.roster.units) {
        if (state.roster.units.squads?.some((squad) => squad.heroes?.some((hero) =>
            state.options.heroIds.includes(hero.id ?? hero.heroId)))) {
          return { state: stop(state, 'Selected heroes are already deployed. Queue stopped.') };
        }
        const cap = data.capacityModel(state.options.heroIds, state.roster.heroes,
          cache?.troopCapacityEvidence?.data, settings || state.options.capacitySettings, state.accountId).total;
        const units = data.allocateTroops(state.roster.units, cap);
        state.squad = data.buildSquad(state.options.heroIds, units);
        if (!state.squad) return { state: stop(state, 'No available troops. Refresh the form.') };
        state.roster = null;
        return nextBoss(state, cache, now);
      }
    }
    if (state.phase === 'searching') {
      const reply = replies.find(({ call, result }) => sameCall(call, state.expected[0]) && Array.isArray(result?.response?.mobs));
      if (reply) {
        const won = cache?.experimentalDefeatedBosses?.data || [];
        const targets = reply.result.response.mobs.filter((mob) => mob.mobId &&
          !state.failedBossIds?.includes(mob.mobId) && !state.wonBossIds?.includes(mob.mobId) &&
          !won.some((item) => item.mapId === state.options.mapId && item.mobId === mob.mobId));
        const unique = [...new Map(targets.map((mob) => [mob.mobId, { mobId: mob.mobId }])).values()];
        const selected = !state.started && unique.find((mob) => mob.mobId === state.options.firstMobId);
        state.bossQueue = { ...state.bossQueue,
          queue: selected ? [selected, ...unique.filter((mob) => mob.mobId !== selected.mobId)] : unique };
        if (!state.bossQueue.queue.length) return { state: stop(state, 'No boss found for the selected level.') };
        return nextBoss(state, cache, now);
      }
    }
    if (state.phase === 'creating') {
      const reply = replies.find(({ call, result }) => sameCall(call, state.expected[0]) && result?.response?.rally?.rallyId);
      if (reply) {
        const response = reply.result.response;
        if (!response.squadId || !Number.isFinite(response.rally.plannedStartTime)) return { state: stop(state, 'Incomplete rally confirmation.') };
        state.started++;
        state.phase = 'active'; state.expected = [];
        Object.assign(state.current, { rallyId: response.rally.rallyId, squadId: response.squadId,
          waitUntil: response.rally.plannedStartTime, members: data.rallyMembers(response.rally),
          membersAt: Date.parse(record.timestamp) });
        state.current.memberChecked = !state.options.autoCancel;
        state.wakeAt = Math.max(now, state.current.waitUntil + (state.options.autoCancel ? -20000 : 15000));
        return { state, calls: [{ name: 'getRallyById', feature: 'rally', args: { rallyId: state.current.rallyId } }] };
      }
    }
    if (['active', 'cancelling'].includes(state.phase)) {
      const current = state.current;
      for (const { call, result } of replies) {
        const rally = result?.response?.rally;
        if (call.name === 'getRallyById' && call.args?.rallyId === current.rallyId && rally?.rallyId === current.rallyId) {
          current.members = data.rallyMembers(rally); current.membersAt = Date.parse(record.timestamp);
          if (Number.isFinite(rally.plannedStartTime)) current.waitUntil = rally.plannedStartTime;
        }
        if (call.name === 'cancelRally' && call.args?.rallyId === current.rallyId && result?.response && !result.error) {
          consumeBoss(state, true);
          return issue(state, 'refreshing', rosterCalls(), now);
        }
        // A fresh authoritative snapshot can confirm return only after a matching win.
        if (call.name === 'getMarches' && call.feature === 'march' && current.result === 'win' &&
            Date.parse(record.timestamp) > current.resultAt && result?.response?.marches &&
            !Array.isArray(result.response.marches) && typeof result.response.marches === 'object' &&
            Object.values(result.response.marches).every(Array.isArray) &&
            !Object.values(result.response.marches).some((marches) => marches.some((march) => march.squadId === current.squadId))) current.returned = true;
      }
      if (record?.transport === 'websocket' && record.direction === 'received' && record.encoding === 'utf8' && !record.payloadTruncated && fresh) {
        try {
          const event = JSON.parse(record.payload).result;
          if (event?.type === 'mobRallyAttackResult' && event.body?.rallyId === current.rallyId && event.body?.squadId === current.squadId) {
            const result = event.body.battleResult?.battleResult;
            if (result === 'lose' || result === 'loss' || result === 'defeat') return { state: stop(state, 'Raid lost. Queue stopped.') };
            if (result === 'win') { current.result = 'win'; current.resultAt = Date.parse(record.timestamp); current.memberChecked = true; }
            else return { state: stop(state, 'Unrecognized battle result. Queue stopped.') };
          }
          if (event?.type === 'returnFromMobCompleted' && event.body?.squadId === current.squadId) current.returned = true;
          if (event?.type === 'rallyCancelled' && event.body?.rallyId === current.rallyId) {
            consumeBoss(state, true);
            return issue(state, 'refreshing', rosterCalls(), now);
          }
        } catch {}
      }
      if (current.result === 'win' && current.returned) {
        if (state.phase === 'cancelling') return { state: stop(state, 'Rally finished before cancellation was confirmed. Queue stopped.') };
        state.completed++;
        consumeBoss(state);
        if (state.bossQueue.remain_raid_count === 0) return { state: { ...state, phase: 'complete', wakeAt: null } };
        return issue(state, 'refreshing', rosterCalls(), now);
      }
      if (!record && now >= state.wakeAt) {
        if (now > current.waitUntil + 3600000) return { state: stop(state, 'No confirmed battle result and return within one hour. Check the game.') };
        if (state.phase === 'cancelling') return { state: stop(state, 'Cancellation was not confirmed before departure. Check the game.') };
        if (state.options.autoCancel && !current.memberChecked && now >= current.waitUntil - 10000) {
          current.memberChecked = true;
          if (now >= current.waitUntil - 1000) return { state: stop(state, 'Member check deadline missed. Check the game.') };
          if (!current.members || current.membersAt < current.waitUntil - 25000 || current.members.count < state.options.minMembers) {
            return issue(state, 'cancelling', [{ name: 'cancelRally', feature: 'rally', args: { rallyId: current.rallyId } }],
              now, current.waitUntil - 1000);
          }
        }
        state.wakeAt = current.memberChecked ? now + 15000 : current.waitUntil - 10000;
        return { state, calls: [{ name: 'getMarches', feature: 'march' },
          ...(now < current.waitUntil ? [{ name: 'getRallyById', feature: 'rally', args: { rallyId: current.rallyId } }] : [])] };
      }
    }
    if (!record && now >= state.wakeAt) return { state: stop(state, 'RPC result timed out. No automatic retry.') };
    return { state };
  }
  globalThis.hwaHelperRaidQueue = { start, advance, terminal, stop };
})();
