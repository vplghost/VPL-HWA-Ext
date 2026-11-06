(() => {
  const data = globalThis.hwaHelperExperimentalData;
  const terminal = (state) => !state || ['complete', 'stopped'].includes(state.phase);
  const rosterCalls = () => [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }];
  function stop(state, reason) { return { ...state, phase: 'stopped', reason, wakeAt: null }; }
  function issue(state, phase, calls, now, expiresAt = now + 120000) {
    return { state: { ...state, phase, sentAt: now, wakeAt: expiresAt, expected: calls }, calls, expiresAt };
  }
  function start(options, tabId, accountId, now) {
    if (!accountId || !Number.isInteger(tabId) || !options?.mapId ||
        !Number.isFinite(options.center?.x) || !Number.isFinite(options.center?.y) ||
        !data.bossConfigId(options.level) || !data.rallyWaitOptions.includes(options.waitSeconds) ||
        !Number.isInteger(options.count) || options.count < 1 || options.count > 100 ||
        !Number.isInteger(options.minMembers) || options.minMembers < 1 || options.minMembers > 6 ||
        options.heroIds?.length !== 5 || new Set(options.heroIds).size !== 5) return null;
    return issue({ id: `${now}:${tabId}`, tabId, accountId, options, started: 0, completed: 0,
      phase: 'refreshing', current: null }, 'refreshing', rosterCalls(), now);
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
  function advance(previous, record, cache, now) {
    if (terminal(previous)) return { state: previous };
    let state = { ...previous, current: previous.current ? { ...previous.current } : null };
    if (cache?.accountStatus?.data?.id != null && String(cache.accountStatus.data.id) !== String(state.accountId)) {
      return { state: stop(state, 'Game account changed.') };
    }
    const fresh = record && Date.parse(record.timestamp) >= state.sentAt;
    const replies = fresh ? responses(record) : [];
    for (const { call, result } of replies) {
      if (result?.error && state.expected?.some((expected) => sameCall(call, expected))) {
        return { state: stop(state, `${call.name} failed. No automatic retry.`) };
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
        const cap = data.squadCapacity(state.options.heroIds, state.roster.heroes,
          state.options.capacities, state.options.baseTroops);
        const units = data.allocateTroops(state.roster.units, cap);
        state.squad = data.buildSquad(state.options.heroIds, units);
        if (!state.squad) return { state: stop(state, 'Missing verified hero capacity or available troops. Refresh the form.') };
        state.roster = null;
        return issue(state, 'searching', [{ name: 'searchMob', feature: 'mob', args: {
          mapId: state.options.mapId, center: state.options.center, mobType: 'rally',
          mobConfigIds: [data.bossConfigId(state.options.level)] } }], now);
      }
    }
    if (state.phase === 'searching') {
      const reply = replies.find(({ call, result }) => sameCall(call, state.expected[0]) && Array.isArray(result?.response?.mobs));
      if (reply) {
        const won = cache?.experimentalDefeatedBosses?.data || [];
        const targets = reply.result.response.mobs.filter((mob) => mob.mobId &&
          !won.some((item) => item.mapId === state.options.mapId && item.mobId === mob.mobId));
        const target = targets.find((mob) => !state.started && mob.mobId === state.options.firstMobId) || targets[0];
        if (!target) return { state: stop(state, 'No boss found for the selected level.') };
        state.current = { mobId: target.mobId, mapId: state.options.mapId };
        return issue(state, 'creating', [data.buildRallyCall(state.options.mapId, target.mobId, state.squad, state.options.waitSeconds)], now);
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
        state.wakeAt = Math.max(now, state.current.waitUntil - 20000);
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
          return { state: stop(state, 'Rally cancelled: minimum member threshold was not met.') };
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
          if (event?.type === 'rallyCancelled' && event.body?.rallyId === current.rallyId) return { state: stop(state, 'Rally cancelled in game.') };
        } catch {}
      }
      if (current.result === 'win' && current.returned) {
        if (state.phase === 'cancelling') return { state: stop(state, 'Rally finished before cancellation was confirmed. Queue stopped.') };
        state.completed++;
        if (state.completed >= state.options.count) return { state: { ...state, phase: 'complete', wakeAt: null } };
        state.current = null;
        return issue(state, 'refreshing', rosterCalls(), now);
      }
      if (!record && now >= state.wakeAt) {
        if (now > current.waitUntil + 3600000) return { state: stop(state, 'No confirmed battle result and return within one hour. Check the game.') };
        if (state.phase === 'cancelling') return { state: stop(state, 'Cancellation was not confirmed before departure. Check the game.') };
        if (!current.memberChecked && now >= current.waitUntil - 10000) {
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
