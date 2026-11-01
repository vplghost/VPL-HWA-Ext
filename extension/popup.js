const CACHE_KEY = 'rpcCache';
const view = document.querySelector('#view');
const status = document.querySelector('#status');
const search = document.querySelector('#search');
const itemGroup = document.querySelector('#item-group');
const logSort = document.querySelector('#log-sort');
const resourceSort = document.querySelector('#resource-sort');
const tabs = [...document.querySelectorAll('[data-tab]')];
let activeTab = 'heroes';
let settingsPending = Promise.resolve();
let renderTimer;
let currentCache = {};
let currentProductionRates = {};
const sortState = {};

document.querySelector('#version').textContent = chrome.runtime.getManifest().version;
const openTabButton = document.querySelector('#open-tab');
if (new URLSearchParams(location.search).get('view') === 'tab') {
  openTabButton.hidden = true;
}
if (chrome.tabs?.getCurrent) {
  chrome.tabs.getCurrent((tab) => {
    if (tab) openTabButton.hidden = true;
  });
}
openTabButton.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=tab') });
});

const draftBannerBtn = document.querySelector('#draft-banner-btn');
if (draftBannerBtn) {
  draftBannerBtn.addEventListener('click', () => {
    activeTab = 'draft';
    const tabButtons = [...document.querySelectorAll('[data-tab]')];
    tabButtons.forEach((tab) => { tab.setAttribute('aria-selected', String(tab.dataset.tab === 'draft')); });
    search.value = '';
    render();
  });
}

const formatNumber = (value) => typeof value === 'number' ? value.toLocaleString('en-US') : '—';
const formatTime = (value) => value ? new Date(value).toLocaleString('en-US') : 'not available';
const byId = ([a], [b]) => Number(a) - Number(b);
const resourceData = globalThis.hwaHelperResourceData;

function resourceLabel(entry) {
  const id = entry.key.slice('resource:'.length);
  const [type, itemId] = id.split(':');
  if (type === 'refillable') {
    return globalThis.hwaHelperRefillableRules?.[itemId]?.label || entry.data.label;
  }
  if (type && itemId && !id.startsWith('refillable:') && !id.startsWith('world-refillable:')) {
    return globalThis.hwaHelperNameMap.item(type, itemId) || entry.data.label;
  }
  return entry.data.label;
}

function isRenewable(entry) {
  if (entry.data.renewable) return true;
  const id = entry.key.slice('resource:'.length);
  if (id === 'world-energy' || id === 'energy') return true;
  if (/^material:[1-5]$/.test(id)) return true;
  const match = /^refillable:(\d+)$/.exec(id);
  return !!(match && globalThis.hwaHelperRefillableRules?.[match[1]]);
}

function isSelectableForHeader(entry) {
  return isRenewable(entry) && !['resource:energy', 'resource:world-energy'].includes(entry.key);
}

function resourceAppearance(entry) {
  const key = entry.key;
  if (key === 'resource:refillable:2') return { icon: '✦',
    classes: 'bg-violet-50 text-violet-800 ring-violet-200' };
  if (key === 'resource:material:5') return { icon: '🍞',
    classes: 'bg-amber-50 text-amber-900 ring-amber-200' };
  if (key === 'resource:material:4') return { icon: '🌲',
    classes: 'bg-green-50 text-green-800 ring-green-200' };
  if (key === 'resource:material:3') return { icon: '◆',
    classes: 'bg-slate-100 text-slate-700 ring-slate-300' };
  if (key === 'resource:material:2') return { icon: '⚙',
    classes: 'bg-blue-50 text-blue-800 ring-blue-200' };
  if (key === 'resource:material:1') return { icon: '✧',
    classes: 'bg-cyan-50 text-cyan-800 ring-cyan-200' };
  if (key.includes('energy') || key.startsWith('resource:refillable:')) return { icon: '⚡',
    classes: 'bg-orange-50 text-orange-800 ring-orange-200' };
  return { icon: '◉', classes: 'bg-slate-100 text-slate-700 ring-slate-200' };
}

function resourceEntries(cache) {
  return Object.values(cache).filter((entry) => entry.key?.startsWith('resource:') &&
    Number.isFinite(entry.data?.amount));
}

function resourceTooltip(entry, now = Date.now()) {
  const value = resourceData.amountAt(entry, now);
  const amount = resourceData.formatAmount(value);
  const exact = Number.isFinite(value) && Math.abs(value) >= 1000000 ?
    ` (${formatNumber(value)})` : '';
  const softCap = ['resource:energy', 'resource:refillable:2'].includes(entry.key);
  const cap = Number.isFinite(entry.data.cap) ?
    ` / ${resourceData.formatAmount(entry.data.cap)}${softCap ? ' soft cap' : ''}` : '';
  const energyInterval = Number.isFinite(entry.data.refillEveryMs) &&
    entry.data.refillEveryMs > 0 ? entry.data.refillEveryMs : 360000;
  const refill = entry.key === 'resource:energy' ?
    `+1 every ${Math.round(energyInterval / 60000)} min` :
    resourceData.refillDescription(entry, now);
  const materialId = /^resource:material:([1-5])$/.exec(entry.key)?.[1];
  const production = materialId ? currentProductionRates[materialId] : null;
  const detail = refill || (Number.isFinite(production) ?
    `Estimated production: ~${formatNumber(Math.round(production))}/min` : isRenewable(entry) ?
    'Production rate unavailable; inventory updates after collection' : '');
  return `${resourceLabel(entry)}: ${amount}${exact}${cap}${detail ? `\n${detail}` : ''}`;
}

function setResourceTooltip(node, value) {
  if (node.dataset.resourceTooltip !== value) node.dataset.resourceTooltip = value;
}

const marchStyles = {
  food: { icon: '🌾', label: 'Food', classes: 'bg-amber-100 text-amber-800 ring-amber-300' },
  wood: { icon: '🌲', label: 'Wood', classes: 'bg-green-100 text-green-800 ring-green-300' },
  stone: { icon: '◆', label: 'Stone', classes: 'bg-slate-200 text-slate-700 ring-slate-300' },
  iron: { icon: '⚙', label: 'Iron', classes: 'bg-blue-100 text-blue-800 ring-blue-300' },
  mine: { icon: '⛏', label: 'Mine', classes: 'bg-teal-100 text-teal-800 ring-teal-300' },
  attack: { icon: '⚔', label: 'Attack', classes: 'bg-red-100 text-red-800 ring-red-300' },
  raid: { icon: '⚑', label: 'Raid', classes: 'bg-orange-100 text-orange-800 ring-orange-300' },
  scout: { icon: '⌖', label: 'Scout', classes: 'bg-violet-100 text-violet-800 ring-violet-300' },
  return: { icon: '↩', label: 'Return', classes: 'bg-slate-100 text-slate-600 ring-slate-200' }
};

function marchTooltip(march, now) {
  if (march.rally) return globalThis.hwaHelperPopupData.rallyTooltip(march, now,
    globalThis.hwaHelperNameMap.hero);
  const style = marchStyles[march.kind] || marchStyles.attack;
  const isMine = ['food', 'wood', 'stone', 'iron', 'mine'].includes(march.kind);
  const action = isMine ?
    `${march.stage === 'interactionWithTarget' ? 'Gathering' : 'Traveling to'} ${style.label}` :
    march.kind === 'return' ? 'Returning' :
    march.stage === 'waitingForRallyStart' ? 'Preparing raid' : `${style.label} march`;
  const remaining = Number.isFinite(march.endsAt) ?
    Math.ceil((march.endsAt - now) / 1000) : null;
  const time = remaining === null ? 'Time unavailable' :
    remaining <= 0 ? 'Due now' : `${resourceData.tooltipTime(remaining)} remaining`;
  return `${action}\n${time}`;
}

function refreshTimed() {
  const now = Date.now();
  const marches = currentCache.marchStatus?.data?.marches || [];
  const marchesWrap = document.querySelector('#marches');
  for (const badge of marchesWrap.querySelectorAll('[data-march-index]')) {
    const march = marches[Number(badge.dataset.marchIndex)];
    if (!march) continue;
    const expired = Number.isFinite(march.endsAt) && march.endsAt <= now;
    const rallyStale = Number.isFinite(march.rally?.waitUntil) &&
      now > march.rally.waitUntil + 30 * 60000;
    badge.hidden = march.rally ?
      (march.stage === 'returnToOutpost' ? expired : rallyStale) : expired;
    if (!badge.hidden) {
      const tooltip = marchTooltip(march, now);
      setResourceTooltip(badge, tooltip);
      if (badge.getAttribute('aria-label') !== tooltip) badge.setAttribute('aria-label', tooltip);
    }
  }
  marchesWrap.hidden = ![...marchesWrap.children].some((badge) => !badge.hidden);
  const energy = currentCache['resource:energy'];
  document.querySelector('#energy-value').textContent = resourceData.formatAmount(
    resourceData.amountAt(energy) ?? currentCache.energyStatus?.data?.energy);
  document.querySelector('#energy-max').textContent = resourceData.formatAmount(energy?.data?.cap);
  document.querySelector('#world-energy-value').textContent = resourceData.formatAmount(
    resourceData.amountAt(currentCache['resource:world-energy']) ??
      currentCache.worldEnergyStatus?.data?.energy);
  if (energy) setResourceTooltip(document.querySelector('#energy-badge'), resourceTooltip(energy));
  const worldEnergy = currentCache['resource:world-energy'];
  if (worldEnergy) setResourceTooltip(document.querySelector('#world-energy-badge'),
    resourceTooltip(worldEnergy));
  document.querySelector('#building-time').textContent = resourceData.hoursMinutes(
    resourceData.remainingMinutes(currentCache.buildingStatus, now));
  document.querySelector('#research-time').textContent = resourceData.hoursMinutes(
    resourceData.remainingMinutes(currentCache.researchStatus, now));
  setResourceTooltip(document.querySelector('#building-badge'),
    globalThis.hwaHelperPopupData.buildingTooltip(currentCache.buildingStatus, now, globalThis.hwaHelperNameMap.building));
  setResourceTooltip(document.querySelector('#research-badge'),
    globalThis.hwaHelperPopupData.researchTooltip(currentCache.researchStatus, now, globalThis.hwaHelperNameMap.research));
  for (const node of document.querySelectorAll('[data-resource-amount]')) {
    const entry = currentCache[node.dataset.resourceAmount];
    if (!entry) continue;
    node.textContent = resourceData.formatAmount(resourceData.amountAt(entry));
    setResourceTooltip(node.parentElement, resourceTooltip(entry));
  }
  const draftStatus = currentCache.legendDraftStatus?.data;
  if (draftStatus?.stageFinishTs) {
    const formatted = globalThis.hwaHelperPopupData.formatCountdown(draftStatus.stageFinishTs);
    const bannerTimer = document.querySelector('#draft-banner-timer');
    if (bannerTimer) bannerTimer.textContent = formatted;
    const pageTimer = document.querySelector('#draft-countdown');
    if (pageTimer) pageTimer.textContent = formatted;
  }
}

function renderResources(entries, selection) {
  const selected = new Set(selection);
  const rows = entries.filter((entry) => matches([resourceLabel(entry), entry.key]));
  const sort = resourceSort.value;
  rows.sort((a, b) => sort === 'name' ? resourceLabel(a).localeCompare(resourceLabel(b)) :
    (resourceData.amountAt(a) - resourceData.amountAt(b)) * (sort === 'amount-desc' ? -1 : 1));
  status.textContent = `${rows.length} resources · select renewable resources for the header`;
  if (!rows.length) return showEmpty('No matching resources observed yet.');
  const list = document.createElement('div');
  list.className = 'divide-y divide-slate-100';
  for (const entry of rows) {
    const label = document.createElement('label');
    label.className = 'flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-blue-50/50';
    label.tabIndex = 0;
    label.dataset.resourceTooltip = '';
    if (isSelectableForHeader(entry)) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(entry.key);
      checkbox.className = 'size-4 accent-blue-600';
      checkbox.addEventListener('change', async () => {
        const stored = await chrome.storage.local.get('resourceSelection');
        const next = new Set(stored.resourceSelection || []);
        if (checkbox.checked) next.add(entry.key);
        else next.delete(entry.key);
        await chrome.storage.local.set({ resourceSelection: [...next] });
      });
      label.append(checkbox);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'size-4 shrink-0';
      label.append(spacer);
    }
    const name = document.createElement('span');
    name.className = 'min-w-0 flex-1 truncate text-slate-700';
    name.textContent = resourceLabel(entry);
    const amount = document.createElement('strong');
    amount.className = 'tabular-nums text-slate-900';
    amount.dataset.resourceAmount = entry.key;
    amount.textContent = resourceData.formatAmount(resourceData.amountAt(entry));
    label.append(name, amount);
    list.append(label);
  }
  view.append(list);
}

function starIcons(count) {
  const wrap = document.createElement('span');
  wrap.className = 'inline-flex items-center gap-0.5';
  if (!Number.isInteger(count) || count < 1) {
    wrap.textContent = '—';
    return wrap;
  }
  const color = ['text-white', 'text-green-500', 'text-blue-500',
    'text-violet-500', 'text-orange-400'][Math.min(count, 5) - 1];
  wrap.setAttribute('aria-label', `${count} stars`);
  wrap.title = `${count} stars`;
  for (let index = 0; index < count; index++) {
    const star = document.createElement('span');
    star.className = `${color} text-base leading-none drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)]`;
    star.textContent = '★';
    star.setAttribute('aria-hidden', 'true');
    wrap.append(star);
  }
  return wrap;
}

const factionColors = {
  'Way of Eternity': {
    dot: 'bg-purple-400',
    gradient: 'from-purple-600 to-indigo-800'
  },
  'Way of Nature': {
    dot: 'bg-emerald-400',
    gradient: 'from-emerald-600 to-teal-800'
  },
  'Way of Honor': {
    dot: 'bg-amber-400',
    gradient: 'from-amber-500 to-yellow-700'
  },
  'Way of Chaos': {
    dot: 'bg-red-400',
    gradient: 'from-red-600 to-rose-800'
  },
  'Way of Progress': {
    dot: 'bg-sky-400',
    gradient: 'from-sky-500 to-blue-700'
  },
  'Way of Mystery': {
    dot: 'bg-violet-400',
    gradient: 'from-violet-600 to-purple-800'
  }
};

const titanElementColors = {
  Water: { dot: 'bg-sky-400', gradient: 'from-sky-500 to-blue-700' },
  Fire: { dot: 'bg-red-500', gradient: 'from-amber-600 to-red-700' },
  Earth: { dot: 'bg-emerald-500', gradient: 'from-emerald-600 to-green-800' },
  Darkness: { dot: 'bg-purple-400', gradient: 'from-purple-800 to-slate-900' },
  Light: { dot: 'bg-amber-300', gradient: 'from-amber-400 to-yellow-600' },
  Spirit: { dot: 'bg-indigo-400', gradient: 'from-indigo-500 to-violet-700' }
};

function starGlowClass(starCount, isLarge = false) {
  const prefix = isLarge ? 'avatar-star-lg-' : 'avatar-star-';
  const count = Number(starCount);
  if (Number.isInteger(count) && count >= 1 && count <= 6) {
    return `${prefix}${count}`;
  }
  return `${prefix}default`;
}

function createInitialsBadge(name, theme, isLarge = false, glowClass = '') {
  const badge = document.createElement('span');
  const gradient = factionColors[theme]?.gradient ||
    titanElementColors[theme]?.gradient ||
    'from-slate-600 to-slate-800';
  const glow = glowClass || (isLarge ? 'avatar-star-lg-default' : 'avatar-star-default');
  if (isLarge) {
    badge.className = `inline-flex size-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-xl font-bold text-white ${glow}`;
  } else {
    badge.className = `inline-flex size-4 -my-0.5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-[9px] font-bold text-white ${glow}`;
  }
  badge.textContent = (name || '?').charAt(0).toUpperCase();
  return badge;
}

function createHeroInline(heroId, displayName, heroSnapshot) {
  const meta = globalThis.hwaHelperHeroMetadata?.[heroId];
  if (!meta) {
    const textNode = document.createElement('span');
    textNode.textContent = displayName;
    return textNode;
  }

  const starCount = heroSnapshot?.star;
  const smallGlow = starGlowClass(starCount, false);
  const largeGlow = starGlowClass(starCount, true);
  const avatarPath = meta.avatarFile || (meta.hasAvatar ? `assets/heroes/${heroId}.webp` : null);

  const container = document.createElement('span');
  container.className = 'hero-hover-trigger group/hero inline-flex items-center gap-1.5 align-middle cursor-pointer';
  container.tabIndex = 0;
  container.setAttribute('aria-label', `${displayName} info`);

  if (avatarPath) {
    const img = document.createElement('img');
    img.src = avatarPath;
    img.alt = displayName;
    img.className = `size-4 rounded-full object-cover -my-0.5 shrink-0 ${smallGlow} group-hover/hero:brightness-110`;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.replaceWith(createInitialsBadge(displayName, meta.faction, false, smallGlow));
    }, { once: true });
    container.append(img);
  } else {
    container.append(createInitialsBadge(displayName, meta.faction, false, smallGlow));
  }

  const nameLabel = document.createElement('span');
  nameLabel.className = 'group-hover/hero:text-blue-600 transition-colors';
  nameLabel.textContent = displayName;
  container.append(nameLabel);

  const card = document.createElement('div');
  card.className = 'hero-hover-card';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3';

  if (avatarPath) {
    const bigImg = document.createElement('img');
    bigImg.src = avatarPath;
    bigImg.alt = displayName;
    bigImg.className = `size-14 rounded-lg object-cover shrink-0 ${largeGlow}`;
    bigImg.addEventListener('error', () => {
      bigImg.replaceWith(createInitialsBadge(displayName, meta.faction, true, largeGlow));
    }, { once: true });
    header.append(bigImg);
  } else {
    header.append(createInitialsBadge(displayName, meta.faction, true, largeGlow));
  }

  const infoCol = document.createElement('div');
  infoCol.className = 'min-w-0 flex-1 space-y-0.5';

  const nameEl = document.createElement('div');
  nameEl.className = 'font-bold text-sm text-white truncate';
  nameEl.textContent = displayName;
  infoCol.append(nameEl);

  const starsEl = document.createElement('div');
  starsEl.className = 'flex items-center gap-1 text-xs';
  if (Number.isInteger(starCount) && starCount >= 1) {
    starsEl.append(starIcons(starCount));
  } else {
    starsEl.className += ' text-slate-400';
    starsEl.textContent = 'Stars: —';
  }
  infoCol.append(starsEl);

  const powerEl = document.createElement('div');
  powerEl.className = 'text-xs text-amber-300 font-medium tabular-nums';
  powerEl.textContent = Number.isFinite(heroSnapshot?.power) ?
    `⚡ Power: ${formatNumber(heroSnapshot.power)}` : 'Power: —';
  infoCol.append(powerEl);

  header.append(infoCol);
  card.append(header);

  const divider = document.createElement('div');
  divider.className = 'border-t border-slate-700/80 my-2';
  card.append(divider);

  const details = document.createElement('div');
  details.className = 'grid grid-cols-2 gap-2 text-[11px]';

  const roleBox = document.createElement('div');
  roleBox.className = 'rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60';
  const roleLabel = document.createElement('span');
  roleLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
  roleLabel.textContent = 'Role';
  const roleVal = document.createElement('span');
  roleVal.className = 'font-medium text-slate-200 block truncate';
  roleVal.textContent = `${meta.class} (${meta.role})`;
  roleBox.append(roleLabel, roleVal);

  const factionBox = document.createElement('div');
  const factionTheme = factionColors[meta.faction];
  factionBox.className = 'rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60';
  const facLabel = document.createElement('span');
  facLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
  facLabel.textContent = 'Faction';
  const facVal = document.createElement('span');
  facVal.className = 'font-medium text-slate-200 flex items-center gap-1 truncate';
  if (factionTheme) {
    const dot = document.createElement('span');
    dot.className = `size-1.5 rounded-full ${factionTheme.dot} shrink-0`;
    facVal.append(dot);
  }
  const facText = document.createElement('span');
  facText.className = 'truncate';
  facText.textContent = meta.faction.replace('Way of ', '');
  facVal.append(facText);
  factionBox.append(facLabel, facVal);

  details.append(roleBox, factionBox);

  if (Number.isInteger(heroSnapshot?.titanGiftLevel) && heroSnapshot.titanGiftLevel > 0) {
    const sparkBox = document.createElement('div');
    sparkBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between';
    const sparkLabel = document.createElement('span');
    sparkLabel.className = 'text-slate-400 text-[10px] uppercase tracking-wider font-semibold';
    sparkLabel.textContent = 'Spark of Power';
    const sparkVal = document.createElement('span');
    sparkVal.className = 'font-semibold text-purple-300 text-xs tabular-nums';
    sparkVal.textContent = `Lv. ${heroSnapshot.titanGiftLevel} / 30`;
    sparkBox.append(sparkLabel, sparkVal);
    details.append(sparkBox);
  }

  if (heroSnapshot?.skills && Object.keys(heroSnapshot.skills).length) {
    const skillsBox = document.createElement('div');
    skillsBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const skillsLabel = document.createElement('span');
    skillsLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    skillsLabel.textContent = 'Skills';
    const skillsList = document.createElement('div');
    skillsList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const sortedKeys = Object.keys(heroSnapshot.skills).sort((a, b) => Number(a) - Number(b));
    sortedKeys.forEach((key, idx) => {
      const badge = document.createElement('span');
      badge.className = 'rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300 tabular-nums';
      badge.textContent = `S${idx + 1}: ${heroSnapshot.skills[key]}`;
      skillsList.append(badge);
    });
    skillsBox.append(skillsLabel, skillsList);
    details.append(skillsBox);
  }

  if (heroSnapshot?.skins && Object.keys(heroSnapshot.skins).length) {
    const skinsBox = document.createElement('div');
    skinsBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const skinsLabel = document.createElement('span');
    skinsLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    skinsLabel.textContent = 'Skins';
    const skinsList = document.createElement('div');
    skinsList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const skinEntries = Object.entries(heroSnapshot.skins).sort(([a], [b]) => Number(a) - Number(b));
    for (const [skinId, level] of skinEntries) {
      const isCurrent = Number(skinId) === Number(heroSnapshot.currentSkin);
      const badge = document.createElement('span');
      badge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        isCurrent ? 'bg-amber-900/60 text-amber-200 ring-1 ring-amber-500/50' : 'bg-slate-700/80 text-amber-300'
      }`;
      let stat = globalThis.hwaHelperSkinStats?.[skinId];
      if (!stat || stat === 'MAIN' || Number(skinId) === Number(heroSnapshot.baseSkinId) || (Number(skinId) <= 100 && !globalThis.hwaHelperSkinStats?.[skinId])) {
        const mainStat = meta.mainStat || (meta.role === 'Tank' || meta.class === 'Warrior' ? 'strength' : meta.class === 'Marksman' ? 'agility' : 'intelligence');
        stat = mainStat === 'strength' ? 'Str' : mainStat === 'agility' ? 'Agi' : 'Int';
      }
      badge.textContent = `${stat}: ${level}`;
      skinsList.append(badge);
    }
    skinsBox.append(skinsLabel, skinsList);
    details.append(skinsBox);
  }

  const rawRunes = heroSnapshot?.hero_runes || heroSnapshot?.runes;
  const heroRunes = Array.isArray(rawRunes)
    ? rawRunes
    : (rawRunes && typeof rawRunes === 'object' ? Object.values(rawRunes) : null);
  if (Array.isArray(heroRunes) && heroRunes.length && heroRunes.some(r => r > 0)) {
    const glyphsBox = document.createElement('div');
    glyphsBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const glyphsLabel = document.createElement('span');
    glyphsLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    glyphsLabel.textContent = 'Glyphs';
    const glyphsList = document.createElement('div');
    glyphsList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const glyphStats = globalThis.hwaHelperHeroGlyphs?.[heroId] || ['PA', 'HP', 'Arm', 'Crit', 'Str'];
    heroRunes.forEach((lvl, idx) => {
      const stat = glyphStats[idx] || `G${idx + 1}`;
      const badge = document.createElement('span');
      badge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        lvl > 0 ? 'bg-slate-700/80 text-emerald-300' : 'bg-slate-800 text-slate-500'
      }`;
      badge.textContent = `${stat}: ${lvl}`;
      glyphsList.append(badge);
    });
    glyphsBox.append(glyphsLabel, glyphsList);
    details.append(glyphsBox);
  }

  if (Array.isArray(heroSnapshot?.artifacts) && heroSnapshot.artifacts.length) {
    const artBox = document.createElement('div');
    artBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const artLabel = document.createElement('span');
    artLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    artLabel.textContent = 'Artifacts';
    const artList = document.createElement('div');
    artList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const typeAbbr = { weapon: 'Wpn', book: 'Book', ring: 'Ring' };
    for (const art of heroSnapshot.artifacts) {
      const badge = document.createElement('span');
      badge.className = 'rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 tabular-nums';
      const name = typeAbbr[art.artifactType] || art.artifactType || 'Art';
      badge.textContent = `${name}: ${art.star || 0}★ Lv.${art.level || 0}`;
      artList.append(badge);
    }
    artBox.append(artLabel, artList);
    details.append(artBox);
  }

  card.append(details);

  container.addEventListener('mouseenter', () => {
    if (typeof container.getBoundingClientRect !== 'function') return;
    const rect = container.getBoundingClientRect();
    const viewEl = document.getElementById('view');
    const viewRect = viewEl?.getBoundingClientRect?.();
    if (viewRect && viewRect.bottom - rect.bottom < 300 && rect.top - viewRect.top > 250) {
      card.style.top = 'auto';
      card.style.bottom = 'calc(100% + 0.35rem)';
    } else {
      card.style.top = 'calc(100% + 0.35rem)';
      card.style.bottom = 'auto';
    }
  });

  container.append(card);

  return container;
}

function createTitanInline(titanId, displayName, titanSnapshot) {
  const meta = globalThis.hwaHelperTitanMetadata?.[titanId];
  if (!meta) {
    const textNode = document.createElement('span');
    textNode.textContent = displayName;
    return textNode;
  }

  const starCount = titanSnapshot?.star;
  const smallGlow = starGlowClass(starCount, false);
  const largeGlow = starGlowClass(starCount, true);
  const avatarPath = meta.avatarFile || (meta.hasAvatar ? `assets/titans/${titanId}.png` : null);

  const container = document.createElement('span');
  container.className = 'hero-hover-trigger group/hero inline-flex items-center gap-1.5 align-middle cursor-pointer';
  container.tabIndex = 0;
  container.setAttribute('aria-label', `${displayName} info`);

  if (avatarPath) {
    const img = document.createElement('img');
    img.src = avatarPath;
    img.alt = displayName;
    img.className = `size-4 rounded-full object-cover -my-0.5 shrink-0 ${smallGlow} group-hover/hero:brightness-110`;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.replaceWith(createInitialsBadge(displayName, meta.element, false, smallGlow));
    }, { once: true });
    container.append(img);
  } else {
    container.append(createInitialsBadge(displayName, meta.element, false, smallGlow));
  }

  const nameLabel = document.createElement('span');
  nameLabel.className = 'group-hover/hero:text-blue-600 transition-colors';
  nameLabel.textContent = displayName;
  container.append(nameLabel);

  const card = document.createElement('div');
  card.className = 'hero-hover-card';

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3';

  if (avatarPath) {
    const bigImg = document.createElement('img');
    bigImg.src = avatarPath;
    bigImg.alt = displayName;
    bigImg.className = `size-14 rounded-lg object-cover shrink-0 ${largeGlow}`;
    bigImg.addEventListener('error', () => {
      bigImg.replaceWith(createInitialsBadge(displayName, meta.element, true, largeGlow));
    }, { once: true });
    header.append(bigImg);
  } else {
    header.append(createInitialsBadge(displayName, meta.element, true, largeGlow));
  }

  const infoCol = document.createElement('div');
  infoCol.className = 'min-w-0 flex-1 space-y-0.5';

  const nameEl = document.createElement('div');
  nameEl.className = 'font-bold text-sm text-white truncate';
  nameEl.textContent = displayName;
  infoCol.append(nameEl);

  const starsEl = document.createElement('div');
  starsEl.className = 'flex items-center gap-1 text-xs';
  if (Number.isInteger(starCount) && starCount >= 1) {
    starsEl.append(starIcons(starCount));
  } else {
    starsEl.className += ' text-slate-400';
    starsEl.textContent = 'Stars: —';
  }
  infoCol.append(starsEl);

  const powerEl = document.createElement('div');
  powerEl.className = 'text-xs text-amber-300 font-medium tabular-nums';
  powerEl.textContent = Number.isFinite(titanSnapshot?.power) ?
    `⚡ Power: ${formatNumber(titanSnapshot.power)}` : 'Power: —';
  infoCol.append(powerEl);

  header.append(infoCol);
  card.append(header);

  const divider = document.createElement('div');
  divider.className = 'border-t border-slate-700/80 my-2';
  card.append(divider);

  const details = document.createElement('div');
  details.className = 'grid grid-cols-2 gap-2 text-[11px]';

  const roleBox = document.createElement('div');
  roleBox.className = 'rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60';
  const roleLabel = document.createElement('span');
  roleLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
  roleLabel.textContent = 'Role';
  const roleVal = document.createElement('span');
  roleVal.className = 'font-medium text-slate-200 block truncate';
  roleVal.textContent = meta.role;
  roleBox.append(roleLabel, roleVal);

  const elemBox = document.createElement('div');
  const elemTheme = titanElementColors[meta.element];
  elemBox.className = 'rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60';
  const elemLabel = document.createElement('span');
  elemLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
  elemLabel.textContent = 'Element';
  const elemVal = document.createElement('span');
  elemVal.className = 'font-medium text-slate-200 flex items-center gap-1 truncate';
  if (elemTheme) {
    const dot = document.createElement('span');
    dot.className = `size-1.5 rounded-full ${elemTheme.dot} shrink-0`;
    elemVal.append(dot);
  }
  const elemText = document.createElement('span');
  elemText.className = 'truncate';
  elemText.textContent = meta.element;
  elemVal.append(elemText);
  elemBox.append(elemLabel, elemVal);

  details.append(roleBox, elemBox);
  card.append(details);

  container.addEventListener('mouseenter', () => {
    if (typeof container.getBoundingClientRect !== 'function') return;
    const rect = container.getBoundingClientRect();
    const viewEl = document.getElementById('view');
    const viewRect = viewEl?.getBoundingClientRect?.();
    if (viewRect && viewRect.bottom - rect.bottom < 300 && rect.top - viewRect.top > 250) {
      card.style.top = 'auto';
      card.style.bottom = 'calc(100% + 0.35rem)';
    } else {
      card.style.top = 'calc(100% + 0.35rem)';
      card.style.bottom = 'auto';
    }
  });

  container.append(card);

  return container;
}

function createTeamSquadCell(ids, fallbackText) {
  if (!Array.isArray(ids) || !ids.length) {
    const span = document.createElement('span');
    span.textContent = fallbackText || '—';
    return span;
  }
  const wrap = document.createElement('span');
  wrap.className = 'inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle';
  for (const [index, id] of ids.entries()) {
    const isHero = Number(id) < 4000;
    const name = globalThis.hwaHelperNameMap.hero(id) || `#${id}`;
    if (isHero) {
      const heroSnapshot = currentCache.heroGetAll?.data?.[id];
      wrap.append(createHeroInline(id, name, heroSnapshot));
    } else {
      const titanSnapshot = currentCache.titanGetAll?.data?.[id];
      wrap.append(createTitanInline(id, name, titanSnapshot));
    }
    if (index < ids.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'text-slate-400 select-none';
      sep.textContent = '·';
      wrap.append(sep);
    }
  }
  return wrap;
}

function table(headings, rows) {
  const isNumericColumn = globalThis.hwaHelperPopupData.isNumericColumn;
  const element = document.createElement('table');
  element.className = 'min-w-full border-collapse text-left text-xs';
  const header = document.createElement('tr');
  const selectedSort = sortState[activeTab];
  for (const [index, heading] of headings.entries()) {
    const cell = document.createElement('th');
    cell.className = 'sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-2 font-semibold whitespace-nowrap text-slate-700';
    if (isNumericColumn(heading)) cell.className += ' text-right tabular-nums';
    cell.setAttribute('aria-sort', selectedSort?.column === index ?
      (selectedSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `flex w-full cursor-pointer items-center gap-1 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 ${isNumericColumn(heading) ? 'justify-end text-right' : 'text-left'}`;
    button.textContent = `${heading} ${selectedSort?.column === index ?
      (selectedSort.direction === 'asc' ? '↑' : '↓') : '↕'}`;
    button.addEventListener('click', () => {
      sortState[activeTab] = { column: index,
        direction: selectedSort?.column === index && selectedSort.direction === 'asc' ? 'desc' : 'asc' };
      render();
    });
    cell.append(button);
    header.append(cell);
  }
  element.append(header);
  const sortedRows = selectedSort ?
    globalThis.hwaHelperPopupData.sortRows(rows, selectedSort.column, selectedSort.direction) : rows;
  const soulColIndex = headings.indexOf('Soul stones');
  const isSoulUpgradeReady = globalThis.hwaHelperPopupData?.isSoulUpgradeReady;
  for (const values of sortedRows) {
    const line = document.createElement('tr');
    const canEvolve = soulColIndex !== -1 && Boolean(isSoulUpgradeReady?.(values[soulColIndex]));
    line.className = canEvolve ?
      'border-b border-emerald-100 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-950 font-medium' :
      'border-b border-slate-100 hover:bg-blue-50/50';
    if (canEvolve) line.dataset.canEvolve = 'true';
    for (const [column, heading] of headings.entries()) {
      const value = values[column];
      const cell = document.createElement('td');
      cell.className = 'px-3 py-2 align-top text-slate-700';
      if (heading === 'Star') {
        cell.append(starIcons(value));
      } else if (heading === 'Name' && activeTab === 'heroes') {
        const heroId = values[0];
        const heroSnapshot = currentCache.heroGetAll?.data?.[heroId];
        cell.append(createHeroInline(heroId, String(value ?? '—'), heroSnapshot));
      } else if (heading === 'Name' && activeTab === 'titans') {
        const titanId = values[0];
        const titanSnapshot = currentCache.titanGetAll?.data?.[titanId];
        cell.append(createTitanInline(titanId, String(value ?? '—'), titanSnapshot));
      } else if (heading === 'Hero/Titan names' && activeTab === 'teams') {
        const ids = values[4];
        cell.append(createTeamSquadCell(ids, String(value ?? '—')));
      } else if (heading === 'Soul stones' && canEvolve) {
        cell.className += ' text-emerald-800 font-bold';
        cell.textContent = String(value ?? '—');
      } else {
        cell.textContent = String(value ?? '—');
      }
      if (isNumericColumn(heading)) cell.className += ' text-right tabular-nums';
      line.append(cell);
    }
    element.append(line);
  }
  return element;
}

function showEmpty(message) {
  const text = document.createElement('p');
  text.className = 'p-4 text-sm text-slate-500';
  text.textContent = message;
  view.append(text);
}

function matches(values) {
  const query = search.value.trim().toLocaleLowerCase();
  return !query || values.some((value) => String(value).toLocaleLowerCase().includes(query));
}

function showSnapshot(entry, headings, makeRows) {
  if (!entry?.data) {
    status.textContent = 'No cached data yet. Use the game to observe RPCs.';
    showEmpty('No matching RPC observed yet.');
    return;
  }
  const rows = makeRows(entry.data).filter(matches);
  status.textContent = `${rows.length} rows · Updated ${formatTime(entry.updatedAt)}`;
  if (rows.length) view.append(table(headings, rows));
  else showEmpty('No rows match the filter.');
}

function renderLog(records, recordingState) {
  const recent = records.filter((record) => matches([record.endpoint, record.method]));
  if (logSort.value === 'oldest') recent.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  else if (logSort.value === 'duration-desc') recent.sort((a, b) => b.durationMs - a.durationMs);
  else if (logSort.value === 'duration-asc') recent.sort((a, b) => a.durationMs - b.durationMs);
  else recent.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  status.textContent = recordingState?.error ||
    `${records.length} requests this browser session · ${recordingState?.active ? 'Recording' : 'Stopped'}`;
  if (!recent.length) return showEmpty('No matching requests.');
  for (const record of recent) {
    const row = document.createElement('article');
    row.className = 'border-b border-slate-100 px-4 py-3 last:border-b-0';
    const summary = document.createElement('div');
    summary.className = 'flex flex-wrap items-baseline gap-2';
    const method = document.createElement('strong');
    method.className = 'font-semibold text-slate-800';
    method.textContent = record.method;
    const code = document.createElement('span');
    code.className = record.outcome === 'failed' ? 'font-semibold text-red-700' : 'text-slate-600';
    code.textContent = record.status === null ? record.outcome : String(record.status);
    const meta = document.createElement('span');
    meta.className = 'text-xs text-slate-500';
    meta.textContent = `${record.transport} · ${record.durationMs} ms · ${formatTime(record.timestamp)}`;
    summary.append(method, code, meta);
    const endpoint = document.createElement('div');
    endpoint.className = 'mt-1 break-all text-xs text-slate-600';
    endpoint.textContent = record.endpoint;
    row.append(summary, endpoint);
    if (record.method === 'POST') {
      const details = document.createElement('details');
      details.className = 'mt-2';
      const title = document.createElement('summary');
      title.className = 'cursor-pointer text-blue-700';
      const legacy = !Object.hasOwn(record, 'requestBody') && !Object.hasOwn(record, 'responseBody');
      title.textContent = legacy ? 'Older log: body data unavailable' : 'Request / Response data';
      details.append(title);
      if (legacy) {
        const note = document.createElement('p');
        note.className = 'mt-2 text-slate-500';
        note.textContent = 'This record predates body capture.';
        details.append(note);
      } else {
        for (const [label, field] of [['Request', 'requestBody'], ['Response', 'responseBody']]) {
          const heading = document.createElement('strong');
          heading.className = 'mt-2 block text-xs';
          heading.textContent = `${label}${record[`${field}Truncated`] ? ' (truncated)' : ''}`;
          const body = document.createElement('pre');
          body.className = 'mt-1 max-h-44 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap break-all text-xs';
          body.textContent = record[field] ?? '(no readable text data)';
          details.append(heading, body);
        }
      }
      row.append(details);
    }
    view.append(row);
  }
}

async function recordedEntries() {
  const stored = await chrome.storage.session.get(null);
  return Object.entries(stored).filter(([key]) => key.startsWith('record:'))
    .sort(([a], [b]) => Number(a.slice(7)) - Number(b.slice(7)))
    .map(([, record]) => record);
}

function updateItemGroups(data) {
  const selected = itemGroup.value;
  itemGroup.replaceChildren();
  for (const [value, label] of [['', 'All groups'],
    ...Object.keys(data ?? {}).sort().map((group) => [group, group])]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    itemGroup.append(option);
  }
  itemGroup.value = [...itemGroup.options].some((option) => option.value === selected) ? selected : '';
}

let localDraftDefencePicks = [null, null, null, null, null];
let localDraftAttackPicks = [null, null, null, null, null];
let activeDraftStep = 0;
let draftStepCandidates = globalThis.hwaHelperPopupData?.defaultDraftCandidates?.() || [
  [24, 4, 38],
  [12, 16, 49],
  [51, 55, 10],
  [502, 39, 503],
  [68, 56, 36]
];
let activeHeroSwapTarget = null;
let selectedRoleFilter = 'all';

function renderDraft(cache) {
  const draft = cache.legendDraftStatus?.data || {};
  const stageId = draft.stageId || 0;
  const isDefense = stageId === 2 || stageId === 3;
  const isAttack = stageId === 4;
  const isReady = stageId === 5;
  const isSearching = stageId === 1;

  if (Array.isArray(draft.defenceHeroes) && draft.defenceHeroes.length === 5) {
    localDraftDefencePicks = [...draft.defenceHeroes];
  }
  if (Array.isArray(draft.attackHeroes) && draft.attackHeroes.length === 5) {
    localDraftAttackPicks = [...draft.attackHeroes];
  }

  const currentPicks = isAttack ? localDraftAttackPicks : localDraftDefencePicks;
  while (currentPicks.length < 5) currentPicks.push(null);

  const val = globalThis.hwaHelperPopupData.validateDraftPicks(currentPicks);
  const isLocked = isDefense ? (draft.defenceHeroes?.length === 5) :
                   isAttack ? (draft.attackHeroes?.length === 5) : false;

  if (activeDraftStep < 0 || activeDraftStep > 4) {
    activeDraftStep = globalThis.hwaHelperPopupData.getDraftActiveStep(currentPicks);
  }

  const container = document.createElement('div');
  container.className = 'p-4 space-y-4';

  // 1. Status & Header Card
  const headerCard = document.createElement('div');
  headerCard.className = 'rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm';
  
  const headerGrid = document.createElement('div');
  headerGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 items-center';

  // Left: Match Stage & Countdown
  const stageCol = document.createElement('div');
  stageCol.className = 'space-y-1.5';
  
  const matchInfo = document.createElement('div');
  matchInfo.className = 'text-xs text-slate-500 font-medium';
  matchInfo.textContent = draft.matchId ? `Match #${draft.matchId}` : 'Chế độ Legend Draft';
  stageCol.append(matchInfo);

  const stageTitle = document.createElement('div');
  stageTitle.className = 'text-base font-bold text-slate-900 flex items-center gap-2';
  const stageBadgeColor = isDefense ? 'bg-amber-100 text-amber-800 border-amber-300' :
                          isAttack ? 'bg-red-100 text-red-800 border-red-300' :
                          isReady ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                          isSearching ? 'bg-blue-100 text-blue-800 border-blue-300' :
                          'bg-slate-100 text-slate-700 border-slate-300';
  stageTitle.innerHTML = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stageBadgeColor}">${globalThis.hwaHelperPopupData.draftStageDescription(stageId)}</span>`;
  stageCol.append(stageTitle);

  if (draft.stageFinishTs) {
    const timerRow = document.createElement('div');
    timerRow.className = 'flex items-center gap-2 pt-1';
    timerRow.innerHTML = `<span class="text-xs text-slate-500">Thời gian còn lại:</span>
      <span id="draft-countdown" class="text-xl font-bold font-mono text-red-600">${globalThis.hwaHelperPopupData.formatCountdown(draft.stageFinishTs)}</span>`;
    stageCol.append(timerRow);
  }
  headerGrid.append(stageCol);

  // Right: Opponent Profile Card
  const enemyUser = draft.enemyUser;
  if (enemyUser) {
    const enemyCol = document.createElement('div');
    enemyCol.className = 'rounded-lg border border-slate-200 bg-white p-3 flex items-center gap-3';
    
    // Opponent Avatar
    const avatarImg = document.createElement('img');
    avatarImg.src = `assets/heroes/hero_00${String(enemyUser.avatarId || 1).padStart(2, '0')}.png`;
    avatarImg.alt = enemyUser.name || 'Opponent';
    avatarImg.className = 'size-12 rounded-full object-cover border-2 border-slate-200 shrink-0';
    avatarImg.addEventListener('error', () => {
      avatarImg.replaceWith(createInitialsBadge(enemyUser.name || 'Opponent', 'Way of Mystery', true));
    }, { once: true });
    enemyCol.append(avatarImg);

    const enemyInfo = document.createElement('div');
    enemyInfo.className = 'min-w-0 flex-1 space-y-0.5';
    const enemyName = document.createElement('div');
    enemyName.className = 'font-bold text-sm text-slate-900 truncate';
    enemyName.textContent = enemyUser.name || 'Đối thủ';
    enemyInfo.append(enemyName);

    const enemySub = document.createElement('div');
    enemySub.className = 'text-xs text-slate-500 flex items-center gap-2';
    enemySub.innerHTML = `<span>Lv.${enemyUser.level || '—'}</span>${enemyUser.clanTitle ? `<span>• Bang: ${enemyUser.clanTitle}</span>` : ''}`;
    enemyInfo.append(enemySub);

    if (draft.rating) {
      const ratingRow = document.createElement('div');
      ratingRow.className = 'text-xs text-slate-600 font-medium pt-0.5';
      ratingRow.textContent = `Rating: Bạn ${draft.rating.userRating ?? '—'} vs Đối thủ ${draft.rating.enemyRating ?? '—'}`;
      enemyInfo.append(ratingRow);
    }
    enemyCol.append(enemyInfo);
    headerGrid.append(enemyCol);
  }
  headerCard.append(headerGrid);
  container.append(headerCard);

  // 2. Enemy Defense Lineup (Shown in Attack Draft Stage 4)
  if (isAttack && draft.enemyDefenceHeroes?.length) {
    const enemyLineupCard = document.createElement('div');
    enemyLineupCard.className = 'rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2';
    
    const enemyTitle = document.createElement('div');
    enemyTitle.className = 'text-xs font-bold text-amber-900 flex items-center gap-1.5';
    enemyTitle.innerHTML = `<span>🛡️ Đội hình Thủ của Đối thủ (5 tướng):</span>`;
    enemyLineupCard.append(enemyTitle);

    const enemySlotRow = document.createElement('div');
    enemySlotRow.className = 'flex flex-wrap gap-2';
    for (const heroId of draft.enemyDefenceHeroes) {
      const heroMeta = globalThis.hwaHelperHeroMetadata?.[heroId] || {};
      const heroSnap = cache.heroGetAll?.data?.[heroId];
      const slot = document.createElement('div');
      slot.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white shadow-xs';
      slot.append(createHeroInline(heroId, heroMeta.name || globalThis.hwaHelperNameMap.hero(heroId) || `#${heroId}`, heroSnap));
      enemySlotRow.append(slot);
    }
    enemyLineupCard.append(enemySlotRow);
    container.append(enemyLineupCard);
  }

  // 3. Current Selected Team (5 Steps)
  const teamSection = document.createElement('div');
  teamSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3';
  
  const teamHeader = document.createElement('div');
  teamHeader.className = 'flex items-center justify-between flex-wrap gap-2';
  
  const teamTitleCol = document.createElement('div');
  teamTitleCol.className = 'space-y-0.5';
  const teamTitle = document.createElement('h3');
  teamTitle.className = 'text-sm font-bold text-slate-800 flex items-center gap-1.5';
  teamTitle.textContent = isAttack ? '⚔️ Đội hình Tấn công của bạn (5 bước chọn):' : '🛡️ Đội hình Phòng thủ của bạn (5 bước chọn):';
  teamTitleCol.append(teamTitle);

  const teamSub = document.createElement('div');
  teamSub.className = 'text-xs text-slate-500';
  teamSub.textContent = val.valid ? '✓ Đã chọn đủ 5/5 tướng (5 bước hoàn tất)' :
    `Đã chọn: ${val.count}/5 bước • Nhấp vào từng bước để xem hoặc đổi lựa chọn`;
  teamTitleCol.append(teamSub);
  teamHeader.append(teamTitleCol);

  // Lock action button
  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  if (isLocked) {
    lockBtn.className = 'px-3.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 flex items-center gap-1';
    lockBtn.disabled = true;
    lockBtn.textContent = isDefense ? '✓ Đã khóa đội hình Thủ' : '✓ Đã khóa đội hình Công';
  } else {
    lockBtn.className = val.valid ?
      'cursor-pointer px-4 py-1.5 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all' :
      'px-4 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-400 cursor-not-allowed border border-slate-200';
    lockBtn.disabled = !val.valid;
    lockBtn.textContent = isDefense ? 'Khóa Đội Hình Thủ (5 Tướng)' : isAttack ? 'Khóa Đội Hình Công (5 Tướng)' : 'Khóa Đội Hình (5 Tướng)';
    if (val.valid) {
      lockBtn.addEventListener('click', () => {
        lockBtn.disabled = true;
        lockBtn.textContent = 'Đang gửi...';
        const action = isDefense ? 'saveDefence' : 'saveAttack';
        chrome.runtime?.sendMessage?.({ kind: 'draft-action', action, heroes: val.heroes }, () => {
          setTimeout(render, 500);
        });
      });
    }
  }
  teamHeader.append(lockBtn);
  teamSection.append(teamHeader);

  // 5 Step Slots Row
  const slotsGrid = document.createElement('div');
  slotsGrid.className = 'grid grid-cols-2 sm:grid-cols-5 gap-2.5';
  for (let i = 0; i < 5; i++) {
    const heroId = currentPicks[i];
    const isActiveStep = !isLocked && activeDraftStep === i;
    const slotCard = document.createElement('div');

    if (heroId) {
      const heroMeta = globalThis.hwaHelperHeroMetadata?.[heroId] || {};
      const heroSnap = cache.heroGetAll?.data?.[heroId];
      slotCard.className = `flex flex-col items-center justify-between p-2.5 rounded-xl border transition-all text-center min-h-[110px] relative ${
        isActiveStep ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-2 ring-blue-400 cursor-pointer' :
        !isLocked ? 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/60 cursor-pointer' :
        'border-slate-200 bg-slate-50/40'
      }`;
      
      const topRow = document.createElement('div');
      topRow.className = 'w-full flex items-center justify-between gap-1';
      const stepBadge = document.createElement('span');
      stepBadge.className = `text-[10px] px-1.5 py-0.2 rounded font-bold ${isActiveStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`;
      stepBadge.textContent = `Bước ${i + 1}`;
      topRow.append(stepBadge);

      if (isActiveStep) {
        const activeTag = document.createElement('span');
        activeTag.className = 'text-[9px] font-bold text-blue-600 animate-pulse';
        activeTag.textContent = 'Đang chọn';
        topRow.append(activeTag);
      } else if (!isLocked) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.title = 'Bỏ chọn bước này';
        removeBtn.className = 'size-4 rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-700 text-slate-600 flex items-center justify-center text-[10px] font-bold cursor-pointer';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentPicks[i] = null;
          activeDraftStep = i;
          render();
        });
        topRow.append(removeBtn);
      }
      slotCard.append(topRow);

      const heroWrapper = document.createElement('div');
      heroWrapper.className = 'flex flex-col items-center gap-1 my-1';
      
      const avatarPath = heroMeta.avatarFile || (heroMeta.hasAvatar ? `assets/heroes/${heroId}.webp` : null);
      const smallGlow = starGlowClass(heroSnap?.star, false);
      if (avatarPath) {
        const img = document.createElement('img');
        img.src = avatarPath;
        img.className = `size-10 rounded-full object-cover shrink-0 ${smallGlow}`;
        heroWrapper.append(img);
      } else {
        heroWrapper.append(createInitialsBadge(heroMeta.name || `#${heroId}`, heroMeta.faction, false));
      }
      const nameSpan = document.createElement('span');
      nameSpan.className = 'text-xs font-bold text-slate-800 truncate max-w-[100px]';
      nameSpan.textContent = heroMeta.name || globalThis.hwaHelperNameMap.hero(heroId) || `#${heroId}`;
      heroWrapper.append(nameSpan);

      if (heroMeta.role) {
        const roleBadge = document.createElement('span');
        roleBadge.className = 'text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium';
        roleBadge.textContent = heroMeta.role;
        heroWrapper.append(roleBadge);
      }
      slotCard.append(heroWrapper);
    } else {
      slotCard.className = `flex flex-col items-center justify-between p-2.5 rounded-xl border-2 border-dashed transition-all text-center min-h-[110px] ${
        isActiveStep ? 'border-blue-400 bg-blue-50/50 text-blue-700 ring-2 ring-blue-300 cursor-pointer' :
        !isLocked ? 'border-slate-200 bg-slate-50/50 hover:border-blue-200 text-slate-400 cursor-pointer' :
        'border-slate-200 bg-slate-50/30 text-slate-400'
      }`;

      const topRow = document.createElement('div');
      topRow.className = 'w-full flex items-center justify-between';
      const stepBadge = document.createElement('span');
      stepBadge.className = `text-[10px] px-1.5 py-0.2 rounded font-bold ${isActiveStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`;
      stepBadge.textContent = `Bước ${i + 1}`;
      topRow.append(stepBadge);
      if (isActiveStep) {
        const activeTag = document.createElement('span');
        activeTag.className = 'text-[9px] font-bold text-blue-600 animate-pulse';
        activeTag.textContent = 'Đang chọn';
        topRow.append(activeTag);
      }
      slotCard.append(topRow);

      const placeholderWrap = document.createElement('div');
      placeholderWrap.className = 'flex flex-col items-center justify-center my-auto';
      placeholderWrap.innerHTML = `<span class="text-xl font-bold leading-none ${isActiveStep ? 'text-blue-500' : 'text-slate-300'}">+</span><span class="text-[11px] font-medium mt-1">Chọn 1 trong 3</span>`;
      slotCard.append(placeholderWrap);
    }

    if (!isLocked) {
      slotCard.addEventListener('click', () => {
        activeDraftStep = i;
        activeHeroSwapCandidateIndex = null;
        render();
      });
    }
    slotsGrid.append(slotCard);
  }
  teamSection.append(slotsGrid);
  container.append(teamSection);

  // 4. Full 15-Hero Draft Grid (5 Columns x 3 Rows)
  if (!isLocked) {
    const chooserSection = document.createElement('div');
    chooserSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4';

    const chooserHeader = document.createElement('div');
    chooserHeader.className = 'flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100';

    const chooserTitleCol = document.createElement('div');
    chooserTitleCol.className = 'space-y-0.5';
    const chooserTitle = document.createElement('h3');
    chooserTitle.className = 'text-sm font-bold text-slate-900 flex items-center gap-2';
    chooserTitle.innerHTML = `<span class="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">15</span> <span>Bảng Chọn 15 Tướng (5 Bước × 3 Lựa Chọn)</span>`;
    chooserTitleCol.append(chooserTitle);

    const chooserSub = document.createElement('div');
    chooserSub.className = 'text-xs text-slate-500';
    chooserSub.textContent = 'Mỗi cột tương ứng 1 bước pick (chọn 1 trong 3 tướng). Bạn có thể chọn trực tiếp trên cả 5 cột để hoàn tất đội hình.';
    chooserTitleCol.append(chooserSub);
    chooserHeader.append(chooserTitleCol);

    const chooserActions = document.createElement('div');
    chooserActions.className = 'flex items-center gap-2';

    // Reset button
    const hasAnyPick = currentPicks.some(Boolean);
    if (hasAnyPick) {
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 cursor-pointer transition-colors';
      resetBtn.textContent = 'Đặt lại cả 5 bước';
      resetBtn.addEventListener('click', () => {
        if (isAttack) localDraftAttackPicks = [null, null, null, null, null];
        else localDraftDefencePicks = [null, null, null, null, null];
        activeHeroSwapTarget = null;
        render();
      });
      chooserActions.append(resetBtn);
    }
    chooserHeader.append(chooserActions);
    chooserSection.append(chooserHeader);

    // 5 Columns x 3 Rows Grid
    const fullGrid = document.createElement('div');
    fullGrid.className = 'grid grid-cols-1 sm:grid-cols-5 gap-3';

    for (let stepIdx = 0; stepIdx < 5; stepIdx++) {
      const colBox = document.createElement('div');
      const stepCandidates = draftStepCandidates[stepIdx] || [24, 4, 38];
      const isColChosen = Number.isInteger(currentPicks[stepIdx]) && currentPicks[stepIdx] > 0;

      colBox.className = `flex flex-col space-y-2 rounded-xl p-2.5 transition-colors ${
        isColChosen ? 'bg-slate-50/80 border border-emerald-200' : 'bg-slate-50/40 border border-slate-200'
      }`;

      // Column Step Header
      const colHeader = document.createElement('div');
      colHeader.className = 'flex items-center justify-between pb-1.5 border-b border-slate-200/80 text-xs';

      const colTitle = document.createElement('span');
      colTitle.className = 'font-bold text-slate-800 flex items-center gap-1';
      colTitle.innerHTML = `<span class="size-4 rounded-full ${isColChosen ? 'bg-emerald-600' : 'bg-slate-700'} text-white text-[10px] flex items-center justify-center font-bold">${stepIdx + 1}</span> <span>Bước ${stepIdx + 1}</span>`;

      const colStatusTag = document.createElement('span');
      colStatusTag.className = `text-[10px] px-1.5 py-0.2 rounded font-semibold ${
        isColChosen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
      }`;
      colStatusTag.textContent = isColChosen ? '✓ Đã chọn' : 'Chưa chọn';

      colHeader.append(colTitle, colStatusTag);
      colBox.append(colHeader);

      // 3 Candidate Hero Cards in this column
      for (let cIdx = 0; cIdx < stepCandidates.length; cIdx++) {
        const cHeroId = stepCandidates[cIdx];
        const meta = globalThis.hwaHelperHeroMetadata?.[cHeroId] || {};
        const snap = cache.heroGetAll?.data?.[cHeroId];
        const isChosen = currentPicks[stepIdx] === cHeroId;

        const card = document.createElement('div');
        card.className = `rounded-lg p-2.5 flex flex-col items-center justify-between transition-all relative ${
          isChosen ?
            'border-2 border-emerald-500 bg-emerald-50/90 shadow-sm ring-1 ring-emerald-300' :
            'border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-xs cursor-pointer'
        }`;

        // Top tag row
        const cardTop = document.createElement('div');
        cardTop.className = 'w-full flex items-center justify-between text-xs mb-1';

        const choiceTag = document.createElement('span');
        choiceTag.className = `px-1.5 py-0.2 rounded text-[9px] font-bold ${
          isChosen ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
        }`;
        choiceTag.textContent = `#${cIdx + 1}`;
        cardTop.append(choiceTag);

        const swapCandidateBtn = document.createElement('button');
        swapCandidateBtn.type = 'button';
        swapCandidateBtn.title = 'Thay thế tướng đề cử';
        swapCandidateBtn.className = 'text-[10px] text-blue-600 hover:underline font-medium cursor-pointer';
        swapCandidateBtn.textContent = '✎';
        swapCandidateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activeHeroSwapTarget && activeHeroSwapTarget.step === stepIdx && activeHeroSwapTarget.candidateIndex === cIdx) {
            activeHeroSwapTarget = null;
          } else {
            activeHeroSwapTarget = { step: stepIdx, candidateIndex: cIdx };
          }
          render();
        });
        cardTop.append(swapCandidateBtn);
        card.append(cardTop);

        // Hero Avatar & Meta
        const avatarPath = meta.avatarFile || (meta.hasAvatar ? `assets/heroes/${cHeroId}.webp` : null);
        const glow = starGlowClass(snap?.star, false);
        if (avatarPath) {
          const img = document.createElement('img');
          img.src = avatarPath;
          img.alt = meta.name || `#${cHeroId}`;
          img.className = `size-11 rounded-full object-cover shrink-0 ${glow}`;
          card.append(img);
        } else {
          card.append(createInitialsBadge(meta.name || `#${cHeroId}`, meta.faction, false));
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'text-xs font-bold text-slate-900 mt-1 text-center truncate max-w-[110px]';
        nameEl.textContent = meta.name || globalThis.hwaHelperNameMap.hero(cHeroId) || `#${cHeroId}`;
        card.append(nameEl);

        const badgesRow = document.createElement('div');
        badgesRow.className = 'flex items-center gap-1 flex-wrap justify-center text-[9px] my-1';
        if (meta.role) {
          const roleSpan = document.createElement('span');
          roleSpan.className = 'px-1 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold';
          roleSpan.textContent = meta.role;
          badgesRow.append(roleSpan);
        }
        if (snap?.power) {
          const pwrSpan = document.createElement('span');
          pwrSpan.className = 'px-1 py-0.2 rounded bg-amber-100 text-amber-900 font-medium tabular-nums';
          pwrSpan.textContent = `⚡${formatNumber(snap.power)}`;
          badgesRow.append(pwrSpan);
        }
        card.append(badgesRow);

        // Selection indicator button
        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        if (isChosen) {
          selectBtn.className = 'w-full py-1 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center gap-1 cursor-default mt-1';
          selectBtn.textContent = '✓ Đã chọn';
        } else {
          selectBtn.className = 'w-full py-1 rounded bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-[10px] font-semibold flex items-center justify-center cursor-pointer mt-1 transition-colors';
          selectBtn.textContent = 'Chọn';
        }
        card.append(selectBtn);

        card.addEventListener('click', () => {
          currentPicks[stepIdx] = cHeroId;
          activeHeroSwapTarget = null;
          render();
        });

        colBox.append(card);
      }

      fullGrid.append(colBox);
    }
    chooserSection.append(fullGrid);

    // If candidate substitution drawer is open
    if (activeHeroSwapTarget) {
      const { step: sIdx, candidateIndex: cIdx } = activeHeroSwapTarget;
      const swapWrap = document.createElement('div');
      swapWrap.className = 'p-3 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2 mt-2';

      const swapHeader = document.createElement('div');
      swapHeader.className = 'flex items-center justify-between';
      const swapTitle = document.createElement('div');
      swapTitle.className = 'text-xs font-bold text-blue-900';
      swapTitle.textContent = `Chọn tướng thay thế cho Bước ${sIdx + 1} - Lựa chọn #${cIdx + 1}:`;
      swapHeader.append(swapTitle);

      const closeSwapBtn = document.createElement('button');
      closeSwapBtn.type = 'button';
      closeSwapBtn.className = 'text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer';
      closeSwapBtn.textContent = 'Đóng [✕]';
      closeSwapBtn.addEventListener('click', () => {
        activeHeroSwapTarget = null;
        render();
      });
      swapHeader.append(closeSwapBtn);
      swapWrap.append(swapHeader);

      const swapGrid = document.createElement('div');
      swapGrid.className = 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-[220px] overflow-y-auto p-1';

      const allHeroEntries = Object.entries(globalThis.hwaHelperHeroMetadata || {}).map(([id, hMeta]) => ({
        id: Number(id),
        meta: hMeta,
        snap: cache.heroGetAll?.data?.[id] || null
      })).filter((item) => Number.isInteger(item.id) && item.id < 1000)
        .sort((a, b) => (b.snap?.power || 0) - (a.snap?.power || 0));

      for (const { id: hId, meta: hMeta, snap: hSnap } of allHeroEntries) {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'flex items-center gap-1.5 p-1.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 text-left text-xs cursor-pointer';

        const avPath = hMeta.avatarFile || (hMeta.hasAvatar ? `assets/heroes/${hId}.webp` : null);
        const sGlow = starGlowClass(hSnap?.star, false);
        if (avPath) {
          const sImg = document.createElement('img');
          sImg.src = avPath;
          sImg.className = `size-6 rounded-full object-cover shrink-0 ${sGlow}`;
          itemBtn.append(sImg);
        }
        const sName = document.createElement('span');
        sName.className = 'truncate font-medium text-[11px] text-slate-800';
        sName.textContent = hMeta.name || globalThis.hwaHelperNameMap.hero(hId) || `#${hId}`;
        itemBtn.append(sName);

        itemBtn.addEventListener('click', () => {
          if (!draftStepCandidates[sIdx]) {
            draftStepCandidates[sIdx] = [24, 4, 38];
          }
          draftStepCandidates[sIdx][cIdx] = hId;
          activeHeroSwapTarget = null;
          render();
        });
        swapGrid.append(itemBtn);
      }
      swapWrap.append(swapGrid);
      chooserSection.append(swapWrap);
    }

    container.append(chooserSection);
  } else {
    // Locked notice
    const lockedCard = document.createElement('div');
    lockedCard.className = 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center space-y-1.5';
    lockedCard.innerHTML = `
      <div class="text-base font-bold text-emerald-900 flex items-center justify-center gap-2">
        <span>✓</span> <span>Đội hình 5 tướng đã được khóa thành công!</span>
      </div>
      <div class="text-xs text-emerald-700">Hệ thống đã ghi nhận 5 tướng cho ${isDefense ? 'Đội hình Thủ' : 'Đội hình Công'}. Trận đấu sẽ tự động chuyển sang vòng tiếp theo.</div>
    `;
    container.append(lockedCard);
  }

  view.append(container);
  status.textContent = `${draft.matchId ? `Trận #${draft.matchId} • ` : ''}${globalThis.hwaHelperPopupData.draftStageDescription(stageId)} • Đã chọn ${val.count}/5 bước`;
}

function renderGuildChat(cache) {
  const chatData = cache.guildChat?.data;
  const messages = Array.isArray(chatData?.messages) ? chatData.messages : [];
  const users = chatData?.users || {};

  const query = search.value.trim().toLowerCase();
  const filtered = messages.filter((m) => {
    if (!query) return true;
    const text = (m.data?.text || '').toLowerCase();
    const sender = (users[m.userId]?.name || m.userId || '').toLowerCase();
    return text.includes(query) || sender.includes(query);
  });

  status.textContent = `${filtered.length} guild message${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    if (messages.length > 0 && query) {
      showEmpty(`No guild messages matching "${search.value}".`);
    } else {
      showEmpty('No guild chat messages observed yet. Open Guild Chat in game to sync.');
    }
    return;
  }

  const container = document.createElement('div');
  container.className = 'p-3 space-y-2.5';

  for (const m of filtered) {
    const user = users[m.userId] || {};
    const senderName = user.name || (m.userId === '0' ? 'System' : `User #${m.userId}`);
    const isAnnouncement = m.chatType === 'announcement';
    const roleInfo = globalThis.hwaHelperPopupData?.formatChatRole
      ? globalThis.hwaHelperPopupData.formatChatRole(m.data?.clanRole ?? user.clanRole)
      : { label: 'Member', badgeClass: 'bg-slate-100 text-slate-700' };
    const timeText = globalThis.hwaHelperPopupData?.formatChatTime
      ? globalThis.hwaHelperPopupData.formatChatTime(m.ctime)
      : '—';

    const card = document.createElement('div');
    card.className = `rounded-xl border p-3 transition-colors ${
      isAnnouncement
        ? 'border-amber-300 bg-amber-50/70 shadow-xs'
        : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
    }`;

    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 flex-wrap text-xs';

    const initial = (senderName[0] || '?').toUpperCase();
    const avatarBadge = document.createElement('span');
    avatarBadge.className = `size-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
      isAnnouncement
        ? 'bg-amber-600 text-white'
        : roleInfo.label === 'Leader'
          ? 'bg-amber-500 text-white ring-1 ring-amber-300'
          : roleInfo.label === 'Officer'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-600 text-white'
    }`;
    avatarBadge.textContent = initial;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-semibold text-slate-900';
    nameSpan.textContent = senderName;

    const levelBadge = document.createElement('span');
    levelBadge.className = 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums';
    levelBadge.textContent = user.level ? `Lv.${user.level}` : '';

    const roleBadge = document.createElement('span');
    roleBadge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      isAnnouncement ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400' : roleInfo.badgeClass
    }`;
    roleBadge.textContent = isAnnouncement ? 'Announcement' : roleInfo.label;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'ml-auto text-[11px] text-slate-400 tabular-nums';
    timeSpan.textContent = timeText;

    header.append(avatarBadge, nameSpan);
    if (user.level) header.append(levelBadge);
    header.append(roleBadge, timeSpan);

    const body = document.createElement('div');
    body.className = 'mt-1.5 text-xs text-slate-800 break-words whitespace-pre-wrap select-text pl-8';
    body.textContent = m.data?.text || '—';

    card.append(header, body);
    container.append(card);
  }

  view.append(container);
}

async function render() {
  const [stored, session] = await Promise.all([
    chrome.storage.local.get([CACHE_KEY, 'resourceSelection']), chrome.storage.session.get('recordingState')
  ]);
  const cache = stored[CACHE_KEY] || {};
  currentCache = cache;
  currentProductionRates = Object.fromEntries([1, 2, 3, 4, 5].map((id) =>
    [id, globalThis.hwaHelperProductionData.ratePerMinute(cache, id)]));
  const resources = resourceEntries(cache);
  const selectedResources = stored.resourceSelection || [];
  document.querySelector('#account-name').textContent = cache.accountStatus?.data?.name || '—';
  const marchesWrap = document.querySelector('#marches');
  marchesWrap.replaceChildren();
  for (const [index, march] of (cache.marchStatus?.data?.marches || []).entries()) {
    const style = marchStyles[march.kind] || marchStyles.attack;
    const badge = document.createElement('span');
    badge.className = `inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ${style.classes}`;
    badge.dataset.marchIndex = String(index);
    badge.dataset.resourceTooltip = '';
    badge.dataset.tooltipBelow = '';
    badge.tabIndex = 0;
    badge.textContent = style.icon;
    marchesWrap.append(badge);
  }
  const headerResources = document.querySelector('#header-resources');
  headerResources.replaceChildren();
  for (const entry of resources.filter((item) => isSelectableForHeader(item) && selectedResources.includes(item.key))) {
    const pill = document.createElement('span');
    const appearance = resourceAppearance(entry);
    pill.className = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${appearance.classes}`;
    pill.setAttribute('aria-label', resourceLabel(entry));
    pill.tabIndex = 0;
    pill.dataset.resourceTooltip = '';
    pill.dataset.tooltipBelow = '';
    const icon = document.createElement('span');
    icon.textContent = appearance.icon;
    icon.setAttribute('aria-hidden', 'true');
    const amount = document.createElement('span');
    amount.dataset.resourceAmount = entry.key;
    amount.dataset.resourceHeader = 'true';
    pill.append(icon, amount);
    headerResources.append(pill);
  }
  refreshTimed();
  const draftStatus = cache.legendDraftStatus?.data;
  const isDraftActive = globalThis.hwaHelperPopupData.isDraftActive(draftStatus?.stageId);
  const draftBanner = document.querySelector('#draft-banner');
  const draftBadge = document.querySelector('#draft-tab-badge');
  if (draftBanner && draftBadge) {
    if (isDraftActive) {
      draftBanner.hidden = false;
      draftBadge.hidden = false;
      document.querySelector('#draft-banner-stage').textContent =
        globalThis.hwaHelperPopupData.draftStageDescription(draftStatus.stageId);
      if (draftStatus.stageFinishTs) {
        document.querySelector('#draft-banner-timer').textContent =
          globalThis.hwaHelperPopupData.formatCountdown(draftStatus.stageFinishTs);
      }
    } else {
      draftBanner.hidden = true;
      draftBadge.hidden = true;
    }
  }
  const recordingState = session.recordingState;
  const recordButton = document.querySelector('#record-toggle');
  recordButton.hidden = activeTab !== 'log';
  recordButton.textContent = recordingState?.active ? 'Stop' : 'Record';
  recordButton.className = recordingState?.active ?
    'cursor-pointer rounded-lg border border-slate-300 bg-slate-800 px-3 py-2 font-medium text-white hover:bg-slate-700' :
    'cursor-pointer rounded-lg border border-red-300 bg-red-50 px-3 py-2 font-medium text-red-800 hover:bg-red-100';
  view.replaceChildren();
  document.querySelector('#toolbar').hidden = activeTab === 'config';
  document.querySelector('#settings-panel').hidden = activeTab !== 'config';
  view.hidden = activeTab === 'config';
  document.querySelector('#export').hidden = activeTab !== 'log';
  document.querySelector('#clear').hidden = activeTab !== 'log';
  document.querySelector('#item-group-filter').hidden = activeTab !== 'items';
  document.querySelector('#log-sort-wrap').hidden = activeTab !== 'log';
  document.querySelector('#resource-sort-wrap').hidden = activeTab !== 'resources';
  document.querySelector('#search-label').textContent = activeTab === 'log' ? 'Filter endpoint' :
    activeTab === 'draft' ? 'Search hero by name, role, or ID' :
    activeTab === 'chat' ? 'Search message or sender' : 'Search ID, name, or group';
  search.placeholder = activeTab === 'log' ? 'Filter endpoint' :
    activeTab === 'draft' ? 'Search hero by name, role, or ID' :
    activeTab === 'chat' ? 'Search message or sender' : 'Search ID, name, or group';

  if (activeTab === 'config') {
    status.textContent = 'Settings and data stored in this browser.';
  } else if (activeTab === 'draft') {
    renderDraft(cache);
  } else if (activeTab === 'heroes') {
    showSnapshot(cache.heroGetAll, ['Hero ID', 'Name', 'Level', 'Star', 'Soul stones', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, hero]) => {
        const { owned, needed } = globalThis.hwaHelperPopupData.heroSoulProgress(id, hero, cache.inventoryGet?.data);
        const soulStones = `${formatNumber(owned)} / ${typeof needed === 'number' ? formatNumber(needed) : needed ?? '—'}`;
        return [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(hero?.level),
          hero?.star, soulStones, formatNumber(hero?.power)];
      }));
  } else if (activeTab === 'items') {
    updateItemGroups(cache.inventoryGet?.data);
    showSnapshot(cache.inventoryGet, ['Group', 'Item ID', 'Name', 'Amount'], (data) =>
      Object.entries(data).filter(([category]) => !itemGroup.value || category === itemGroup.value).flatMap(([category, items]) =>
        Object.entries(items ?? {}).sort(byId).map(([id, quantity]) =>
          [category, id, globalThis.hwaHelperNameMap.item(category, id) || '—', formatNumber(quantity)])));
  } else if (activeTab === 'resources') {
    renderResources(resources, selectedResources);
  } else if (activeTab === 'titans') {
    showSnapshot(cache.titanGetAll, ['Titan ID', 'Name', 'Level', 'Star', 'Soul stones', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, titan]) => {
        const { owned, needed } = globalThis.hwaHelperPopupData.titanSoulProgress(id, titan, cache.inventoryGet?.data);
        const soulStones = `${formatNumber(owned)} / ${typeof needed === 'number' ? formatNumber(needed) : needed ?? '—'}`;
        return [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(titan?.level),
          titan?.star, soulStones, formatNumber(titan?.power)];
      }));
  } else if (activeTab === 'teams') {
    showSnapshot(cache.teamGetAll, ['Mode', 'Team', 'Members', 'Hero/Titan names'], (data) =>
      globalThis.hwaHelperPopupData.teamRows(data, globalThis.hwaHelperNameMap));
  } else if (activeTab === 'chat') {
    renderGuildChat(cache);
  } else if (activeTab === 'other') {
    const entries = Object.values(cache).filter((entry) =>
      !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'guildChat', 'energyStatus',
        'worldEnergyStatus', 'worldEnergyRallies', 'resourceActionHistory',
        'accountStatus', 'buildingStatus', 'marchStatus',
        'researchStatus', 'productionConfigStatus', 'productionStatus',
        'productionBonusStatus', 'missionProgressStatus'].includes(entry.key)
      && !entry.key.startsWith('resource:')
      && matches([entry.method, entry.feature || entry.group]));
    const rows = entries.map((entry) => [entry.method, entry.feature || entry.group,
      Array.isArray(entry.data) ? `${entry.data.length} elements` : `${Object.keys(entry.data ?? {}).length} keys`,
      entry.updatedAt]);
    status.textContent = `${rows.length} other snapshots`;
    if (rows.length) {
      view.append(table(['RPC', 'Group/feature', 'Size', 'Updated'], rows));
      for (const entry of entries) {
        const details = document.createElement('details');
        details.className = 'border-b border-slate-100 px-4 py-2';
        const summary = document.createElement('summary');
        summary.className = 'cursor-pointer text-blue-700';
        summary.textContent = `View ${entry.key} data`;
        details.append(summary);
        details.addEventListener('toggle', () => {
          if (!details.open || details.querySelector('pre')) return;
          const body = document.createElement('pre');
          body.className = 'mt-2 max-h-44 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap break-all text-xs';
          body.textContent = JSON.stringify(entry.data, null, 2);
          details.append(body);
        });
        view.append(details);
      }
    } else showEmpty('No other snapshots observed yet.');
  } else {
    renderLog(await recordedEntries(), recordingState);
  }
}

tabs.forEach((button) => button.addEventListener('click', () => {
  activeTab = button.dataset.tab;
  tabs.forEach((tab) => { tab.setAttribute('aria-selected', String(tab === button)); });
  search.value = '';
  render();
}));
search.addEventListener('input', render);
itemGroup.addEventListener('change', render);
logSort.addEventListener('change', render);
resourceSort.addEventListener('change', render);

document.querySelector('#clear-cache').addEventListener('click', async () => {
  await chrome.storage.local.remove(CACHE_KEY);
  await render();
});

async function renderSettings() {
  const stored = await chrome.storage.local.get('captureSettings');
  document.querySelector('#intercept-enabled').checked = stored.captureSettings?.interceptEnabled !== false;
}

for (const [id, field] of [['intercept-enabled', 'interceptEnabled']]) {
  document.querySelector(`#${id}`).addEventListener('change', (event) => {
    const enabled = event.currentTarget.checked;
    settingsPending = settingsPending.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get('captureSettings');
      await chrome.storage.local.set({ captureSettings: {
        ...(stored.captureSettings || {}), [field]: enabled
      } });
    });
    settingsPending.catch(() => { status.textContent = 'Could not save API monitoring setting.'; });
  });
}

document.querySelector('#record-toggle').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const state = (await chrome.storage.session.get('recordingState')).recordingState;
    const result = await chrome.runtime.sendMessage({ kind: state?.active ? 'record-stop' : 'record-start' });
    if (result?.error) throw new Error(result.error);
    await render();
  } catch (error) {
    status.textContent = `Could not change recording mode: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#export').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const records = await recordedEntries();
    const filename = await globalThis.hwaHelperNextExportName(chrome.storage.local);
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ kind: 'record-clear' });
  await render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if ('captureSettings' in changes) renderSettings();
    if (CACHE_KEY in changes || 'resourceSelection' in changes) queueRender();
  } else if (area === 'session' && (activeTab === 'log' || 'recordingState' in changes)) {
    queueRender();
  }
});

function queueRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 80);
}

renderSettings();
render().then(async () => {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  if (!stored[CACHE_KEY] || !Object.keys(stored[CACHE_KEY]).length) {
    await chrome.runtime.sendMessage({ kind: 'rebuild-cache' }).catch(() => {});
    await render();
  }
});
setInterval(refreshTimed, 1000);
