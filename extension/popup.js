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
    resourceData.remainingMinutes(currentCache.buildingStatus));
  document.querySelector('#research-time').textContent = resourceData.hoursMinutes(
    resourceData.remainingMinutes(currentCache.researchStatus));
  for (const node of document.querySelectorAll('[data-resource-amount]')) {
    const entry = currentCache[node.dataset.resourceAmount];
    if (!entry) continue;
    node.textContent = resourceData.formatAmount(resourceData.amountAt(entry));
    setResourceTooltip(node.parentElement, resourceTooltip(entry));
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
  card.append(details);

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
  for (const values of sortedRows) {
    const line = document.createElement('tr');
    line.className = 'border-b border-slate-100 hover:bg-blue-50/50';
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
  document.querySelector('#search-label').textContent = activeTab === 'log' ? 'Filter endpoint' : 'Search ID, name, or group';
  search.placeholder = activeTab === 'log' ? 'Filter endpoint' : 'Search ID, name, or group';

  if (activeTab === 'config') {
    status.textContent = 'Settings and data stored in this browser.';
  } else if (activeTab === 'heroes') {
    showSnapshot(cache.heroGetAll, ['Hero ID', 'Name', 'Level', 'Star', 'Soul stones / needed', 'Power'], (data) =>
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
    showSnapshot(cache.titanGetAll, ['Titan ID', 'Name', 'Level', 'Star', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, titan]) =>
        [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(titan?.level),
          titan?.star, formatNumber(titan?.power)]));
  } else if (activeTab === 'teams') {
    showSnapshot(cache.teamGetAll, ['Mode', 'Team', 'Members', 'Hero/Titan names'], (data) =>
      globalThis.hwaHelperPopupData.teamRows(data, globalThis.hwaHelperNameMap));
  } else if (activeTab === 'other') {
    const entries = Object.values(cache).filter((entry) =>
      !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'energyStatus',
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
