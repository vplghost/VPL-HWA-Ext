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
  function isMarchExpired(march, now = Date.now()) {
    if (!march) return true;
    if (march.rally) {
      const rally = march.rally;
      const arrivalAt = Number.isFinite(rally.arrivalAt) ? rally.arrivalAt :
        (Number.isFinite(rally.waitUntil) && Number.isFinite(rally.outboundMs) ?
          rally.waitUntil + rally.outboundMs : null);
      const returnAt = Number.isFinite(rally.returnAt) ? rally.returnAt :
        (Number.isFinite(march.endsAt) && march.stage === 'returnToOutpost' ? march.endsAt :
          (Number.isFinite(arrivalAt) && Number.isFinite(rally.returnMs) ?
            arrivalAt + rally.returnMs : null));
      if (Number.isFinite(returnAt)) return now >= returnAt;
      if (march.stage === 'returnToOutpost' && Number.isFinite(march.endsAt)) return now >= march.endsAt;
      return Number.isFinite(rally.waitUntil) && now > rally.waitUntil + 30 * 60000;
    }
    return Number.isFinite(march.endsAt) && march.endsAt <= now;
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
    if (stageId === 7) return 'Match Completed';
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

  function defaultDraftCandidates(mode = 'defense') {
    if (mode === 'attack') {
      return [
        [8, 49, 28],   // Step 1: Chabba, Satori, Qing Mao
        [73, 56, 12],  // Step 2: Drayne, Fafnir, Arachne
        [17, 34, 14],  // Step 3: Mojo, Rufus, Heidi
        [4, 55, 10],   // Step 4: Astaroth, Mushy and Shroom, Dante
        [29, 25, 78]   // Step 5: Lars, Ishmael, Wodryn
      ];
    }
    return [
      [78, 49, 44],  // Step 1: Wodryn, Satori, Astrid and Lucas
      [76, 20, 38],  // Step 2: Crow, Markus, Ziri
      [75, 2, 25],   // Step 3: Oya, Ginger, Ishmael
      [37, 73, 28],  // Step 4: Jhu, Drayne, Qing Mao
      [5, 35, 69]    // Step 5: Artemis, Faceless, Guus
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

  
  function tableExportFilename(tab, d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `hwa-${tab}-${stamp}.json`;
  }

  function exportTableData(tab, cache, query = '', itemGroupFilter = '') {
    if (!cache) return [];
    const q = (query || '').trim().toLocaleLowerCase();
    const matchesFilter = (vals) => !q || vals.some(v => String(v ?? '').toLocaleLowerCase().includes(q));

    if (tab === 'heroes') {
      const data = cache.heroGetAll?.data || {};
      const heroes = Object.entries(data).sort(([a], [b]) => Number(a) - Number(b));
      const result = [];
      for (const [id, hero] of heroes) {
        const meta = globalThis.hwaHelperHeroMetadata?.[id];
        const name = meta?.name || globalThis.hwaHelperNameMap?.hero?.(id) || `#${id}`;
        if (!matchesFilter([id, name, hero?.level, hero?.star, hero?.power, meta?.role, meta?.class, meta?.faction])) {
          continue;
        }
        const { owned, needed } = heroSoulProgress(id, hero, cache.inventoryGet?.data);
        const sparkLevel = Number.isInteger(hero?.titanGiftLevel) ? hero.titanGiftLevel : 0;

        const skills = hero?.skills ? Object.entries(hero.skills)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([k, lvl], idx) => ({
            slot: idx + 1,
            skillId: Number(k),
            level: Number(lvl)
          })) : [];

        const skins = hero?.skins ? Object.entries(hero.skins)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([skinId, lvl]) => {
            let stat = globalThis.hwaHelperSkinStats?.[skinId];
            if (!stat || stat === 'MAIN' || Number(skinId) === Number(hero?.baseSkinId) || (Number(skinId) <= 100 && !globalThis.hwaHelperSkinStats?.[skinId])) {
              const mainStat = meta?.mainStat || (meta?.role === 'Tank' || meta?.class === 'Warrior' ? 'strength' : meta?.class === 'Marksman' ? 'agility' : 'intelligence');
              stat = mainStat === 'strength' ? 'Str' : mainStat === 'agility' ? 'Agi' : 'Int';
            }
            return {
              skinId: Number(skinId),
              stat: stat || 'Skin',
              level: Number(lvl),
              isCurrent: Number(skinId) === Number(hero?.currentSkin)
            };
          }) : [];

        const rawRunes = hero?.hero_runes || hero?.runes;
        const heroRunes = Array.isArray(rawRunes) ? rawRunes :
          (rawRunes && typeof rawRunes === 'object' ? Object.values(rawRunes) : []);
        const glyphStats = globalThis.hwaHelperHeroGlyphs?.[id] || ['PA', 'HP', 'Arm', 'Crit', 'Str'];
        const glyphs = heroRunes.map((lvl, idx) => ({
          slot: idx + 1,
          stat: glyphStats[idx] || `G${idx + 1}`,
          level: Number(lvl)
        }));

        const artifacts = Array.isArray(hero?.artifacts) ? hero.artifacts.map((art, idx) => ({
          slot: idx + 1,
          id: art?.id ?? null,
          star: art?.star ?? null,
          level: art?.level ?? null
        })) : [];

        result.push({
          id: Number(id),
          name,
          level: Number(hero?.level) || null,
          star: Number(hero?.star) || 1,
          power: Number(hero?.power) || 0,
          role: meta?.role || null,
          class: meta?.class || null,
          faction: meta?.faction || null,
          soulStones: {
            current: owned,
            needed: needed
          },
          sparksOfPower: {
            level: sparkLevel,
            max: 30
          },
          skills,
          skins,
          glyphs,
          artifacts
        });
      }
      return result;
    }

    if (tab === 'titans') {
      const data = cache.titanGetAll?.data || {};
      const titans = Object.entries(data).sort(([a], [b]) => Number(a) - Number(b));
      const result = [];
      for (const [id, titan] of titans) {
        const meta = globalThis.hwaHelperTitanMetadata?.[id];
        const name = meta?.name || globalThis.hwaHelperNameMap?.hero?.(id) || `#${id}`;
        if (!matchesFilter([id, name, titan?.level, titan?.star, titan?.power, meta?.role, meta?.element])) {
          continue;
        }
        const { owned, needed } = titanSoulProgress(id, titan, cache.inventoryGet?.data);
        const skills = titan?.skills ? Object.entries(titan.skills)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([k, lvl], idx) => ({
            slot: idx + 1,
            skillId: Number(k),
            level: Number(lvl)
          })) : [];

        result.push({
          id: Number(id),
          name,
          level: Number(titan?.level) || null,
          star: Number(titan?.star) || 1,
          power: Number(titan?.power) || 0,
          role: meta?.role || null,
          element: meta?.element || null,
          soulStones: {
            current: owned,
            needed: needed
          },
          skills,
          artifacts: Array.isArray(titan?.artifacts) ? titan.artifacts : [],
          skins: titan?.skins || titan?.skin || null
        });
      }
      return result;
    }

    if (tab === 'items') {
      const data = cache.inventoryGet?.data || {};
      const result = [];
      for (const [category, items] of Object.entries(data)) {
        if (itemGroupFilter && category !== itemGroupFilter) continue;
        for (const [id, quantity] of Object.entries(items ?? {})) {
          const name = globalThis.hwaHelperNameMap?.item?.(category, id) || '—';
          if (!matchesFilter([category, id, name, quantity])) continue;
          result.push({
            group: category,
            id: Number(id) || id,
            name,
            amount: Number(quantity) || 0
          });
        }
      }
      return result;
    }

    if (tab === 'resources') {
      const result = [];
      const resEntries = Object.entries(cache).filter(([k]) => k.startsWith('resource:'));
      for (const [key, entry] of resEntries) {
        const d = entry?.data || {};
        const name = d.label || d.name || key.replace('resource:', '');
        if (!matchesFilter([key, name, d.amount])) continue;
        result.push({
          key,
          name,
          amount: Number(d.amount) || 0,
          cap: Number.isFinite(d.cap) ? d.cap : null,
          renewable: Boolean(d.renewable),
          refillEveryMs: Number.isFinite(d.refillEveryMs) ? d.refillEveryMs : null,
          refillAmount: Number.isFinite(d.refillAmount) ? d.refillAmount : null
        });
      }
      return result;
    }

    if (tab === 'teams') {
      const data = cache.teamGetAll?.data || {};
      const rows = teamRows(data, globalThis.hwaHelperNameMap);
      return rows
        .filter(row => matchesFilter(row))
        .map(row => ({
          mode: row[0],
          teamNumber: row[1],
          memberCount: row[2],
          names: row[3],
          members: Array.isArray(row[4]) ? row[4] : []
        }));
    }

    if (tab === 'other') {
      const entries = Object.values(cache).filter((entry) =>
        entry?.key && !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'guildChat', 'energyStatus',
          'worldEnergyStatus', 'worldEnergyRallies', 'resourceActionHistory',
          'accountStatus', 'buildingStatus', 'marchStatus',
          'researchStatus', 'productionConfigStatus', 'productionStatus',
          'productionBonusStatus', 'missionProgressStatus', 'clanVersusStatus', 'questEvents',
          'clanWarChampStatus', 'fortressEventStatus', 'clanClashStatus', 'brawlStatus', 'legendDraftStatus'].includes(entry.key)
        && !entry.key.startsWith('resource:')
        && matchesFilter([entry.method, entry.feature || entry.group]));
      return entries.map(entry => ({
        key: entry.key,
        method: entry.method,
        feature: entry.feature || entry.group,
        size: Array.isArray(entry.data) ? entry.data.length : Object.keys(entry.data ?? {}).length,
        updatedAt: entry.updatedAt,
        data: entry.data
      }));
    }

    return [];
  }

  globalThis.hwaHelperPopupData = { heroSoulProgress, titanSoulProgress, isSoulUpgradeReady, teamRows, sortRows,
    isNumericColumn, rallyTooltip, isMarchExpired, marchDuration,
    draftStageDescription, formatCountdown, isDraftActive,
    defaultDraftCandidates, validateDraftPicks, getDraftActiveStep,
    buildingTooltip, researchTooltip, formatChatRole, formatChatTime, tableExportFilename, exportTableData };
})();
