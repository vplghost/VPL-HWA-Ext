(() => {
  const list = raw => Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const order = ['food', 'iron', 'stone', 'wood'];
  const gathering = march => Boolean(march?.mineId) && ['interactionWithTarget', 'gathering'].includes(march.stage);
  const typeOf = (march, cache) => globalThis.hwaHelperSmartGatherData?.mines[march.mineConfigId ?? cache.mineMap?.[march.mineId]?.mineConfigId]?.type || cache.mineMap?.[march.mineId]?.mineType || march.kind;
  function context(cache) {
    const raw = cache.experimentalMapContext?.data || cache.experimentalMineSearch?.data || {};
    return { mapId: raw.mapId, center: raw.outposts?.[cache.accountStatus?.data?.id] };
  }
  function fresh(entry, now) {
    const at = Date.parse(entry?.updatedAt);
    return finite(at) && at <= now && now - at <= 60000;
  }
  function returnMs(march, cache) {
    const from = march.targetCoordinates || cache.mineMap?.[march.mineId]?.coordinates;
    const to = context(cache).center, speed = globalThis.hwaHelperRouteSpeeds?.returnToOutpost;
    return finite(from?.x) && finite(from?.y) && finite(to?.x) && finite(to?.y) && speed > 0
      ? Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 10000 / speed) : null;
  }
  function collectedSince(march, cache, since, now) {
    const plan = cache.gatheringStatus?.data?.plans?.[march.squadId] || list(cache.gatheringStatus?.data?.gatherings).find(row => row.squadId === march.squadId && row.mineId === march.mineId);
    const start = plan?.startedAt ?? march.gatheringStartedAt;
    const duration = plan?.plannedDurationMs ?? march.gatheringDurationMs;
    const amount = plan?.plannedGatheredResourceAmount ?? march.gatheringTotalAmount;
    const stop = march.stage === 'returnToOutpost' || march.kind === 'return' ? march.gatheringStoppedAt : now;
    if (!finite(start) || !finite(duration) || duration <= 0 || !finite(amount) || !finite(stop)) return null;
    const ratio = time => Math.max(0, Math.min(1, (time - start) / duration));
    return Math.max(0, Math.floor(amount * ratio(stop)) - Math.ceil(amount * ratio(since)));
  }
  function activeQueue(stored) {
    return [stored.raidQueue, stored.monsterQueue].find(q => q && !['complete', 'stopped'].includes(q.phase));
  }
  function recallForRally(cache, stored, rally, now) {
    const marches = list(cache.marchStatus?.data?.marches);
    if (marches.length < globalThis.hwaHelperAutoGather.normalizeAutoGatherSettings(stored.autoGatherSettings).maxMarches) return null;
    if (!finite(rally.plannedStartTime) || rally.route) return null;
    return marches.filter(gathering).map(march => ({ march, ms: returnMs(march, cache) }))
      .filter(row => finite(row.ms) && row.ms < 29000 && now + row.ms + 3000 < rally.plannedStartTime)
      .sort((a, b) => a.ms - b.ms)[0] || null;
  }
  function recallForQueue(cache, settings, options, now) {
    const marches = list(cache.marchStatus?.data?.marches);
    const summary = cache['getUnitSummary:unit']?.data;
    const available = globalThis.hwaHelperExperimentalData.availableHeroIds(cache.heroGetAll?.data, summary, marches);
    const needed = options.teamId === 'weakest' ? [] : (options.heroIds || []).filter(id => !available.includes(id));
    if (marches.length < settings.maxMarches && !needed.length) return null;
    const eligible = marches.filter(gathering).filter(m => {
      const squad = list(summary?.squads).find(s => (s.id ?? s.squadId) === m.squadId);
      const ids = list(squad?.heroes).map(h => h.id ?? h.heroId);
      return needed.every(id => ids.includes(id));
    }).map(march => ({ march, ms: returnMs(march, cache) })).filter(row => finite(row.ms))
      .sort((a, b) => a.ms - b.ms);
    return { march: eligible[0]?.march || null, reason: 'No gathering squad with known coordinates can release the required slot/heroes' };
  }
  function nearestPlan(cache, state, type, now) {
    const map = context(cache), data = globalThis.hwaHelperExperimentalData;
    if (!map.mapId || !finite(map.center?.x) || !finite(map.center?.y)) return { action: 'wait', reason: 'Own outpost coordinates unavailable; open the world map to refresh' };
    const sameCenter = state?.nearest?.center?.x === map.center?.x && state?.nearest?.center?.y === map.center?.y;
    const nearest = state?.nearest?.type === type && state.nearest.mapId === map.mapId && sameCenter
      ? state.nearest : { mapId: map.mapId, center: map.center, type, levels: [], candidates: [], startedAt: now };
    const level = Array.from({ length: 10 }, (_, i) => i + 1).find(level => !nearest.levels.includes(level));
    if (level) return { action: 'search', reason: 'Finding nearest ' + type + ' mine: level ' + level + '/10', nearest,
      call: data.buildMineSearchCall(map.mapId, map.center, type, level), pending: { purpose: 'nearestSearch', level, configId: data.mineConfigId(type, level) } };
    if (nearest.selected && now - nearest.selected.checkedAt < 30000) return { action: 'target', mine: nearest.selected,
      type, level: globalThis.hwaHelperSmartGatherData.mines[nearest.selected.configId].level };
    const active = new Set(list(cache.marchStatus?.data?.marches).map(m => m.mineId).filter(Boolean));
    const candidate = nearest.candidates.filter(m => !active.has(m.mineId)).sort((a, b) =>
      Math.hypot(a.coordinates.x - map.center.x, a.coordinates.y - map.center.y) -
      Math.hypot(b.coordinates.x - map.center.x, b.coordinates.y - map.center.y))[0];
    if (!candidate) return { action: 'wait', reason: 'No eligible nearest mine; restart Smart gathering to search again' };
    return { action: 'probe', reason: 'Checking nearest mine · estimated duration must exceed 1h', nearest,
      call: { name: 'getMineById', feature: 'mine', args: { mineId: candidate.mineId } },
      pending: { purpose: 'nearestProbe', mine: candidate } };
  }
  function resumePlan(cache, state, now = Date.now()) {
    const mapId = context(cache).mapId;
    const mine = list(state?.interrupted).find(row => row.mapId === mapId);
    if (!mine) return null;
    if (list(cache.marchStatus?.data?.marches).some(m => m.mineId === mine.mineId && m.stage !== 'returnToOutpost' && m.kind !== 'return'))
      return { action: 'wait', reason: 'Interrupted mine already has a gathering squad' };
    const info = globalThis.hwaHelperSmartGatherData?.mines[mine.configId];
    if (!info) return { action: 'wait', reason: 'Interrupted mine configuration unavailable' };
    if (state.resumeCandidate?.mineId === mine.mineId && state.resumeCandidate.checkedAt > now - 30000)
      return { action: 'target', mine, type: info.type, level: info.level };
    return { action: 'probe', reason: 'Checking interrupted mine before returning', call: { name: 'getMineById', feature: 'mine', args: { mineId: mine.mineId } }, pending: { purpose: 'resume', mine } };
  }
  function dailyPlan(cache, settings, now, state = {}) {
    const entry = cache['getDailyQuests:quest'], reset = cache.questResetStatus?.data?.nextDayAt;
    const at = Date.parse(entry?.updatedAt), accountAt = Date.parse(cache.accountStatus?.updatedAt);
    if (!finite(reset) || !finite(at)) return { action: 'refresh', reason: 'Waiting for daily quests and server reset time' };
    const next = reset > now ? reset : reset + (Math.floor((now - reset) / 86400000) + 1) * 86400000;
    const dayStart = next - 86400000;
    if (at < dayStart || at > now || finite(accountAt) && at < accountAt || !Array.isArray(entry.data?.quests)) return { action: 'refresh', reason: 'Waiting for current-account daily quest snapshot' };
    const marches = list(cache.marchStatus?.data?.marches);
    if (state.dailyBaseline?.dayStart !== dayStart) state.dailyBaseline = { dayStart, resources: {} };
    const baselines = state.dailyBaseline.resources;
    const rows = [];
    for (const type of order) {
      const def = globalThis.hwaHelperSmartGatherData?.daily[type];
      if (!def) return { action: 'wait', reason: 'Verified daily chain metadata unavailable' };
      const found = def.steps.map(step => ({ step, quest: entry.data.quests.find(q => q.id === step.id) })).filter(x => x.quest);
      if (!found.length) continue; // locked chains are absent from authoritative daily snapshot
      const current = found.at(-1), progress = current.quest.progress;
      if (!finite(progress) || progress < 0) return { action: 'wait', reason: `Unknown ${type} daily progress` };
      const finished = current.step.id === def.steps.at(-1).id && ['completed', 'claimed', 'rewarded'].includes(current.quest.state);
      const squads = marches.filter(m => typeOf(m, cache) === type);
      const target = Math.ceil(def.target * 102 / 100);
      if (!baselines[type] || baselines[type].progress !== progress) baselines[type] = { progress, since: at };
      const increments = squads.map(m => collectedSince(m, cache, Math.max(baselines[type].since, dayStart), now));
      const estimated = progress + increments.reduce((sum, n) => sum + (n ?? 0), 0);
      rows.push({ type, target, progress, estimated, done: finished || estimated >= target, squads });
    }
    const unserved = rows.find(row => !row.done && !row.squads.some(m => m.stage !== 'returnToOutpost' && m.kind !== 'return'));
    if (unserved) {
      const complete = rows.filter(row => row.done).flatMap(row => row.squads).filter(gathering)
        .sort((a, b) => (returnMs(a, cache) ?? Infinity) - (returnMs(b, cache) ?? Infinity));
      if (complete.length) return { action: 'recall', march: complete[0], reason: `Daily target reached; switching to ${unserved.type}`, rows };
      return { action: 'target', type: unserved.type, reason: `Daily ${unserved.type}: ${Math.floor(unserved.estimated)}/${unserved.target}`, rows };
    }
    if (rows.some(row => !row.done)) return { action: 'wait', reason: 'Daily resource squads already gathering', rows };
    const last = order.indexOf(settings.lastAutoMineType);
    const rotating = [...order.slice(last + 1), ...order.slice(0, last + 1)];
    const type = rotating.find(type => !marches.some(m => typeOf(m, cache) === type && m.stage !== 'returnToOutpost' && m.kind !== 'return'));
    return type ? { action: 'target', type, reason: 'Daily chains covered; resource rotation', rows } : { action: 'wait', reason: 'All resource types already gathering', rows };
  }
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  function matches(a, b) { return a?.name === b?.name && a?.feature === b?.feature && equal(a?.args || {}, b?.args || {}); }
  function replies(record) {
    if (record?.method !== 'POST' || record.status !== 200 || record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' || record.requestBodyTruncated || record.responseBodyTruncated) return [];
    try {
      const req = JSON.parse(record.requestBody), res = JSON.parse(record.responseBody);
      return (req.calls || []).map(call => ({ call, result: res.results?.find(row => row.ident === call.ident)?.result }));
    } catch { return []; }
  }
  function sync(raw, record, cache, now) {
    const accountId = cache.accountStatus?.data?.id;
    const state = raw && accountId != null && String(raw.accountId) === String(accountId) ? structuredClone(raw) : { accountId, interrupted: [] };
    const pending = state.pending;
    if (!pending) return state;
    const reply = Date.parse(record?.timestamp) >= pending.sentAt ? replies(record).find(row => matches(row.call, pending.call)) : null;
    if (reply && pending.purpose === 'nearestSearch' && !reply.result?.error && Array.isArray(reply.result?.response?.mines)) {
      const nearest = state.nearest;
      if (nearest) {
        nearest.levels = [...new Set([...nearest.levels, pending.level])];
        const rows = reply.result.response.mines.filter(m => m?.mineId && finite(m.coordinates?.x) && finite(m.coordinates?.y))
          .slice(0, 100).map(m => ({ mineId: m.mineId, coordinates: m.coordinates, configId: pending.configId }));
        nearest.candidates = [...new Map([...nearest.candidates, ...rows].map(m => [m.mineId, m])).values()];
      }
      state.pending = null;
      return state;
    }
    if (reply && pending.purpose === 'nearestSearch' && !reply.result?.error) {
      state.pending = null; state.error = 'Mine search returned no usable mine list; refresh game and restart Smart gathering';
      return state;
    }
    if (reply && pending.purpose === 'nearestProbe') {
      if (!state.nearest) { state.pending = null; return state; }
      const amount = reply.result?.response?.resourceAmount;
      const info = globalThis.hwaHelperSmartGatherData?.mines[pending.mine.configId];
      const duration = finite(amount) && info?.speedPerMinute > 0 ? amount / info.speedPerMinute * 60 : null;
      if (!reply.result?.error && !reply.result?.response?.error && reply.result?.response?.mineId === pending.mine.mineId && duration > 3600) {
        state.nearest.selected = { ...pending.mine, checkedAt: now, estimatedSeconds: duration };
      } else {
        state.nearest.candidates = state.nearest.candidates.filter(m => m.mineId !== pending.mine.mineId);
        state.nearest.selected = null;
      }
      state.pending = null;
      return state;
    }
    if (reply && pending.purpose === 'resume') {
      const amount = reply.result?.response?.resourceAmount;
      if (!reply.result?.error && !reply.result?.response?.error && finite(amount) && amount > 0 && reply.result.response.mineId === pending.mine.mineId) {
        state.resumeCandidate = { mineId: pending.mine.mineId, checkedAt: now };
      } else {
        state.interrupted = list(state.interrupted).filter(m => m.mineId !== pending.mine.mineId);
        state.resumeCandidate = null;
      }
      state.pending = null;
      return state;
    }
    if (reply && pending.call.name === 'joinRally') {
      const squadId = reply.result?.response?.squadId;
      if (!reply.result?.error && !reply.result?.response?.error && squadId) {
        state.reservation = { type: 'joinedRally', rallyId: pending.call.args.rallyId, squadId, confirmedAt: Date.parse(record.timestamp) };
        state.pending = null;
      } else if (reply.result?.error || reply.result?.response?.error) {
        state.reservation = null; state.pending = null; state.notice = { at: now, message: 'Rally join rejected; resuming interrupted gathering' };
      }
      return state;
    }
    if (reply?.result?.error || reply?.result?.response?.error) {
      state.pending = null; state.error = `${pending.call.name} rejected by game; restart Smart gathering to retry`;
    } else if (reply && Object.hasOwn(reply.result || {}, 'response')) {
      const response = reply.result.response;
      if (pending.call.name === 'stopMineGathering' && response?.squadId === pending.call.args.squadId && response.route) {
        if (pending.mine && !list(state.interrupted).some(m => m.mineId === pending.mine.mineId))
          state.interrupted = [...list(state.interrupted), pending.mine].slice(-20);
        state.pending = { ...pending, phase: 'returning', confirmedAt: Date.parse(record.timestamp), returnAt: response.route.startedAt + (response.route.durationMs ?? response.route.duration) };
      } else if (pending.call.name === 'attackMine' && response?.squadId && response.route) {
        if (pending.resumeMineId) {
          state.interrupted = list(state.interrupted).filter(m => m.mineId !== pending.resumeMineId);
          state.resumeCandidate = null;
        }
        if (state.nearest?.selected?.mineId === pending.call.args.mineId) {
          state.nearest.candidates = state.nearest.candidates.filter(m => m.mineId !== pending.call.args.mineId);
          state.nearest.selected = null;
        }
        if (pending.mineType) state.lastAutoMineType = pending.mineType;
        state.pending = { ...pending, phase: 'refresh', squadId: response.squadId, confirmedAt: Date.parse(record.timestamp) };
      } else if (!['stopMineGathering', 'attackMine'].includes(pending.call.name)) state.pending = null;
    }
    const wait = state.pending;
    if (wait?.phase === 'returning' || wait?.phase === 'refresh') {
      const marchFresh = Date.parse(cache.marchStatus?.updatedAt) >= wait.confirmedAt;
      const unitsFresh = Date.parse(cache['getUnitSummary:unit']?.updatedAt) >= wait.confirmedAt;
      const squadId = wait.squadId ?? wait.call.args.squadId;
      const exists = list(cache.marchStatus?.data?.marches).some(m => m.squadId === squadId);
      const deployed = list(cache['getUnitSummary:unit']?.data?.squads).some(s => (s.squadId ?? s.id) === squadId);
      if (marchFresh && unitsFresh && (wait.phase === 'returning' ? !exists && !deployed : exists)) state.pending = null;
    }
    if (state.pending && now - (state.pending.returnAt || state.pending.sentAt) > 120000) {
      state.pending = null; state.error = 'Smart gathering confirmation timed out; refresh game and restart Smart gathering';
    }
    return state;
  }
  globalThis.hwaHelperSmartGather = { list, finite, fresh, order, gathering, typeOf, context, returnMs, collectedSince, activeQueue, recallForRally, recallForQueue, nearestPlan, resumePlan, dailyPlan, replies, sync };
})();
