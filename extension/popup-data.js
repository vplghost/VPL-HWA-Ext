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
      if (!Array.isArray(members)) return [[mode, '—', 0, '—', '—']];
      const groups = members.some(Array.isArray) ? members : [members];
      return groups.map((group, index) => {
        const ids = Array.isArray(group) ? group.filter(Number.isInteger) : [];
        return [mode, groups.length > 1 ? index + 1 : '—', ids.length,
          ids.length ? ids.join(', ') : '—',
          ids.length ? ids.map((id) => nameMap.hero(id) || `#${id}`).join(', ') : '—'];
      });
    });
  }

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
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

  globalThis.hwaHelperPopupData = { heroSoulProgress, teamRows, sortRows };
})();
