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

  function getChallengeResourceStock(cache, target) {
    if (!cache) return null;
    const inv = cache.inventoryGet?.data || {};
    const coins = inv.coin || {};
    const consumables = inv.consumable || {};
    const fragments = inv.fragmentHero || {};
    const tStr = String(target || '').toLowerCase().trim();
    const tId = Number.parseInt(target, 10);

    // 1. Hero Skin Stones (ID: 37)
    if (tId === 37 || tStr.includes('hero skin stone')) {
      const s8 = Number(coins['8']) || cache['resource:coin:8']?.data?.amount || 0;
      const s9 = Number(coins['9']) || cache['resource:coin:9']?.data?.amount || 0;
      const s10 = Number(coins['10']) || cache['resource:coin:10']?.data?.amount || 0;
      return s8 + s9 + s10;
    }

    // 2. Titan Skin Stones (ID: 54)
    if (tId === 54 || tStr.includes('titan skin stone')) {
      return Number(coins['20']) || cache['resource:coin:20']?.data?.amount || 0;
    }

    // 3. Titan Potions (ID: 40)
    if (tId === 40 || tStr.includes('titan potion')) {
      return Number(consumables['20']) || cache['resource:consumable:20']?.data?.amount || 0;
    }

    // 4. Elemental Spheres (ID: 29)
    if (tId === 29 || tStr.includes('elemental sphere')) {
      return Number(consumables['46']) || cache['resource:consumable:46']?.data?.amount || 0;
    }

    // 5. Summon Titan / Circle Spheres (ID: 28)
    if (tId === 28 || tStr.includes('summon 1 titan') || (tStr.includes('titan') && tStr.includes('circle'))) {
      return Number(coins['13']) || cache['resource:coin:13']?.data?.amount || 0;
    }

    // 6. Relic Shards (ID: 55)
    if (tId === 55 || tStr.includes('relic shard')) {
      return Number(coins['40065']) || Number(consumables['24']) || cache['resource:coin:40065']?.data?.amount || 0;
    }

    // 7. Chaos Cores (ID: 57)
    if (tId === 57 || tStr.includes('chaos core')) {
      return Number(consumables['44']) || cache['resource:consumable:44']?.data?.amount || 0;
    }

    // 8. Artifact Chest Keys (ID: 38)
    if (tId === 38 || tStr.includes('artifact chest')) {
      return Number(consumables['45']) || cache['resource:consumable:45']?.data?.amount || 0;
    }

    // 9. Heroic Chest Keys (ID: 34)
    if (tId === 34 || tStr.includes('heroic chest')) {
      return Number(consumables['5']) || cache['resource:consumable:5']?.data?.amount || 0;
    }

    // 10. Rune Spheres (ID: 50)
    if (tId === 50 || tStr.includes('rune sphere')) {
      return Number(coins['40078']) || cache['resource:coin:40078']?.data?.amount || 0;
    }

    // 11. Rune Stones (ID: 51)
    if (tId === 51 || tStr.includes('rune stone')) {
      return Number(coins['40077']) || Number(coins['1051']) || cache['resource:coin:40077']?.data?.amount || 0;
    }

    // 12. Mastery Crystals (ID: 56)
    if (tId === 56 || tStr.includes('mastery crystal')) {
      return Number(coins['40067']) || cache['resource:coin:40067']?.data?.amount || 0;
    }

    // 13. Energy (ID: 49)
    if (tId === 49 || (tStr.includes('spend') && tStr.includes('energy'))) {
      return cache['resource:energy']?.data?.amount ?? cache.energyStatus?.data?.energy ?? 0;
    }

    // 14. Hero Soul Stones (ID: 47)
    if (tId === 47 || tStr.includes('hero soul stone')) {
      return Object.values(fragments).reduce((acc, v) => acc + (Number(v) || 0), 0);
    }

    // 15. Skill Books (ID: 16)
    if (tId === 16 || tStr.includes('skill book')) {
      return Number(consumables['16']) || 0;
    }

    // 16. Honor Marks (ID: 92)
    if (tId === 92 || tStr.includes('honor mark')) {
      return Number(coins['1']) || cache['resource:coin:1']?.data?.amount || 0;
    }

    // 17. Outland Chests (ID: 114)
    if (tId === 114 || tStr.includes('outland chest')) {
      return Number(coins['2']) || 0;
    }

    return null;
  }

  function normalizeGoalKey(target) {
    const s = String(target || '').toLowerCase();
    if (s.includes('titan skin stone')) return 'res:titan_skin_stones';
    if (s.includes('hero skin stone')) return 'res:hero_skin_stones';
    if (s.includes('titan potion')) return 'res:titan_potions';
    if (s.includes('elemental sphere')) return 'res:elemental_spheres';
    if (s.includes('summon') || s.includes('circle')) return 'res:summon_titan';
    if (s.includes('relic shard')) return 'res:relic_shards';
    if (s.includes('chaos core')) return 'res:chaos_cores';
    if (s.includes('artifact chest')) return 'res:artifact_chests';
    if (s.includes('heroic chest')) return 'res:heroic_chests';
    if (s.includes('rune sphere')) return 'res:rune_spheres';
    if (s.includes('rune stone')) return 'res:rune_stones';
    if (s.includes('mastery crystal')) return 'res:mastery_crystals';
    if (s.includes('spend') && s.includes('energy')) return 'res:energy';
    if (s.includes('hero soul stone')) return 'res:hero_soul_stones';
    if (s.includes('skill book')) return 'res:skill_books';
    if (s.includes('honor mark')) return 'res:honor_marks';
    if (s.includes('outland chest')) return 'res:outland_chests';
    if (s.includes('building speedup')) return 'res:building_speedups';
    if (s.includes('research speedup')) return 'res:research_speedups';
    if (s.includes('training speedup')) return 'res:training_speedups';
    if (s.includes('healing speedup')) return 'res:healing_speedups';

    // Activities
    if (s.includes('tower')) return 'act:tower';
    if (s.includes('bandit camp')) return 'act:bandit_camp';
    if (s.includes('boss') || s.includes('rally')) return 'act:map_boss';
    if (s.includes('monster')) return 'act:map_monster';
    if (s.includes('expedition')) return 'act:expedition';
    if (s.includes('daily quest')) return 'act:daily_quest';
    if (s.includes('grand arena')) return 'act:grand_arena';
    if (s.includes('arena')) return 'act:arena';
    if (s.includes('gather') || s.includes('food') || s.includes('wood') || s.includes('stone') || s.includes('iron')) return 'act:gathering';
    if (s.includes('titan power')) return 'act:titan_power';
    if (s.includes('hero power')) return 'act:hero_power';
    if (s.includes('building power')) return 'act:building_power';
    if (s.includes('research power')) return 'act:research_power';
    if (s.includes('train') && s.includes('troop')) return 'act:train_troops';
    if (s.includes('unit in pvp')) return 'act:pvp_clash';
    if (s.includes('equip') && s.includes('item')) return 'act:equip_items';
    if (s.includes('dungeon')) return 'act:dungeon';
    if (s.includes('guild war')) return 'act:guild_war';

    return `misc:${s.replace(/[^a-z0-9]+/g, '_')}`;
  }

  const goalIconMap = {
    'res:titan_skin_stones': '💎',
    'res:hero_skin_stones': '💎',
    'res:titan_potions': '🧪',
    'res:elemental_spheres': '🔮',
    'res:summon_titan': '🌀',
    'res:relic_shards': '💠',
    'res:chaos_cores': '⚡',
    'res:artifact_chests': '🗝️',
    'res:heroic_chests': '📦',
    'res:rune_spheres': '🟣',
    'res:rune_stones': '🪨',
    'res:mastery_crystals': '🔶',
    'res:energy': '⚡',
    'res:hero_soul_stones': '✨',
    'res:skill_books': '📖',
    'res:honor_marks': '🎖️',
    'res:outland_chests': '🎁',
    'res:building_speedups': '⏩',
    'res:research_speedups': '⏩',
    'res:training_speedups': '⏩',
    'res:healing_speedups': '⏩',
    'act:tower': '🗼',
    'act:bandit_camp': '⛺',
    'act:map_boss': '👹',
    'act:map_monster': '👾',
    'act:expedition': '⛵',
    'act:daily_quest': '📜',
    'act:arena': '⚔️',
    'act:grand_arena': '🛡️',
    'act:gathering': '🌾',
    'act:titan_power': '💪',
    'act:hero_power': '⭐',
    'act:building_power': '🏛️',
    'act:research_power': '🔬',
    'act:train_troops': '🛡️',
    'act:pvp_clash': '⚔️',
    'act:equip_items': '🗡️',
    'act:dungeon': '🏰',
    'act:guild_war': '🏆'
  };

  const dailyLimitedKeys = new Set([
    'act:tower',
    'act:expedition',
    'act:daily_quest',
    'act:arena',
    'act:grand_arena',
    'act:guild_war',
    'act:dungeon'
  ]);

  function extractEventGoals(cache) {
    const goalsMap = new Map();

    const challengeNames = globalThis.hwaHelperClanVersusChallengeNames || {};
    const challengePoints = globalThis.hwaHelperClanVersusChallengePoints || {};
    const challengeSteps = globalThis.hwaHelperClanVersusChallengeSteps || {};
    const roundQuestsMap = globalThis.hwaHelperClanVersusRoundQuests || {};

    function addOrMergeGoal({ key, title, category, eventName, amount = 1, unit = '', points = 0, stock = null, hint = '' }) {
      if (!goalsMap.has(key)) {
        const isLimited = dailyLimitedKeys.has(key);
        const icon = goalIconMap[key] || (category === 'Resources' ? '💎' : '🎯');
        goalsMap.set(key, {
          key,
          title,
          icon,
          category,
          needed: amount,
          unit,
          stock,
          inStock: stock != null ? stock >= amount : null,
          isLimited,
          totalPoints: points,
          overlapCount: 1,
          events: [{ name: eventName, amount, points, unit }],
          hint
        });
      } else {
        const existing = goalsMap.get(key);
        existing.overlapCount += 1;
        existing.totalPoints += points;
        if (amount > existing.needed) existing.needed = amount;
        if (existing.stock != null && existing.needed != null) {
          existing.inStock = existing.stock >= existing.needed;
        }
        existing.events.push({ name: eventName, amount, points, unit });
      }
    }

    // 1. Guild Versus
    const vsStatus = cache?.clanVersusStatus?.data;
    if (vsStatus) {
      const battle = vsStatus.battle || {};
      const info = vsStatus.info || {};
      const rounds = battle.rounds || [];
      const liveRound = rounds.find((r) => r.status === 'inProgress') || rounds[0] || { index: 1 };
      const roundConfig = roundQuestsMap[liveRound.index] || roundQuestsMap[1] || {};
      const roundName = `Guild Versus Round ${liveRound.index}`;

      // Round Quests
      for (const q of roundConfig.quests || []) {
        const stock = getChallengeResourceStock(cache, q.label);
        const isRes = stock !== null;
        const key = normalizeGoalKey(q.label);
        const matchNum = q.label.match(/\b(\d+[\d,]*)\b/);
        const amount = matchNum ? Number.parseInt(matchNum[1].replace(/,/g, ''), 10) : 1;

        addOrMergeGoal({
          key,
          title: q.label.replace(/\s*\(\d+[\d,]*\)$/, ''),
          category: isRes ? 'Resources' : 'Activities',
          eventName: roundName,
          amount,
          points: q.points || 0,
          stock,
          hint: `Earns battle points for ${roundName}`
        });
      }

      // Daily Challenges
      for (const ch of info.challenges || []) {
        const name = challengeNames[ch.id] || `Daily Challenge #${ch.id}`;
        const stock = getChallengeResourceStock(cache, ch.id);
        const isRes = stock !== null;
        const key = normalizeGoalKey(name);
        const step = challengeSteps[ch.id] || 1;
        const points = challengePoints[ch.id] || 0;

        addOrMergeGoal({
          key,
          title: name.replace(/\s*\(\d+[\d,]*\)$/, ''),
          category: isRes ? 'Resources' : 'Activities',
          eventName: 'Guild Versus Daily',
          amount: step,
          points,
          stock,
          hint: 'Daily challenge points for guild score'
        });
      }
    }

    // 2. Titan Dungeon
    const dungeon = cache?.dungeonStatus?.data;
    if (dungeon && (dungeon.floorNumber || dungeon.maxFloorPassed)) {
      const floor = dungeon.floorNumber || (dungeon.maxFloorPassed + 1);
      addOrMergeGoal({
        key: 'act:dungeon',
        title: 'Titan Dungeon Exploration',
        category: 'Activities',
        eventName: 'Titan Dungeon',
        amount: 1,
        unit: 'floor',
        points: 0,
        stock: null,
        hint: `Floor ${floor} • Prime element: ${dungeon.elements?.prime ? dungeon.elements.prime.charAt(0).toUpperCase() + dungeon.elements.prime.slice(1) : 'Earth'}`
      });
    }

    // 3. Guild War Championship
    const gwStatus = cache?.clanWarChampStatus?.data;
    if (gwStatus) {
      const tries = gwStatus.tries ?? 2;
      addOrMergeGoal({
        key: 'act:guild_war',
        title: 'Guild War Championship Attacks',
        category: 'Activities',
        eventName: 'Guild War',
        amount: tries > 0 ? tries : 1,
        unit: 'attack',
        points: 0,
        stock: null,
        hint: `${tries} war attacks remaining today`
      });
    }

    // 4. Special Quest Events
    const questEvents = cache?.questEvents?.data?.events;
    if (Array.isArray(questEvents)) {
      for (const qe of questEvents) {
        const titleMap = {
          ADVENTURE_HERO62_TITLE_EVENT_UPGRADE: 'Soleil Upgrade Event',
          DAEMONSKIN22_UI_TITLE: 'Demon Skin Festival'
        };
        const title = titleMap[qe.name_localeKey] || qe.name_localeKey?.replace(/_/g, ' ') || `Special Event #${qe.id}`;
        addOrMergeGoal({
          key: `act:special_event_${qe.id}`,
          title: `Special Quest: ${title}`,
          category: 'Activities',
          eventName: title,
          amount: 1,
          unit: 'quest',
          points: 0,
          stock: null,
          hint: 'Active special event quests and milestones'
        });
      }
    }

    // Sort comparator:
    // 1. Overlapping goals first (synergy across multiple events)
    // 2. Ready to complete: In-stock resources & daily-limited activities
    // 3. Points earnable descending
    // 4. Title alphabetical
    function compareGoals(a, b) {
      const aOverlap = a.overlapCount > 1 ? a.overlapCount : 0;
      const bOverlap = b.overlapCount > 1 ? b.overlapCount : 0;
      if (aOverlap !== bOverlap) return bOverlap - aOverlap;

      const aUrgent = a.category === 'Resources' ? Boolean(a.inStock) : Boolean(a.isLimited);
      const bUrgent = b.category === 'Resources' ? Boolean(b.inStock) : Boolean(b.isLimited);
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

      const aPts = a.totalPoints || 0;
      const bPts = b.totalPoints || 0;
      if (aPts !== bPts) return bPts - aPts;

      return a.title.localeCompare(b.title);
    }

    const allGoals = Array.from(goalsMap.values());
    const activities = allGoals.filter((g) => g.category === 'Activities').sort(compareGoals);
    const resources = allGoals.filter((g) => g.category === 'Resources').sort(compareGoals);

    return {
      all: allGoals.sort(compareGoals),
      activities,
      resources,
      metrics: {
        totalGoals: allGoals.length,
        synergiesCount: allGoals.filter((g) => g.overlapCount > 1).length,
        readyCount: allGoals.filter((g) => (g.category === 'Resources' && g.inStock) || (g.category === 'Activities' && g.isLimited)).length
      }
    };
  }

  globalThis.hwaHelperPopupData = { heroSoulProgress, titanSoulProgress, isSoulUpgradeReady, teamRows, sortRows,
    isNumericColumn, rallyTooltip, isMarchExpired, marchDuration,
    draftStageDescription, formatCountdown, isDraftActive,
    defaultDraftCandidates, validateDraftPicks, getDraftActiveStep,
    buildingTooltip, researchTooltip, formatChatRole, formatChatTime, tableExportFilename, exportTableData,
    getChallengeResourceStock, normalizeGoalKey, extractEventGoals };
})();
