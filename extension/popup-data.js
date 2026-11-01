(() => {
  // enum_evolutionStar.json from the verified 1.292.0 splitlib asset.
  // Each value is the cost to evolve TO that star, not the current star.
  const evolveFragmentCost = { 2: 20, 3: 50, 4: 100, 5: 150, 6: 300 };
  const evolveTitanFragmentCost = { 2: 50, 3: 150, 4: 500, 5: 900, 6: 1500 };

  function heroSoulProgress(id, hero, inventory) {
    const fragments = inventory?.fragmentHero;
    const quantity = fragments && Object.hasOwn(fragments, id) ? fragments[id] : 0;
    const owned = fragments && Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
    const star = hero?.star;
    const needed = star === 6 ? 'Max' : evolveFragmentCost[star + 1] ?? null;
    return { owned, needed };
  }

  function titanSoulProgress(id, titan, inventory) {
    const fragments = inventory?.fragmentTitan;
    const quantity = fragments && Object.hasOwn(fragments, id) ? fragments[id] : 0;
    const owned = fragments && Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
    const star = titan?.star;
    const needed = star === 6 ? 'Max' : evolveTitanFragmentCost[star + 1] ?? null;
    return { owned, needed };
  }

  function teamRows(data, nameMap) {
    return Object.entries(data).flatMap(([mode, members]) => {
      if (!Array.isArray(members)) return [[mode, '—', 0, '—', []]];
      const groups = members.some(Array.isArray) ? members : [members];
      return groups.map((group, index) => {
        const ids = Array.isArray(group) ? group.filter(Number.isInteger) : [];
        return [mode, groups.length > 1 ? index + 1 : '—', ids.length,
          ids.length ? ids.map((id) => nameMap.hero(id) || `#${id}`).join(', ') : '—',
          ids];
      });
    });
  }

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const numericHeadings = new Set(['Level', 'Star', 'Soul stones / needed', 'Soul stone', 'Soul stones',
    'Power', 'Amount', 'Members', 'Size']);
  const isNumericColumn = (heading) => numericHeadings.has(heading);

  function isSoulUpgradeReady(soulStringOrOwned, needed) {
    if (typeof soulStringOrOwned === 'string' && soulStringOrOwned.includes('/')) {
      const [ownedStr, neededStr] = soulStringOrOwned.split('/').map((s) => s.trim().replaceAll(',', ''));
      const o = Number(ownedStr);
      const n = Number(neededStr);
      return Number.isFinite(o) && Number.isFinite(n) && o >= n;
    }
    const o = Number(soulStringOrOwned);
    const n = Number(needed);
    return Number.isFinite(o) && Number.isFinite(n) && o >= n;
  }

  function marchDuration(ms, precise = false) {
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return 'Due now';
    if (ms < 60000) return `${precise ? Math.ceil(ms / 1000) :
      Math.ceil(ms / 10000) * 10} sec`;
    const minutes = Math.max(1, Math.floor(ms / 60000));
    return minutes < 60 ? `${minutes} min` :
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function rallyTooltip(march, now, heroName) {
    const rally = march.rally;
    const heroes = (rally.team?.heroIds || []).map((id) => heroName(id) || `Hero #${id}`);
    const troops = (rally.team?.units || []).map((unit) =>
      `#${unit.id} ×${unit.count.toLocaleString('en-US')}`);
    const wait = Number.isFinite(rally.waitUntil) && rally.waitUntil > now ?
      marchDuration(rally.waitUntil - now) : 'Complete';
    const arrivalAt = Number.isFinite(rally.arrivalAt) ? rally.arrivalAt :
      Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs) ?
        rally.waitUntil + rally.outboundMs : null;
    const arrival = !Number.isFinite(arrivalAt) ? 'Route pending' :
      arrivalAt > now ?
        `${Number.isFinite(rally.arrivalAt) ? '' : '~'}${marchDuration(arrivalAt - now)} remaining` :
        Number.isFinite(rally.arrivalAt) ? 'Reached' : 'Due; awaiting route update';
    const returning = Number.isFinite(rally.returnAt) ?
      `${rally.returnAt > now ? `${marchDuration(rally.returnAt - now)} remaining` : 'Due now'}` :
      Number.isFinite(rally.returnMs) ?
        `~${marchDuration(rally.returnMs, true)} travel after battle` : 'Route pending';
    return [`Raid · ${rally.target || 'Target pending'}`,
      `Team: ${heroes.join(', ') || '—'}`,
      ...(troops.length ? [`Troops: ${troops.join(', ')}`] : []),
      `Wait: ${wait}`,
      ...(Number.isFinite(rally.outboundMs) ?
        [`Travel to target: ~${marchDuration(rally.outboundMs, true)}`] : []),
      `Arrival: ${arrival}`, `Return to base: ${returning}`].join('\n');
  }
  function sortRows(rows, column, direction) {
    const numeric = (value) => {
      if (typeof value === 'number') return value;
      const text = String(value ?? '');
      if (/^\d[\d,]*(?:\s*\/.*)?$/.test(text)) return Number(text.split('/')[0].replaceAll(',', '').trim());
      return null;
    };
    return [...rows].sort((left, right) => {
      const a = left[column];
      const b = right[column];
      if (a == null || a === '—') return b == null || b === '—' ? 0 : 1;
      if (b == null || b === '—') return -1;
      const an = numeric(a);
      const bn = numeric(b);
      const result = an !== null && bn !== null ? an - bn : collator.compare(String(a), String(b));
      return direction === 'desc' ? -result : result;
    });
  }

  function draftStageDescription(stageId) {
    if (stageId === 1) return 'Matching...';
    if (stageId === 2 || stageId === 3) return 'Defense Draft';
    if (stageId === 4) return 'Attack Draft';
    if (stageId === 5) return 'Ready for Battle';
    return 'Not in match';
  }

  function formatCountdown(finishTs, nowSec = Math.floor(Date.now() / 1000)) {
    if (!Number.isFinite(finishTs)) return '—';
    const remaining = Math.max(0, finishTs - nowSec);
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function isDraftActive(stageId) {
    return Number.isInteger(stageId) && stageId >= 1 && stageId <= 4;
  }

  function buildingTooltip(status, now, buildingName) {
    const queues = (status?.data?.queues || []).filter((q) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now);
    if (!queues.length) return 'Construction: Idle';
    const lines = ['Construction in progress:'];
    for (const q of queues) {
      const name = (buildingName && q.buildingId ? buildingName(q.buildingId) : null) ||
        (q.buildingId ? `Building #${q.buildingId}` : 'Building');
      const level = q.level ? ` (Lv. ${q.level})` : '';
      const mins = Math.ceil((q.startDate + q.durationMs - now) / 60000);
      const time = globalThis.hwaHelperResourceData?.hoursMinutes ?
        globalThis.hwaHelperResourceData.hoursMinutes(mins) : `${mins}m`;
      lines.push(`${name}${level} · ${time} remaining`);
    }
    return lines.join('\n');
  }

  function researchTooltip(status, now, researchName) {
    const queues = (status?.data?.queues || []).filter((q) =>
      Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now);
    if (!queues.length) return 'Research: Idle';
    const lines = ['Research in progress:'];
    for (const q of queues) {
      const name = (researchName && q.researchId ? researchName(q.researchId) : null) ||
        (q.researchId ? `Research #${q.researchId}` : 'Research');
      const level = q.level ? ` (Lv. ${q.level})` : '';
      const mins = Math.ceil((q.startDate + q.durationMs - now) / 60000);
      const time = globalThis.hwaHelperResourceData?.hoursMinutes ?
        globalThis.hwaHelperResourceData.hoursMinutes(mins) : `${mins}m`;
      lines.push(`${name}${level} · ${time} remaining`);
    }
    return lines.join('\n');
  }

  function defaultDraftCandidates() {
    return [
      [24, 4, 38],    // Round 1: Cleaver, Astaroth, Corvus
      [12, 16, 49],   // Round 2: Arachne, Dante, Yasmine
      [51, 55, 10],   // Round 3: Xe'Sha, Mushy and Shroom, Orion
      [502, 39, 503], // Round 4: Morrigan, Martha, Alvanor
      [68, 56, 36]    // Round 5: Peech, Fafnir, Jorgen
    ];
  }

  function validateDraftPicks(picks) {
    if (!Array.isArray(picks)) {
      return { valid: false, count: 0, missingSteps: [1, 2, 3, 4, 5], heroes: [] };
    }
    const missingSteps = [];
    const heroes = [];
    for (let i = 0; i < 5; i++) {
      const h = picks[i];
      if (Number.isInteger(h) && h > 0) {
        heroes.push(h);
      } else {
        missingSteps.push(i + 1);
      }
    }
    return {
      valid: heroes.length === 5 && missingSteps.length === 0,
      count: heroes.length,
      missingSteps,
      heroes
    };
  }

  function getDraftActiveStep(picks) {
    if (!Array.isArray(picks)) return 0;
    for (let i = 0; i < 5; i++) {
      if (!Number.isInteger(picks[i]) || picks[i] <= 0) return i;
    }
    return 4;
  }

  function formatChatRole(role) {
    const r = String(role ?? '');
    if (r === '255') return { label: 'Leader', badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' };
    if (r === '4') return { label: 'Officer', badgeClass: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300' };
    if (r === '3') return { label: 'Member', badgeClass: 'bg-slate-100 text-slate-700' };
    return { label: r ? `Role #${r}` : 'Member', badgeClass: 'bg-slate-100 text-slate-600' };
  }

  function formatChatTime(ctimeSec) {
    if (!Number.isFinite(Number(ctimeSec))) return '—';
    const d = new Date(Number(ctimeSec) * 1000);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
  }

  globalThis.hwaHelperPopupData = { heroSoulProgress, titanSoulProgress, isSoulUpgradeReady, teamRows, sortRows,
    isNumericColumn, rallyTooltip, marchDuration,
    draftStageDescription, formatCountdown, isDraftActive,
    defaultDraftCandidates, validateDraftPicks, getDraftActiveStep,
    buildingTooltip, researchTooltip, formatChatRole, formatChatTime };
})();
