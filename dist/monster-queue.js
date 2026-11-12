(() => {
  const data = globalThis.hwaHelperExperimentalData;
  const terminal = (state) => !state || ['complete', 'stopped'].includes(state.phase);
  const rosterCalls = () => [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }];
  const cost = 10;
  function safeList(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return Object.values(raw);
    return [];
  }
  const stop = (state, reason) => ({ ...state, phase: 'stopped', reason, wakeAt: null, expected: [] });
  const issue = (state, phase, calls, now) => ({ state: { ...state, phase, expected: calls,
    sentAt: now, wakeAt: now + 120000 }, calls, expiresAt: now + 120000 });
  const energyAt = (cache, now) => {
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
  };
  const sameValue = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
  };
  const sameCall = (a, b) => a.name === b.name && (a.feature || '') === (b.feature || '') &&
    sameValue(a.args || {}, b.args || {});
  function replies(record) {
    if (record?.method !== 'POST' || record.status !== 200 || record.requestBodyTruncated ||
        record.responseBodyTruncated || record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc') return [];
    try {
      const request = JSON.parse(record.requestBody), response = JSON.parse(record.responseBody);
      return (request.calls || []).map((call) => ({ call,
        result: response.results?.find((item) => item.ident === call.ident)?.result }));
    } catch { return []; }
  }
  function search(state, now) {
    return issue(state, 'searching', [{ name: 'searchMob', feature: 'mob', args: {
      mapId: state.options.mapId, center: state.options.center,
      mobType: 'solo', mobConfigIds: data.soloMonsterConfigIds(state.options.level)
    } }], now);
  }
  function nextAttack(state, cache, now) {
    if (state.completed >= state.options.count) return { state: { ...state,
      phase: 'complete', wakeAt: null, expected: [] } };
    if (!state.targets.length) return search(state, now);
    const energy = energyAt(cache, now);
    if (Number.isFinite(energy) && energy < cost) return { state: stop(state,
      `Not enough World Energy for a monster attack (need ${cost}).`) };
    const target = state.targets[0];
    const squad = state.squad;
    if (!squad) return { state: stop(state, 'No available team or troops.') };
    state.current = { mobId: target.mobId, mobConfigId: target.mobConfigId || null,
      mapId: state.options.mapId };
    return issue(state, 'attacking', [{ name: 'attackMob', feature: 'mob', args: {
      mapId: state.options.mapId, mobId: target.mobId, squad
    } }], now);
  }
  function start(options, tabId, accountId, now, cache, settings) {
    if (!accountId || !Number.isInteger(tabId) || !options?.mapId ||
        !Number.isFinite(options.center?.x) || !Number.isFinite(options.center?.y) ||
        !data.soloMonsterConfigIds(options.level) || !Number.isInteger(options.count) ||
        options.count < 1 || options.count > 100 || options.heroIds?.length !== 5 ||
        new Set(options.heroIds).size !== 5 ||
        (options.maxTroops != null && (!Number.isSafeInteger(options.maxTroops) || options.maxTroops <= 0))) return null;
    const search = cache?.experimentalSoloSearch?.data;
    const configs = data.soloMonsterConfigIds(options.level);
    const mobs = safeList(search?.mobs);
    if (search?.mapId !== options.mapId || !sameValue(search.mobConfigIds, configs) ||
        !mobs.some((mob) => mob?.mobId === options.firstMobId)) return null;
    const state = { id: `monster:${now}:${tabId}`, tabId, accountId, options, started: 0,
      completed: 0, phase: 'refreshing', current: null, targets: [], attackedMobIds: [], recentResults: [] };
    const first = mobs.find((mob) => mob?.mobId === options.firstMobId);
    state.targets = [first, ...mobs.filter((mob) => mob?.mobId !== first?.mobId)]
      .filter((mob) => typeof mob?.mobId === 'string');
    return refresh(state, cache, now, settings);
  }
  function refresh(state, cache, now, settings) {
    const heroes = cache?.heroGetAll?.data;
    const summary = cache?.['getUnitSummary:unit']?.data;
    if (!heroes || !summary) return issue(state, 'refreshing', rosterCalls(), now);
    let heroIds = state.options.heroIds;
    const available = data.availableHeroIds(heroes, summary, cache?.marchStatus?.data?.marches);
    if (state.options.teamId === 'weakest') heroIds = data.lowestPowerHeroes(heroes, available);
    if (heroIds.length !== 5 || heroIds.some((id) => !available.includes(id))) {
      return { state: stop(state, 'Selected heroes are deployed or unavailable.') };
    }
    const cap = data.capacityModel(heroIds, heroes, cache?.troopCapacityEvidence?.data,
      settings, state.accountId).total;
    state.squad = data.buildSquad(heroIds, data.allocateTroops(summary,
      data.teamTroopCapacity(cap, state.options.maxTroops)));
    if (!state.squad) return { state: stop(state, 'No available troops. Refresh the game roster.') };
    return nextAttack(state, cache, now);
  }
  function advance(previous, record, cache, now, settings) {
    if (terminal(previous)) return { state: previous };
    const state = { ...previous, current: previous.current ? { ...previous.current } : null,
      targets: [...(previous.targets || [])], attackedMobIds: [...(previous.attackedMobIds || [])] };
    if (cache?.accountStatus?.data?.id != null && String(cache.accountStatus.data.id) !== String(state.accountId)) {
      return { state: stop(state, 'Game account changed.') };
    }
    const fresh = record && Date.parse(record.timestamp) >= state.sentAt;
    const responses = fresh ? replies(record) : [];
    for (const { call, result } of responses) {
      if (result?.error && state.expected?.some((expected) => sameCall(call, expected))) {
        return { state: stop(state, `Game rejected ${call.name}. Queue stopped.`) };
      }
    }
    if (state.phase === 'refreshing') {
      if (state.expected?.length) {
        state.roster ||= {};
        for (const { call, result } of responses) {
          if (call.name === 'heroGetAll' && result?.response) state.roster.heroes = result.response;
          if (call.name === 'getUnitSummary' && call.feature === 'unit' && result?.response) state.roster.units = result.response;
        }
        if (state.roster.heroes && state.roster.units) {
          const freshCache = { ...cache, heroGetAll: { data: state.roster.heroes },
            'getUnitSummary:unit': { data: state.roster.units } };
          state.roster = null;
          return refresh(state, freshCache, now, settings);
        }
      }
    } else if (state.phase === 'searching') {
      const match = responses.find(({ call, result }) => sameCall(call, state.expected[0]) &&
        (Array.isArray(result?.response?.mobs) || (result?.response?.mobs && typeof result.response.mobs === 'object')));
      if (match) {
        const replyMobs = safeList(match.result?.response?.mobs);
        state.targets = [...new Map(replyMobs.filter((mob) =>
          typeof mob?.mobId === 'string' && !state.attackedMobIds.includes(mob.mobId))
          .map((mob) => [mob.mobId, mob])).values()];
        if (!state.targets.length) return { state: stop(state, 'No new monster found for this level.') };
        return refresh(state, cache, now, settings);
      }
    } else if (state.phase === 'attacking') {
      const match = responses.find(({ call, result }) => sameCall(call, state.expected[0]) &&
        result?.response?.squadId && result.response.route);
      if (match) {
        const route = match.result.response.route;
        state.current = { ...state.current, squadId: match.result.response.squadId,
          routeId: route.routeId, arrivalAt: Number.isFinite(route.startedAt) &&
            Number.isFinite(route.durationMs ?? route.duration) ?
            route.startedAt + (route.durationMs ?? route.duration) : null };
        state.started++;
        state.phase = 'active'; state.expected = [];
        state.wakeAt = now + 15000;
        return { state };
      }
    } else if (state.phase === 'active') {
      const current = state.current;
      if (fresh && record.transport === 'websocket' && record.direction === 'received' &&
          record.encoding === 'utf8' && !record.payloadTruncated) {
        try {
          const event = JSON.parse(record.payload)?.result;
          if (['mobSoloAttackResult', 'mobSingleAttackResult'].includes(event?.type) &&
              event.body?.squadId === current.squadId && event.body?.mobId === current.mobId && !current.result) {
            const outcome = event.body.battleResult?.battleResult;
            state.recentResults = [{ mobId: current.mobId, mobConfigId: event.body.mobConfigId,
              result: outcome || 'unknown', at: Date.parse(record.timestamp) },
              ...(state.recentResults || [])].slice(0, 10);
            if (outcome === 'win') {
              current.result = 'win'; current.resultAt = Date.parse(record.timestamp);
              current.mobConfigId = event.body.mobConfigId;
              const route = event.body.routeToOutpost;
              current.returnAt = Number.isFinite(route?.startedAt) &&
                Number.isFinite(route?.durationMs ?? route?.duration) ?
                route.startedAt + (route.durationMs ?? route.duration) : null;
            } else return { state: stop(state, outcome === 'lose' || outcome === 'loss' || outcome === 'defeat' ?
              'Monster attack lost. Queue stopped.' : 'Unrecognized monster result. Queue stopped.') };
          }
          if (event?.type === 'returnFromMobCompleted' &&
              event.body?.squadId === current.squadId) current.returned = true;
        } catch {}
      }
      for (const { call, result } of responses) {
        if (call.name === 'getMarches' && call.feature === 'march' && current.result === 'win' &&
            Date.parse(record.timestamp) > current.resultAt && result?.response?.marches &&
            !Array.isArray(result.response.marches) && Object.values(result.response.marches).every(Array.isArray) &&
            !Object.values(result.response.marches).some((marches) => marches.some((march) => march.squadId === current.squadId))) {
          current.returned = true;
        }
      }
      if (current.result === 'win' && current.returned) {
        state.completed++;
        state.attackedMobIds.push(current.mobId);
        state.targets = state.targets.filter((target) => target.mobId !== current.mobId);
        state.current = null;
        if (state.completed >= state.options.count) return { state: { ...state,
          phase: 'complete', wakeAt: null, expected: [] } };
        return issue(state, 'refreshing', rosterCalls(), now);
      }
      if (!record && now >= state.wakeAt) {
        if (now - state.sentAt > 3600000) return { state: stop(state,
          'No confirmed monster result and return within one hour. Check the game.') };
        state.wakeAt = now + 15000;
        return { state, calls: [{ name: 'getMarches', feature: 'march' }] };
      }
    }
    if (!record && now >= state.wakeAt && ['refreshing', 'searching', 'attacking'].includes(state.phase)) {
      return { state: stop(state, 'RPC result timed out. No automatic retry.') };
    }
    return { state };
  }
  const confirmedWins = (state) => (state?.completed || 0) + (state?.current?.result === 'win' ? 1 : 0);
  globalThis.hwaHelperMonsterQueue = { start, advance, terminal, stop, confirmedWins };
})();
