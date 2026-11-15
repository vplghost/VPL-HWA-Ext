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
    const settled = account != null && cache.battleReportSummary?.data?.accountId != null && String(cache.battleReportSummary.data.accountId) === String(account)
      ? cache.battleReportSummary.data.seen || {}
      : {};
    const reports = list(status.reports).filter(row => row && !flag(row.claimedReward) && !settled[String(row.id)] && !expired(row, 'report', now)).map(row => ({ ...row,
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
  function prune(cache, now = Date.now(), normalizeReceiptRewards) {
    const compacted = compactReports(cache, now, normalizeReceiptRewards);
    const next = { ...compacted.cache }; let changed = compacted.changed;
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
  const reportLabels = { soloMobAttackResult: 'Monster battles', rallyMobAttackResult: 'Rally battles',
    rallyCancelled: 'Cancelled rallies', mineGatheringResult: 'Gathering', mineAttackResult: 'Mine attacks',
    mineDefendResult: 'Mine defenses', outpostAttackResult: 'Outpost attacks', outpostScoutResult: 'Outpost scouts', mineScoutResult: 'Mine scouts' };
  const reportLabel = type => reportLabels[type] || String(type || 'Other reports').replace(/([a-z])([A-Z])/g, '$1 $2');
  const utcDay = time => Number.isFinite(time) && time > 0 && Number.isFinite(new Date(time).getTime()) ? new Date(time).toISOString().slice(0, 10) : null;
  function dailyReports(cache, now = Date.now()) {
    const data = cache.battleReportSummary?.data;
    if (cache.accountStatus?.data?.id == null || String(data?.accountId) !== String(cache.accountStatus.data.id)) return [];
    const cutoff = utcDay(now - 29 * 86400000), today = utcDay(now);
    return Object.entries(data.days || {}).filter(([day]) => day >= cutoff && day <= today).sort(([a], [b]) => b.localeCompare(a)).map(([day, value]) => ({ day, ...value,
      types: Object.entries(value.types || {}).map(([type, count]) => ({ type, count, label: reportLabel(type) })),
      rewards: Object.entries(value.rewards || {}).map(([key, amount]) => ({ key, amount })) }));
  }
  function reportGroups(reports) {
    const groups = new Map();
    for (const row of reports) {
      const type = row.type || 'other', group = groups.get(type) || { type, label: reportLabel(type), count: 0, expiresAtMs: null, canClaim: false, rewards: {} };
      group.count++; group.canClaim ||= row.canClaim;
      if (row.expiresAtMs != null) group.expiresAtMs = Math.min(group.expiresAtMs ?? Infinity, row.expiresAtMs);
      for (const reward of row.rewards || []) group.rewards[reward.key] = (group.rewards[reward.key] || 0) + reward.amount;
      groups.set(type, group);
    }
    return [...groups.values()].map(group => ({ ...group, rewards: Object.entries(group.rewards).map(([key, amount]) => ({ key, amount })) }));
  }
  function compactReports(cache, now = Date.now(), normalizeReceiptRewards) {
    const next = { ...cache }, accountId = cache.accountStatus?.data?.id;
    const today = utcDay(now), cutoff = utcDay(now - 29 * 86400000);
    const within = day => typeof day === 'string' && day >= cutoff && day <= today;
    const old = cache.battleReportSummary;
    const prior = accountId != null && String(old?.data?.accountId) === String(accountId) ? old.data : {};
    const days = Object.fromEntries(Object.entries(prior.days || {}).filter(([day]) => within(day)).map(([day, value]) =>
      [day, { ...value, types: { ...value.types }, rewards: { ...value.rewards } }]));
    const seen = Object.fromEntries(Object.entries(prior.seen || {}).filter(([, value]) => within(Array.isArray(value) ? value[0] : value)));
    const receipts = Object.fromEntries(Object.entries(prior.receipts || {}).filter(([, day]) => within(day)));
    const dayRow = day => days[day] ||= { total: 0, wins: 0, losses: 0, types: {}, rewards: {} };
    const candidates = new Map();
    for (const key of ['getPage:report', 'mailStatus']) for (const row of list(cache[key]?.data?.reports ?? cache[key]?.reports)) {
      if (row?.id == null) continue;
      const previous = candidates.get(String(row.id));
      candidates.set(String(row.id), { ...previous, ...row, claimedReward: flag(previous?.claimedReward) || flag(row.claimedReward) });
    }
    const scoped = accountId != null && String(cache.mailStatus?.data?.accountId) === String(accountId);
    if (scoped) for (const [reportId, row] of candidates) {
      if (!row.claimedReward || reportId.length > 128) continue;
      const result = row.result ?? row.payload?.result;
      const outcome = result === 'win' ? 1 : ['lose', 'loss', 'defeat'].includes(result) ? -1 : 0;
      const archived = seen[reportId];
      if (archived) {
        const [day, knownOutcome] = Array.isArray(archived) ? archived : [archived, 0];
        // A claim may arrive before the report page supplies its battle result.
        if (!knownOutcome && outcome && within(day)) {
          dayRow(day)[outcome === 1 ? 'wins' : 'losses']++;
          seen[reportId] = [day, outcome];
        }
        continue;
      }
      const day = utcDay(Number(row.createdAt)) || today;
      if (!within(day)) continue;
      const summary = dayRow(day), type = String(row.type || 'other').slice(0, 80);
      summary.total++; summary.types[type] = (summary.types[type] || 0) + 1;
      if (outcome === 1) summary.wins++;
      if (outcome === -1) summary.losses++;
      seen[reportId] = [day, outcome];
    }
    for (const receipt of list(cache.mailClaimReceipts?.data)) {
      const day = utcDay(Date.parse(receipt.at));
      if (accountId == null || String(receipt.accountId) !== String(accountId) || receipt.kind !== 'reports' ||
          !receipt.success || !receipt.token || receipts[receipt.token] || !within(day)) continue;
      const observed = receipt.observedRewards ?? normalizeReceiptRewards?.(receipt);
      // Confirmed typed rewards only; never infer rewards from report count/type.
      if (Array.isArray(observed)) for (const reward of observed) if (reward?.key?.startsWith('resource:') && Number.isFinite(reward.amount) && reward.amount > 0) {
        const summary = dayRow(day);
        summary.rewards[reward.key] = (summary.rewards[reward.key] || 0) + reward.amount;
      }
      receipts[receipt.token] = day;
    }
    let changed = false;
    if (accountId != null && (Object.keys(days).length || old)) {
      const data = { accountId: String(accountId), days, seen, receipts };
      if (JSON.stringify(old?.data) !== JSON.stringify(data)) {
        next.battleReportSummary = { key: 'battleReportSummary', group: 'internal', data, updatedAt: new Date(now).toISOString() }; changed = true;
      }
    }
    for (const key of ['mailStatus', 'getPage:report']) {
      const entry = next[key], data = entry?.data || entry;
      if (data?.reports == null) continue;
      const original = list(data.reports), retained = original.filter(row => !flag(row?.claimedReward) && !(scoped && seen[String(row?.id)]));
      if (original.length !== retained.length) {
        const updated = { ...data, reports: retained, ...(key === 'mailStatus' ? counts({ ...data, reports: retained }) : {}) };
        next[key] = entry.data ? { ...entry, data: updated } : updated; changed = true;
      }
    }
    // Keep only acknowledgement/stale-snapshot guards after folding rewards.
    const compactReceipt = row => row.kind === 'reports' && !(row.reward && !Array.isArray(row.observedRewards) && !normalizeReceiptRewards)
      ? Object.fromEntries(['token', 'kind', 'accountId', 'at', 'success', 'error', 'types', 'ids'].filter(key => row[key] !== undefined).map(key => [key, row[key]])) : row;
    if (cache.mailClaimReceipts?.data) {
      const data = list(cache.mailClaimReceipts.data).map(compactReceipt);
      if (JSON.stringify(data) !== JSON.stringify(cache.mailClaimReceipts.data)) { next.mailClaimReceipts = { ...cache.mailClaimReceipts, data }; changed = true; }
    }
    if (cache.mailClaimStatus?.data?.kind === 'reports') {
      const data = compactReceipt(cache.mailClaimStatus.data);
      if (JSON.stringify(data) !== JSON.stringify(cache.mailClaimStatus.data)) { next.mailClaimStatus = { ...cache.mailClaimStatus, data }; changed = true; }
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
    if (call?.name === 'claimReward' && call.feature === 'report' && Object.keys(call.args || {}).join(',') === 'id' &&
        typeof call.args.id === 'string' && call.args.id.length > 0 && call.args.id.length <= 128)
      return { kind: 'reports', ids: [call.args.id], types: [] };
    return null;
  }
  const refreshCalls = () => [{ name: 'mailGetAll' }, { name: 'getPage', feature: 'report', args: { limit: 50, cursor: null } }];
  globalThis.hwaHelperMailData = { list, reportTypes, flag, id, expiry, expired, rewards, letterReward, unclaimed, rows, counts, prune,
    validateClaim, refreshCalls, dailyReports, reportGroups, reportLabel, compactReports };
})();
