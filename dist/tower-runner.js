(() => {
  const planner = globalThis.hwaHelperTowerAutomation;
  const terminal = (state) => !state || ['complete', 'stopped'].includes(state.phase);
  const stop = (state, reason) => ({ ...state, phase: 'stopped', reason, wakeAt: null });
  const issue = (state, phase, call, now) => ({
    state: { ...state, phase, expected: call, sentAt: now, wakeAt: now + 120000 },
    calls: [call], expiresAt: now + 120000
  });

  function next(state, cache, now) {
    const decision = planner.plan(cache, state.buffPriority);
    if (decision.kind === 'complete') return { state: { ...state, phase: 'complete', wakeAt: null } };
    if (decision.kind === 'stop' || decision.kind === 'need-snapshot') {
      return { state: stop(state, decision.reason || 'Tower snapshot is missing. Open Tower in game.') };
    }
    state.floor = decision.floor;
    state.room = decision.room;
    if (decision.kind === 'battle') {
      return issue(state, 'starting-battle', { name: 'magicTower_startBattle',
        args: { heroes: decision.team } }, now);
    }
    return issue(state, 'acting', decision.call, now);
  }

  function start(cache, settings, tabId, now) {
    const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
    if (!accountId || !Number.isInteger(tabId)) return null;
    const session = cache.towerSession;
    const team = cache.teamGetAll?.data?.magicTower;
    if (!Array.isArray(team) || team.length !== 5 || team.some((id) => !Number.isInteger(id)) ||
        !session || !Number.isFinite(Date.parse(session.updatedAt || '')) ||
        now - Date.parse(session.updatedAt) > 300000 ||
        cache.towerStatus?.data?.isCleared || session.data?.completed) return null;
    return next({ id: `${now}:${tabId}`, tabId, accountId, phase: 'planning',
      buffPriority: Array.isArray(settings?.buffPriority) ? settings.buffPriority : [],
      startedAt: now }, cache, now);
  }

  function responses(record) {
    if (record?.method !== 'POST' || record.status !== 200 || record.requestBodyTruncated ||
        record.responseBodyTruncated || record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc') return [];
    try {
      const request = JSON.parse(record.requestBody), response = JSON.parse(record.responseBody);
      return (request.calls || []).map((call) => ({ call,
        result: response.results?.find((item) => item.ident === call.ident)?.result }));
    } catch { return []; }
  }
  const sameCall = (a, b) => a?.name === b?.name &&
    JSON.stringify(a?.args || {}) === JSON.stringify(b?.args || {});

  function advance(previous, record, cache, now) {
    if (terminal(previous)) return { state: previous };
    const state = { ...previous };
    const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
    if (accountId != null && String(accountId) !== String(state.accountId)) {
      return { state: stop(state, 'Game account changed.') };
    }
    if (!record && now >= state.wakeAt) return { state: stop(state,
      state.phase === 'waiting-battle' ? 'Tower battle did not finish in five minutes.' :
        'Tower RPC timed out. No automatic retry.') };
    if (!record || Date.parse(record.timestamp) < state.sentAt) return { state };
    const replies = responses(record);
    if (state.phase === 'waiting-battle') {
      const ended = replies.find(({ call }) => call.name === 'magicTower_endBattle');
      if (!ended) return { state };
      if (ended.result?.error || ended.call.args?.result?.win !== true) {
        return { state: stop(state, 'Tower battle was lost or rejected.') };
      }
      const heroes = ended.result?.response?.userHeroStates;
      if (!heroes || Object.values(heroes).some((hero) => hero?.isDead || hero?.hp <= 0)) {
        return { state: stop(state, 'Tower hero state is missing or a hero died.') };
      }
      return next(state, cache, now);
    }
    const reply = replies.find(({ call }) => sameCall(call, state.expected));
    if (!reply) return { state };
    if (reply.result?.error || reply.result?.response == null) {
      return { state: stop(state, `${state.expected.name} failed. Queue stopped.`) };
    }
    if (state.phase === 'starting-battle') {
      state.phase = 'waiting-battle'; state.expected = null;
      state.wakeAt = now + 300000;
      return { state };
    }
    return next(state, cache, now);
  }

  globalThis.hwaHelperTowerRunner = { start, advance, stop, terminal };
})();
