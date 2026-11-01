(() => {
  // enum_evolutionStar.json from the verified 1.292.0 splitlib asset.
  // Each value is the cost to evolve TO that star, not the current star.
  const evolveFragmentCost = { 2: 20, 3: 50, 4: 100, 5: 150, 6: 300 };

  function heroSoulProgress(id, hero, inventory) {
    const fragments = inventory?.fragmentHero;
    const quantity = fragments && Object.hasOwn(fragments, id) ? fragments[id] : 0;
    const owned = fragments && Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
    const star = hero?.star;
    const needed = star === 6 ? 'Max' : evolveFragmentCost[star + 1] ?? null;
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
  const numericHeadings = new Set(['Level', 'Star', 'Soul stones / needed',
    'Power', 'Amount', 'Members', 'Size']);
  const isNumericColumn = (heading) => numericHeadings.has(heading);

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

  globalThis.hwaHelperPopupData = { heroSoulProgress, teamRows, sortRows,
    isNumericColumn, rallyTooltip, marchDuration };
})();
