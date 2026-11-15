(() => {
  const list = raw => Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const reportTypes = ['soloMobAttackResult', 'rallyMobAttackResult', 'rallyCancelled', 'mineGatheringResult',
    'outpostScoutResult', 'outpostAttackResult', 'outpostScoutDenied', 'mineAttackResult', 'mineDefendResult',
    'rallyMemberKicked', 'mineScoutResult', 'presidentAssign', 'outpostAttackDenied'];
  const flag = value => value === true || value === 1 || value === '1';
  const id = value => (typeof value === 'string' || typeof value === 'number') && /^[1-9]\d*$/.test(String(value));
  function expiry(row, kind = 'letter') {
    const value = Number(kind === 'report' ? row?.expiresAt : row?.availableUntil);
    return Number.isFinite(value) && value > 0 ? value * (kind === 'report' ? 1 : 1000) : null;
  }
  const expired = (row, kind, now = Date.now()) => expiry(row, kind) != null && expiry(row, kind) <= now;
  function rewards(raw) {
    const result = [];
    const add = (type, resourceId, rawAmount) => {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0 || !type) return;
      const key = type === 'stamina' ? 'energy' : resourceId == null ? type : `${type}:${resourceId}`;
      result.push({ key: 'resource:' + key, amount });
    };
    if (Array.isArray(raw)) for (const item of raw) add(item?.type, item?.id, item?.amount ?? item?.quantity ?? item?.count);
    else if (raw && typeof raw === 'object') for (const [type, value] of Object.entries(raw)) {
      if (value && typeof value === 'object') for (const [resourceId, amount] of Object.entries(value)) add(type, resourceId, amount);
      else add(type, null, value);
    }
    return result;
  }
  const letterReward = row => row?.reward ?? row?.q_reward ?? row?.items;
  const unclaimed = row => row && !flag(row.deleted) && !flag(row.claimed) && !flag(row.rewardReceived) && !flag(row.rewardClaimed) && rewards(letterReward(row)).length > 0;
  function rows(cache, now = Date.now()) {
    const status = cache.mailStatus?.data || {}, account = cache.accountStatus?.data?.id;
    if (status.accountId != null && account != null && String(status.accountId) !== String(account)) return { letters: [], reports: [], scoped: false };
    const scoped = account != null && String(status.accountId) === String(account);
    const letters = list(status.letters ?? cache.mailGetAll?.data?.letters ?? cache.mailGetAll?.letters)
      .filter(row => row && !flag(row.deleted) && !expired(row, 'letter', now)).map(row => ({ ...row,
        id: row.id ?? row.letterId, expiresAtMs: expiry(row), rewards: rewards(letterReward(row)),
        unclaimed: unclaimed(row), canClaim: scoped && id(row.id ?? row.letterId) && unclaimed(row) }));
    const reports = list(status.reports).filter(row => row && !expired(row, 'report', now)).map(row => ({ ...row,
      expiresAtMs: expiry(row, 'report'), rewards: rewards(row.reward ?? row.payload?.reward),
      unclaimed: row.claimedReward === false, canClaim: scoped && row.claimedReward === false && reportTypes.includes(row.type) }));
    letters.sort((a, b) => Number(b.unclaimed) - Number(a.unclaimed) || (a.expiresAtMs ?? Infinity) - (b.expiresAtMs ?? Infinity));
    return { letters, reports, scoped };
  }
  function counts(data) {
    const unclaimedLettersCount = data.letters != null ? list(data.letters).filter(unclaimed).length : Number(data.unclaimedLettersCount) || 0;
    const unclaimedReportsCount = data.reports != null ? list(data.reports).filter(row => row?.claimedReward === false).length : Number(data.unclaimedReportsCount) || 0;
    const totalUnclaimed = unclaimedLettersCount + unclaimedReportsCount;
    return { unclaimedLettersCount, unclaimedReportsCount, totalUnclaimed, hasUnclaimed: totalUnclaimed > 0,
      hasUnclaimedLetters: unclaimedLettersCount > 0, hasUnclaimedReports: unclaimedReportsCount > 0 };
  }
  function prune(cache, now = Date.now()) {
    const next = { ...cache }; let changed = false;
    for (const key of ['mailStatus', 'mailGetAll', 'getPage:report']) {
      const entry = next[key]; if (!entry) continue;
      const data = entry.data || entry; let updated = { ...data }, dirty = false;
      for (const [field, kind] of [['letters', 'letter'], ['reports', 'report']]) {
        if (data[field] == null) continue;
        const original = list(data[field]), retained = original.filter(row => !expired(row, kind, now));
        if (retained.length !== original.length) { updated[field] = retained; dirty = true; }
      }
      if (dirty) {
        if (key === 'mailStatus') updated = { ...updated, ...counts(updated) };
        next[key] = entry.data ? { ...entry, data: updated } : updated;
        changed = true;
      }
    }
    return { cache: next, changed };
  }
  function validateClaim(call) {
    if (call?.name === 'mailFarm' && !call.feature && Object.keys(call.args || {}).join(',') === 'letterIds') {
      const ids = call.args.letterIds;
      if (Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(id) && new Set(ids.map(String)).size === ids.length) return { kind: 'letters', ids: ids.map(String) };
    }
    if (call?.name === 'readAndClaimAll' && call.feature === 'report' && Object.keys(call.args || {}).join(',') === 'types') {
      const types = call.args.types;
      if (Array.isArray(types) && types.length && types.every(type => reportTypes.includes(type)) && new Set(types).size === types.length) return { kind: 'reports', types };
    }
    return null;
  }
  const refreshCalls = () => [{ name: 'mailGetAll' }, { name: 'getPage', feature: 'report', args: { limit: 50, cursor: null } }];
  globalThis.hwaHelperMailData = { list, reportTypes, flag, id, expiry, expired, rewards, letterReward, unclaimed, rows, counts, prune, validateClaim, refreshCalls };
})();
