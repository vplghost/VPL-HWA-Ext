(() => {
  const list = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  function incomingTtl(cache, now) {
    return list(cache.incomingMineAttacks?.data?.attacks).some(attack => attack.impactAt > now) ? 15000 : 60000;
  }
  function key(call) {
    if (call.name === 'getIncomingMarches' && call.feature === 'march') return 'incoming';
    if (call.name === 'getRallyById' && call.feature === 'rally' && typeof call.args?.rallyId === 'string')
      return 'rally:' + call.args.rallyId + ':' + (call.args.mapId || '');
    return null;
  }
  function fresh(cache, call, now, after, version) {
    const account = String(cache.accountStatus?.data?.id);
    if (key(call) === 'incoming') {
      const entry = cache.incomingMineAttacks;
      const at = Date.parse(entry?.updatedAt);
      return String(entry?.data?.accountId) === account && entry.data.snapshotAt > 0 &&
        at <= now && at >= now - incomingTtl(cache, now);
    }
    const data = cache.rallyReadStatus?.data;
    const row = String(data?.accountId) === account ? data.rallies?.[call.args.rallyId] : null;
    if (!row || call.args.mapId && call.args.mapId !== row.mapId) return false;
    return row.at <= now && row.at >= now - 60000 &&
      (Number.isFinite(version) && Number.isFinite(row.version) ? row.version >= version : row.at >= after);
  }
  function plan(previous, cache, calls, now, options = {}) {
    const accountId = cache.accountStatus?.data?.id;
    const state = { accountId: accountId == null ? null : String(accountId), entries: {} };
    if (state.accountId != null && String(previous?.accountId) === state.accountId) {
      for (const [id, row] of Object.entries(previous.entries || {}))
        if (row.pending || now - row.sentAt < 60000) state.entries[id] = { ...row };
    }
    const allowed = [];
    for (const call of calls) {
      const id = key(call);
      if (!id || state.accountId == null) { allowed.push(call); continue; }
      const old = state.entries[id];
      const after = Math.max(options.after ?? now - 5000, old?.after || 0);
      const versions = [options.version, old?.version].filter(Number.isFinite);
      const version = versions.length ? Math.max(...versions) : null;
      if (options.isRallyCreated && old) {
        delete state.entries[id];
      }
      if (!options.isRallyCreated && fresh(cache, call, now, after, version)) { delete state.entries[id]; continue; }
      if (!options.isRallyCreated && old && old.until > now) {
        old.pending ||= id !== 'incoming' && (Number.isFinite(version) && (!Number.isFinite(old.sentVersion) || version > old.sentVersion) ||
          !Number.isFinite(options.version) && after > old.sentAt);
        old.after = after; old.version = version;
        continue;
      }
      allowed.push(call);
      state.entries[id] = { call, tabId: options.tabId, after, version, sentVersion: version, sentAt: now,
        until: now + (id === 'incoming' ? 10000 : 5000), pending: false };
    }
    const rows = Object.entries(state.entries);
    for (const [id] of rows.slice(0, Math.max(0, rows.length - 200))) delete state.entries[id];
    return { state, calls: allowed, wakeAt: wakeAt(state) };
  }
  function wakeAt(state) {
    const times = Object.values(state?.entries || {}).filter(row => row.pending).map(row => row.until);
    return times.length ? Math.min(...times) : null;
  }
  globalThis.hwaHelperWorldRead = { incomingTtl, key, fresh, plan, wakeAt };
})();
