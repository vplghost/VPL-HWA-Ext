const CACHE_KEY = 'rpcCache';
const view = document.querySelector('#view');
const status = document.querySelector('#status');
const tableExportBtn = document.querySelector('#table-export-btn');
tableExportBtn?.addEventListener('click', () => {
  const data = globalThis.hwaHelperPopupData?.exportTableData?.(
    activeTab, currentCache, search?.value, itemGroup?.value
  );
  if (!data || !data.length) return;
  const filename = globalThis.hwaHelperPopupData?.tableExportFilename?.(activeTab) || `hwa-${activeTab}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const search = document.querySelector('#search');
const itemGroup = document.querySelector('#item-group');
const logSort = document.querySelector('#log-sort');
const resourceSort = document.querySelector('#resource-sort');
const resourceFilterToggle = document.querySelector('#resource-filter-toggle');
const resourceFilterToggleText = document.querySelector('#resource-filter-toggle-text');
let showAllResources = false;
resourceFilterToggle?.addEventListener('click', () => {
  showAllResources = !showAllResources;
  render();
});
const tabs = [...document.querySelectorAll('[data-tab]')];
let activeTab = 'heroes';
let settingsPending = Promise.resolve();
let renderTimer;
let currentCache = {};
let currentGuildChatLastReadTime = 0;
let currentProductionRates = {};
const sortState = {};
let favoriteHeroes = new Set();
let favoriteTitans = new Set();

async function toggleFavoriteHero(heroId) {
  const idStr = String(heroId);
  if (favoriteHeroes.has(idStr)) {
    favoriteHeroes.delete(idStr);
  } else {
    favoriteHeroes.add(idStr);
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ favoriteHeroes: Array.from(favoriteHeroes) }).catch(() => {});
  }
  render();
}

async function toggleFavoriteTitan(titanId) {
  const idStr = String(titanId);
  if (favoriteTitans.has(idStr)) {
    favoriteTitans.delete(idStr);
  } else {
    favoriteTitans.add(idStr);
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ favoriteTitans: Array.from(favoriteTitans) }).catch(() => {});
  }
  render();
}

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
  return globalThis.hwaHelperPopupData?.isResourceSelectableForHeader?.(entry) ??
    !['resource:energy', 'resource:world-energy'].includes(entry?.key);
}

function resourceAppearance(entry) {
  const key = entry?.key || '';
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
  if (key === 'resource:gold') return { icon: '🪙',
    classes: 'bg-yellow-50 text-yellow-800 ring-yellow-200' };
  if (key === 'resource:starMoney') return { icon: '💎',
    classes: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
  if (key.startsWith('resource:coin:')) return { icon: '🪙',
    classes: 'bg-amber-50 text-amber-800 ring-amber-200' };
  if (key.startsWith('resource:consumable:')) return { icon: '🧪',
    classes: 'bg-teal-50 text-teal-800 ring-teal-200' };
  if (key.startsWith('resource:speedUp')) return { icon: '⏱️',
    classes: 'bg-sky-50 text-sky-800 ring-sky-200' };
  if (key.startsWith('resource:fragment')) return { icon: '🧩',
    classes: 'bg-indigo-50 text-indigo-800 ring-indigo-200' };
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
  const isMine = ['food', 'wood', 'stone', 'iron', 'mine'].includes(march.kind) || Boolean(march.mineId);
  const isTraveling = march.stage === 'moveToTargetInSolo' && Number.isFinite(march.targetArrivalAt) && now < march.targetArrivalAt;
  const prevLabel = march.previousKind && marchStyles[march.previousKind] ? marchStyles[march.previousKind].label : null;
  const isReturning = march.kind === 'return' || march.stage === 'returnToOutpost';
  const action = isReturning ? (prevLabel ? `${prevLabel} returning` : 'Returning') : isMine ?
    `${isTraveling ? 'Traveling to' : 'Gathering'} ${style.label}` :
    march.kind === 'return' ? 'Returning' :
    march.stage === 'waitingForRallyStart' ? 'Preparing raid' : `${style.label} march`;
  const remaining = Number.isFinite(march.endsAt) ?
    Math.ceil((march.endsAt - now) / 1000) : null;
  const isGatheringActive = isMine && !isTraveling && !isReturning && !march.returnAt && (!Number.isFinite(march.endsAt) || march.endsAt <= now);
  const time = isGatheringActive ? 'In progress' : remaining === null ? 'Time unavailable' :
    remaining <= 0 ? 'Due now' : `${resourceData.tooltipTime(remaining)} remaining`;
  return `${action}\n${time}`;
}

function isMarchExpired(march, now = Date.now()) {
  return globalThis.hwaHelperPopupData.isMarchExpired(march, now);
}

function refreshTimed() {
  const now = Date.now();
  const marches = currentCache.marchStatus?.data?.marches || [];
  const marchesWrap = document.querySelector('#marches');
  for (const badge of marchesWrap.querySelectorAll('[data-march-index]')) {
    const march = marches[Number(badge.dataset.marchIndex)];
    if (!march) continue;
    badge.hidden = isMarchExpired(march, now);
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

  const energyVal = resourceData.amountAt(energy) ?? currentCache.energyStatus?.data?.energy;
  const energyCap = energy?.data?.cap;
  const isEnergyCapped = Number.isFinite(energyVal) && Number.isFinite(energyCap) && energyVal >= energyCap;
  document.querySelector('#energy-badge')?.classList?.toggle('resource-capped-amber', isEnergyCapped);

  const worldVal = resourceData.amountAt(worldEnergy) ?? currentCache.worldEnergyStatus?.data?.energy;
  const worldCap = worldEnergy?.data?.cap ?? 200;
  const isWorldCapped = Number.isFinite(worldVal) && Number.isFinite(worldCap) && worldVal >= worldCap;
  document.querySelector('#world-energy-badge')?.classList?.toggle('resource-capped-sky', isWorldCapped);

  for (const node of document.querySelectorAll('[data-resource-header="true"]')) {
    const entry = currentCache[node.dataset.resourceAmount];
    const pill = node.parentElement;
    if (!entry || !pill) continue;
    node.textContent = resourceData.formatAmount(resourceData.amountAt(entry, now));
    setResourceTooltip(pill, resourceTooltip(entry, now));
    const amt = resourceData.amountAt(entry, now);
    const cap = entry.data?.cap;
    const isCapped = Number.isFinite(amt) && Number.isFinite(cap) && amt >= cap;
    pill?.classList?.toggle('resource-capped', isCapped);
  }

  const eventsBadge = document.querySelector('#events-tab-badge');
  if (eventsBadge) {
    const hasActiveEvents = Boolean(currentCache.clanVersusStatus || currentCache.clanWarChampStatus || currentCache.clanClashStatus || currentCache.brawlStatus || currentCache.questEvents);
    eventsBadge.hidden = !hasActiveEvents;
  }
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
  const chatPanel = document.querySelector('#guild-chat-panel');
  if (!chatPanel || chatPanel.hidden) {
    if (typeof activeTab === 'undefined' || activeTab !== 'chat') {
      if (typeof updateGuildChatBadge === 'function') {
        const lastRead = typeof currentGuildChatLastReadTime !== 'undefined' ? currentGuildChatLastReadTime : 0;
        updateGuildChatBadge(currentCache, lastRead);
      }
    }
  }
}

function renderResources(entries, selection) {
  const selected = new Set(selection);
  const isDebug = (entry) => globalThis.hwaHelperPopupData?.isDebugOrEventResource?.(entry) ?? false;

  const matchingEntries = entries.filter((entry) => matches([resourceLabel(entry), entry.key]));
  const hiddenCount = matchingEntries.filter((entry) => isDebug(entry)).length;

  if (resourceFilterToggle && resourceFilterToggleText) {
    resourceFilterToggle.hidden = false;
    if (showAllResources) {
      resourceFilterToggle.className = 'inline-flex cursor-pointer items-center gap-1 shrink-0 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 shadow-2xs';
      resourceFilterToggleText.textContent = hiddenCount > 0 ? `Hide Inactive (${hiddenCount})` : 'Hide Inactive';
      resourceFilterToggle.title = 'Hide test, debug, and unreleased event resources';
    } else {
      resourceFilterToggle.className = 'inline-flex cursor-pointer items-center gap-1 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-700 shadow-2xs';
      resourceFilterToggleText.textContent = hiddenCount > 0 ? `Show All (${hiddenCount})` : 'Show All';
      resourceFilterToggle.title = 'Show test, debug, and unreleased event resources';
    }
  }

  const visibleEntries = matchingEntries.filter((entry) => showAllResources || !isDebug(entry));
  const renewableRows = [];
  const otherRows = [];
  for (const entry of visibleEntries) {
    if (isRenewable(entry)) renewableRows.push(entry);
    else otherRows.push(entry);
  }

  const sort = resourceSort.value;
  const sortFn = (a, b) => sort === 'name' ? resourceLabel(a).localeCompare(resourceLabel(b)) :
    (resourceData.amountAt(a) - resourceData.amountAt(b)) * (sort === 'amount-desc' ? -1 : 1);
  renewableRows.sort(sortFn);
  otherRows.sort(sortFn);

  const totalVisible = renewableRows.length + otherRows.length;
  status.textContent = `${totalVisible} resources${!showAllResources && hiddenCount > 0 ? ` (${hiddenCount} inactive hidden)` : ''} · select resources for the header`;
  if (tableExportBtn) tableExportBtn.hidden = !totalVisible;
  if (!totalVisible) return showEmpty('No matching resources observed yet.');

  const list = document.createElement('div');
  list.className = 'divide-y divide-slate-100';

  function createResourceRow(entry) {
    const amt = resourceData.amountAt(entry);
    const cap = entry.data?.cap;
    const isCapped = Number.isFinite(amt) && Number.isFinite(cap) && amt >= cap;

    const label = document.createElement('label');
    label.className = `flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-blue-50/50 ${isCapped ? 'bg-amber-50/40' : ''}`;
    label.tabIndex = 0;
    label.dataset.resourceTooltip = '';
    setResourceTooltip(label, resourceTooltip(entry));

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

    const iconSpan = document.createElement('span');
    const appearance = resourceAppearance(entry);
    iconSpan.textContent = appearance.icon;
    iconSpan.className = 'text-xs shrink-0';
    iconSpan.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'min-w-0 flex-1 truncate text-slate-700 flex items-center gap-1.5';
    name.textContent = resourceLabel(entry);
    if (isCapped) {
      const fullBadge = document.createElement('span');
      fullBadge.className = 'rounded bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white uppercase';
      fullBadge.textContent = 'Full';
      name.append(fullBadge);
    }

    const amount = document.createElement('strong');
    amount.className = 'tabular-nums text-slate-900';
    amount.dataset.resourceAmount = entry.key;
    amount.textContent = resourceData.formatAmount(amt);

    label.append(iconSpan, name, amount);
    return label;
  }

  if (renewableRows.length > 0) {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-100/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 backdrop-blur-xs';
    groupHeader.innerHTML = `<span>⚡ Renewable Resources</span><span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">${renewableRows.length}</span>`;
    list.append(groupHeader);
    for (const entry of renewableRows) list.append(createResourceRow(entry));
  }

  if (otherRows.length > 0) {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sticky top-0 z-10 flex items-center justify-between border-b border-t border-slate-200 bg-slate-100/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 backdrop-blur-xs';
    groupHeader.innerHTML = `<span>📦 Other Resources</span><span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">${otherRows.length}</span>`;
    list.append(groupHeader);
    for (const entry of otherRows) list.append(createResourceRow(entry));
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

  if (titanSnapshot?.skills && Object.keys(titanSnapshot.skills).length) {
    const skillsBox = document.createElement('div');
    skillsBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const skillsLabel = document.createElement('span');
    skillsLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    skillsLabel.textContent = 'Skills';
    const skillsList = document.createElement('div');
    skillsList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const sortedKeys = Object.keys(titanSnapshot.skills).sort((a, b) => Number(a) - Number(b));
    sortedKeys.forEach((key, idx) => {
      const badge = document.createElement('span');
      badge.className = 'rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300 tabular-nums';
      badge.textContent = `S${idx + 1}: ${titanSnapshot.skills[key]}`;
      skillsList.append(badge);
    });
    skillsBox.append(skillsLabel, skillsList);
    details.append(skillsBox);
  }

  if (titanSnapshot?.skins && typeof titanSnapshot.skins === 'object' && Object.keys(titanSnapshot.skins).length) {
    const skinsBox = document.createElement('div');
    skinsBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const skinsLabel = document.createElement('span');
    skinsLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    skinsLabel.textContent = 'Skins';
    const skinsList = document.createElement('div');
    skinsList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const skinEntries = Object.entries(titanSnapshot.skins).sort(([a], [b]) => Number(a) - Number(b));
    for (const [skinId, level] of skinEntries) {
      const isCurrent = Number(skinId) === Number(titanSnapshot.currentSkin);
      const badge = document.createElement('span');
      badge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        isCurrent ? 'bg-amber-900/60 text-amber-200 ring-1 ring-amber-500/50' : 'bg-slate-700/80 text-amber-300'
      }`;
      let stat = globalThis.hwaHelperSkinStats?.[skinId];
      if (!stat || stat === 'MAIN') stat = 'HP';
      badge.textContent = `${stat}: ${level}`;
      skinsList.append(badge);
    }
    skinsBox.append(skinsLabel, skinsList);
    details.append(skinsBox);
  }

  if (Array.isArray(titanSnapshot?.artifacts) && titanSnapshot.artifacts.length) {
    const artBox = document.createElement('div');
    artBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 mt-0.5';
    const artLabel = document.createElement('span');
    artLabel.className = 'text-slate-400 block text-[10px] uppercase tracking-wider font-semibold';
    artLabel.textContent = 'Artifacts';
    const artList = document.createElement('div');
    artList.className = 'flex items-center gap-1.5 mt-0.5 flex-wrap';
    const typeNames = ['Wpn', 'Crown', 'Seal'];
    titanSnapshot.artifacts.forEach((art, idx) => {
      const badge = document.createElement('span');
      const isUpgradable = globalThis.hwaHelperPopupData?.isTitanArtifactUpgradable?.(titanId, idx, titanSnapshot, currentCache);
      badge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        isUpgradable ? 'bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-500/50' : 'bg-slate-700/80 text-violet-300'
      }`;
      const typeLabel = typeNames[idx] || `Art${idx + 1}`;
      const star = art?.star ?? 0;
      const level = art?.level ?? 1;
      badge.textContent = `${typeLabel}: ${star}★ Lv.${level}`;
      artList.append(badge);
    });
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
  const powerIndex = headings.indexOf('Power');
  const defaultSort = (activeTab === 'heroes' || activeTab === 'titans') && powerIndex !== -1 ? { column: powerIndex, direction: 'desc' } : undefined;
  const selectedSort = sortState[activeTab] ?? defaultSort;
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
  const isHeroFav = (row) => activeTab === 'heroes' && typeof favoriteHeroes !== 'undefined' && favoriteHeroes.has(String(row[0]));
  const isTitanFav = (row) => activeTab === 'titans' && typeof favoriteTitans !== 'undefined' && favoriteTitans.has(String(row[0]));
  const isFavFn = activeTab === 'heroes' ? isHeroFav : (activeTab === 'titans' ? isTitanFav : null);
  const hasFavs = activeTab === 'heroes' ? (typeof favoriteHeroes !== 'undefined' && favoriteHeroes.size > 0) :
    (activeTab === 'titans' ? (typeof favoriteTitans !== 'undefined' && favoriteTitans.size > 0) : false);
  const sortedRows = selectedSort ?
    globalThis.hwaHelperPopupData.sortRows(rows, selectedSort.column, selectedSort.direction, isFavFn) :
    (hasFavs ?
      [...rows].sort((a, b) => (isFavFn(b) ? 1 : 0) - (isFavFn(a) ? 1 : 0)) : rows);
  const soulColIndex = headings.indexOf('Soul stones');
  const isSoulUpgradeReady = globalThis.hwaHelperPopupData?.isSoulUpgradeReady;
  for (const values of sortedRows) {
    const line = document.createElement('tr');
    const canEvolve = soulColIndex !== -1 && Boolean(isSoulUpgradeReady?.(values[soulColIndex]));
    const isFav = isFavFn ? isFavFn(values) : false;
    if (isFav) line.dataset.favorite = 'true';
    line.className = canEvolve ?
      'border-b border-emerald-100 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-950 font-medium' :
      (isFav ?
        'border-b border-amber-100/80 bg-amber-50/30 hover:bg-amber-100/40 text-slate-800' :
        'border-b border-slate-100 hover:bg-blue-50/50');
    if (canEvolve) line.dataset.canEvolve = 'true';
    for (const [column, heading] of headings.entries()) {
      const value = values[column];
      const cell = document.createElement('td');
      cell.className = 'px-3 py-2 align-top text-slate-700';
      if (heading === 'Star') {
        cell.append(starIcons(value));
      } else if (heading === 'Hero ID' && activeTab === 'heroes') {
        const heroId = String(value);
        const isThisFav = typeof favoriteHeroes !== 'undefined' && favoriteHeroes.has(heroId);
        const wrap = document.createElement('div');
        wrap.className = 'inline-flex items-center gap-1.5';

        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.className = `cursor-pointer rounded p-0.5 transition-colors ${
          isThisFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'
        }`;
        favBtn.title = isThisFav ? 'Remove favorite' : 'Add favorite';
        favBtn.setAttribute('title', favBtn.title);
        favBtn.setAttribute('aria-label', favBtn.title);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('fill', isThisFav ? 'currentColor' : 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2');
        svg.append(polygon);
        favBtn.append(svg);

        favBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await toggleFavoriteHero(heroId);
        });

        const idSpan = document.createElement('span');
        idSpan.textContent = heroId;
        wrap.append(favBtn, idSpan);
        cell.append(wrap);
      } else if (heading === 'Titan ID' && activeTab === 'titans') {
        const titanId = String(value);
        const isThisFav = typeof favoriteTitans !== 'undefined' && favoriteTitans.has(titanId);
        const wrap = document.createElement('div');
        wrap.className = 'inline-flex items-center gap-1.5';

        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.className = `cursor-pointer rounded p-0.5 transition-colors ${
          isThisFav ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'
        }`;
        favBtn.title = isThisFav ? 'Remove favorite' : 'Add favorite';
        favBtn.setAttribute('title', favBtn.title);
        favBtn.setAttribute('aria-label', favBtn.title);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('fill', isThisFav ? 'currentColor' : 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2');
        svg.append(polygon);
        favBtn.append(svg);

        favBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await toggleFavoriteTitan(titanId);
        });

        const idSpan = document.createElement('span');
        idSpan.textContent = titanId;
        wrap.append(favBtn, idSpan);
        cell.append(wrap);
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
      } else if (heading === 'Artifacts' && activeTab === 'titans') {
        const titanId = values[0];
        const titanSnapshot = currentCache.titanGetAll?.data?.[titanId];
        const arts = titanSnapshot?.artifacts;
        const isUpgradableFn = globalThis.hwaHelperPopupData?.isTitanArtifactUpgradable;
        if (Array.isArray(arts) && arts.length > 0) {
          arts.forEach((art, idx) => {
            if (idx > 0) cell.append(' - ');
            const lvl = art && art.level != null ? art.level : 1;
            const canUp = Boolean(isUpgradableFn?.(titanId, idx, titanSnapshot, currentCache));
            if (canUp) {
              const strong = document.createElement('strong');
              strong.className = 'font-bold text-emerald-800';
              strong.textContent = String(lvl);
              cell.append(strong);
            } else {
              const span = document.createElement('span');
              span.textContent = String(lvl);
              cell.append(span);
            }
          });
        } else {
          cell.textContent = String(value ?? '—');
        }
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
    if (tableExportBtn) tableExportBtn.hidden = true;
    status.textContent = 'No cached data yet. Use the game to observe RPCs.';
    showEmpty('No matching RPC observed yet.');
    return;
  }
  const rows = makeRows(entry.data).filter(matches);
  status.textContent = `${rows.length} rows · Updated ${formatTime(entry.updatedAt)}`;
  if (tableExportBtn) tableExportBtn.hidden = !rows.length;
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
let draftViewMode = null; // 'defense' or 'attack'
let draftStepCandidates = {
  defense: globalThis.hwaHelperPopupData?.defaultDraftCandidates?.('defense') || [
    [78, 49, 44],
    [76, 20, 38],
    [75, 2, 25],
    [37, 73, 28],
    [5, 35, 69]
  ],
  attack: globalThis.hwaHelperPopupData?.defaultDraftCandidates?.('attack') || [
    [8, 49, 28],
    [73, 56, 12],
    [17, 34, 14],
    [4, 55, 10],
    [29, 25, 78]
  ]
};
let activeHeroSwapTarget = null;
let selectedRoleFilter = 'all';

function renderDraft(cache) {
  const draft = cache.legendDraftStatus?.data || {};
  const stageId = Number.isInteger(draft.stageId) ? draft.stageId : 0;
  const isDefenseStage = stageId === 2 || stageId === 3;
  const isAttackStage = stageId === 4;
  const isReady = stageId === 5;
  const isSearching = stageId === 1;
  const isMatchCompleted = stageId === 7 || Boolean(draft.lastResult);

  if (Array.isArray(draft.defenceHeroes) && draft.defenceHeroes.length === 5) {
    localDraftDefencePicks = [...draft.defenceHeroes];
  } else if (Array.isArray(draft.lastResult?.defenceHeroes) && draft.lastResult.defenceHeroes.length === 5) {
    localDraftDefencePicks = [...draft.lastResult.defenceHeroes];
  }
  if (Array.isArray(draft.attackHeroes) && draft.attackHeroes.length === 5) {
    localDraftAttackPicks = [...draft.attackHeroes];
  } else if (Array.isArray(draft.lastResult?.attackHeroes) && draft.lastResult.attackHeroes.length === 5) {
    localDraftAttackPicks = [...draft.lastResult.attackHeroes];
  }

  // Determine active view mode (toggle takes priority, else match stage)
  if (!draftViewMode) {
    draftViewMode = isAttackStage ? 'attack' : 'defense';
  }
  const isViewingAttack = draftViewMode === 'attack';

  const currentPicks = isViewingAttack ? localDraftAttackPicks : localDraftDefencePicks;
  while (currentPicks.length < 5) currentPicks.push(null);

  const val = globalThis.hwaHelperPopupData.validateDraftPicks(currentPicks);
  const isModeLocked = isViewingAttack ?
    (draft.attackHeroes?.length === 5 || (isMatchCompleted && localDraftAttackPicks.filter(Boolean).length === 5)) :
    (draft.defenceHeroes?.length === 5 || (isMatchCompleted && localDraftDefencePicks.filter(Boolean).length === 5));

  // Display 15 pick slots when drafting is active for this phase
  const isActivelyDrafting = !isModeLocked && (draft.matchId || isDefenseStage || isAttackStage) && !isMatchCompleted;

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
  matchInfo.textContent = draft.matchId ? `Match #${draft.matchId}` : 'Legend Draft Mode';
  stageCol.append(matchInfo);

  const stageTitle = document.createElement('div');
  stageTitle.className = 'text-base font-bold text-slate-900 flex items-center gap-2';
  const stageBadgeColor = isDefenseStage ? 'bg-amber-100 text-amber-800 border-amber-300' :
                          isAttackStage ? 'bg-red-100 text-red-800 border-red-300' :
                          isReady ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                          isSearching ? 'bg-blue-100 text-blue-800 border-blue-300' :
                          isMatchCompleted ? 'bg-purple-100 text-purple-800 border-purple-300' :
                          'bg-slate-100 text-slate-700 border-slate-300';
  stageTitle.innerHTML = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stageBadgeColor}">${globalThis.hwaHelperPopupData.draftStageDescription(stageId)}</span>`;
  stageCol.append(stageTitle);

  if (draft.stageFinishTs && !isMatchCompleted) {
    const timerRow = document.createElement('div');
    timerRow.className = 'flex items-center gap-2 pt-1';
    timerRow.innerHTML = `<span class="text-xs text-slate-500">Time remaining:</span>
      <span id="draft-countdown" class="text-xl font-bold font-mono text-red-600">${globalThis.hwaHelperPopupData.formatCountdown(draft.stageFinishTs)}</span>`;
    stageCol.append(timerRow);
  }

  // Result box if match completed or lastResult exists
  if (draft.lastResult) {
    const resultBox = document.createElement('div');
    const isWin = draft.lastResult.result === 0;
    resultBox.className = `mt-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-between ${
      isWin ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-300 text-slate-700'
    }`;
    const diff = draft.lastResult.rating?.userDifRating;
    const diffStr = diff != null ? ` (${diff >= 0 ? '+' : ''}${diff})` : '';
    const ratingStr = draft.lastResult.rating?.userRating != null ? `Rating: ${draft.lastResult.rating.userRating}${diffStr}` : '';
    const rewardStr = draft.lastResult.reward?.draftBpExp ? `+${draft.lastResult.reward.draftBpExp} BP EXP` : '';
    resultBox.innerHTML = `<span>${isWin ? '🏆 Victory' : '⚔️ Defeat / Finished'}</span> <span>${ratingStr}</span> <span>${rewardStr}</span>`;
    stageCol.append(resultBox);
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
    enemyName.textContent = enemyUser.name || 'Opponent';
    enemyInfo.append(enemyName);

    const enemySub = document.createElement('div');
    enemySub.className = 'text-xs text-slate-500 flex items-center gap-2';
    enemySub.innerHTML = `<span>Lv.${enemyUser.level || '—'}</span>${enemyUser.clanTitle ? `<span>• Guild: ${enemyUser.clanTitle}</span>` : ''}`;
    enemyInfo.append(enemySub);

    if (draft.rating) {
      const ratingRow = document.createElement('div');
      ratingRow.className = 'text-xs text-slate-600 font-medium pt-0.5';
      ratingRow.textContent = `Rating: You ${draft.rating.userRating ?? '—'} vs Opponent ${draft.rating.enemyRating ?? '—'}`;
      enemyInfo.append(ratingRow);
    }
    enemyCol.append(enemyInfo);
    headerGrid.append(enemyCol);
  }
  headerCard.append(headerGrid);
  container.append(headerCard);

  // 2. Draft Team Switcher: Defense Draft vs Attack Draft
  const switcherCard = document.createElement('div');
  switcherCard.className = 'flex items-center justify-between flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs';
  
  const switcherBtns = document.createElement('div');
  switcherBtns.className = 'inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1';

  const defCount = (draft.defenceHeroes?.length || localDraftDefencePicks.filter(Boolean).length) || 0;
  const atkCount = (draft.attackHeroes?.length || localDraftAttackPicks.filter(Boolean).length) || 0;

  const defBtn = document.createElement('button');
  defBtn.type = 'button';
  defBtn.className = `px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
    !isViewingAttack ?
      'bg-amber-600 text-white shadow-xs' :
      'text-slate-600 hover:bg-slate-200'
  }`;
  defBtn.innerHTML = `<span>🛡️ Defense Draft</span> <span class="px-1.5 py-0.2 rounded-full text-[10px] ${!isViewingAttack ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'}">${defCount}/5</span>`;
  defBtn.addEventListener('click', () => {
    draftViewMode = 'defense';
    activeHeroSwapTarget = null;
    render();
  });

  const atkBtn = document.createElement('button');
  atkBtn.type = 'button';
  atkBtn.className = `px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
    isViewingAttack ?
      'bg-red-600 text-white shadow-xs' :
      'text-slate-600 hover:bg-slate-200'
  }`;
  atkBtn.innerHTML = `<span>⚔️ Attack Draft</span> <span class="px-1.5 py-0.2 rounded-full text-[10px] ${isViewingAttack ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700'}">${atkCount}/5</span>`;
  atkBtn.addEventListener('click', () => {
    draftViewMode = 'attack';
    activeHeroSwapTarget = null;
    render();
  });

  switcherBtns.append(defBtn, atkBtn);
  switcherCard.append(switcherBtns);

  const switcherDesc = document.createElement('span');
  switcherDesc.className = 'text-xs text-slate-500 font-medium px-2';
  switcherDesc.textContent = isViewingAttack ?
    'Viewing Attack Draft lineup & Opponent Defense counter' :
    'Viewing Defense Draft lineup & Opponent Attack';
  switcherCard.append(switcherDesc);
  container.append(switcherCard);

  // 3. Counter Lineup Card
  if (isViewingAttack && draft.enemyDefenceHeroes?.length) {
    const enemyLineupCard = document.createElement('div');
    enemyLineupCard.className = 'rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2';
    
    const enemyTitle = document.createElement('div');
    enemyTitle.className = 'text-xs font-bold text-amber-900 flex items-center gap-1.5';
    enemyTitle.innerHTML = `<span>🛡️ Opponent Defense Lineup (5 heroes to counter):</span>`;
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
  } else if (!isViewingAttack && draft.enemyAttackHeroes?.length) {
    const enemyLineupCard = document.createElement('div');
    enemyLineupCard.className = 'rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2';
    
    const enemyTitle = document.createElement('div');
    enemyTitle.className = 'text-xs font-bold text-red-900 flex items-center gap-1.5';
    enemyTitle.innerHTML = `<span>⚔️ Opponent Attack Lineup (5 heroes deployed against your defense):</span>`;
    enemyLineupCard.append(enemyTitle);

    const enemySlotRow = document.createElement('div');
    enemySlotRow.className = 'flex flex-wrap gap-2';
    for (const heroId of draft.enemyAttackHeroes) {
      const heroMeta = globalThis.hwaHelperHeroMetadata?.[heroId] || {};
      const heroSnap = cache.heroGetAll?.data?.[heroId];
      const slot = document.createElement('div');
      slot.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white shadow-xs';
      slot.append(createHeroInline(heroId, heroMeta.name || globalThis.hwaHelperNameMap.hero(heroId) || `#${heroId}`, heroSnap));
      enemySlotRow.append(slot);
    }
    enemyLineupCard.append(enemySlotRow);
    container.append(enemyLineupCard);
  }

  // 4. Lineup Display / Step Picking Slots
  const teamSection = document.createElement('div');
  teamSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3';
  
  const teamHeader = document.createElement('div');
  teamHeader.className = 'flex items-center justify-between flex-wrap gap-2';
  
  const teamTitleCol = document.createElement('div');
  teamTitleCol.className = 'space-y-0.5';
  const teamTitle = document.createElement('h3');
  teamTitle.className = 'text-sm font-bold text-slate-800 flex items-center gap-1.5';
  teamTitle.textContent = isViewingAttack ? '⚔️ Your Attack Lineup:' : '🛡️ Your Defense Lineup:';
  teamTitleCol.append(teamTitle);

  const teamSub = document.createElement('div');
  teamSub.className = 'text-xs text-slate-500';
  if (isModeLocked) {
    teamSub.textContent = `✓ Lineup locked (${val.count}/5 heroes)`;
  } else if (isActivelyDrafting) {
    teamSub.textContent = val.valid ? '✓ Selected 5/5 heroes (5 steps completed)' :
      `Selected: ${val.count}/5 steps • Click any step to choose candidate`;
  } else {
    teamSub.textContent = val.count === 5 ? '5 Heroes recorded' : (val.count > 0 ? `${val.count}/5 heroes recorded` : 'No heroes drafted yet');
  }
  teamTitleCol.append(teamSub);
  teamHeader.append(teamTitleCol);

  // Lock action button or locked badge
  if (isActivelyDrafting) {
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = val.valid ?
      'cursor-pointer px-4 py-1.5 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all' :
      'px-4 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-400 cursor-not-allowed border border-slate-200';
    lockBtn.disabled = !val.valid;
    lockBtn.textContent = isViewingAttack ? 'Lock Attack Lineup (5 Heroes)' : 'Lock Defense Lineup (5 Heroes)';
    if (val.valid) {
      lockBtn.addEventListener('click', () => {
        lockBtn.disabled = true;
        lockBtn.textContent = 'Submitting...';
        const action = isViewingAttack ? 'saveAttack' : 'saveDefence';
        chrome.runtime?.sendMessage?.({ kind: 'draft-action', action, heroes: val.heroes }, () => {
          setTimeout(render, 500);
        });
      });
    }
    teamHeader.append(lockBtn);
  } else if (isModeLocked) {
    const lockedTag = document.createElement('span');
    lockedTag.className = 'px-3 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 flex items-center gap-1';
    lockedTag.textContent = '✓ Lineup successfully locked';
    teamHeader.append(lockedTag);
  }
  teamSection.append(teamHeader);

  // 5 Heroes Slots Row
  const slotsGrid = document.createElement('div');
  slotsGrid.className = 'grid grid-cols-2 sm:grid-cols-5 gap-2.5';
  for (let i = 0; i < 5; i++) {
    const heroId = currentPicks[i];
    const isActiveStep = isActivelyDrafting && activeDraftStep === i;
    const slotCard = document.createElement('div');

    if (heroId) {
      const heroMeta = globalThis.hwaHelperHeroMetadata?.[heroId] || {};
      const heroSnap = cache.heroGetAll?.data?.[heroId];
      slotCard.className = `flex flex-col items-center justify-between p-2.5 rounded-xl border transition-all text-center min-h-[110px] relative ${
        isActiveStep ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-2 ring-blue-400 cursor-pointer' :
        isActivelyDrafting ? 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/60 cursor-pointer' :
        'border-slate-200 bg-slate-50/50'
      }`;
      
      const topRow = document.createElement('div');
      topRow.className = 'w-full flex items-center justify-between gap-1';
      const stepBadge = document.createElement('span');
      stepBadge.className = `text-[10px] px-1.5 py-0.2 rounded font-bold ${isActiveStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`;
      stepBadge.textContent = isActivelyDrafting ? `Step ${i + 1}` : `Hero ${i + 1}`;
      topRow.append(stepBadge);

      if (isActiveStep) {
        const activeTag = document.createElement('span');
        activeTag.className = 'text-[9px] font-bold text-blue-600 animate-pulse';
        activeTag.textContent = 'Picking';
        topRow.append(activeTag);
      } else if (isActivelyDrafting) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.title = 'Deselect this step';
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
        isActivelyDrafting ? 'border-slate-200 bg-slate-50/50 hover:border-blue-200 text-slate-400 cursor-pointer' :
        'border-slate-200 bg-slate-50/30 text-slate-400'
      }`;

      const topRow = document.createElement('div');
      topRow.className = 'w-full flex items-center justify-between';
      const stepBadge = document.createElement('span');
      stepBadge.className = `text-[10px] px-1.5 py-0.2 rounded font-bold ${isActiveStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`;
      stepBadge.textContent = isActivelyDrafting ? `Step ${i + 1}` : `Hero ${i + 1}`;
      topRow.append(stepBadge);
      if (isActiveStep) {
        const activeTag = document.createElement('span');
        activeTag.className = 'text-[9px] font-bold text-blue-600 animate-pulse';
        activeTag.textContent = 'Picking';
        topRow.append(activeTag);
      }
      slotCard.append(topRow);

      const placeholderWrap = document.createElement('div');
      placeholderWrap.className = 'flex flex-col items-center justify-center my-auto';
      placeholderWrap.innerHTML = isActivelyDrafting ?
        `<span class="text-xl font-bold leading-none ${isActiveStep ? 'text-blue-500' : 'text-slate-300'}">+</span><span class="text-[11px] font-medium mt-1">Pick 1 of 3</span>` :
        `<span class="text-xs text-slate-400">Empty</span>`;
      slotCard.append(placeholderWrap);
    }

    if (isActivelyDrafting) {
      slotCard.addEventListener('click', () => {
        activeDraftStep = i;
        activeHeroSwapTarget = null;
        render();
      });
    }
    slotsGrid.append(slotCard);
  }
  teamSection.append(slotsGrid);
  container.append(teamSection);

  // 5. Full 15-Hero Draft Grid (5 Columns x 3 Rows)
  // Rendered for both Defense Draft and Attack Draft phases alongside the lineup selection
  if (isActivelyDrafting) {
    const candidatesMode = isViewingAttack ? 'attack' : 'defense';
    const currentCandidates = draftStepCandidates[candidatesMode] ||
      globalThis.hwaHelperPopupData.defaultDraftCandidates(candidatesMode);

    const chooserSection = document.createElement('div');
    chooserSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4';

    const chooserHeader = document.createElement('div');
    chooserHeader.className = 'flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100';

    const chooserTitleCol = document.createElement('div');
    chooserTitleCol.className = 'space-y-0.5';
    const chooserTitle = document.createElement('h3');
    chooserTitle.className = 'text-sm font-bold text-slate-900 flex items-center gap-2';
    chooserTitle.innerHTML = `<span class="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">15</span> <span>15 Candidate Heroes Matrix (5 Steps × 3 Choices)</span>`;
    chooserTitleCol.append(chooserTitle);

    const chooserSub = document.createElement('div');
    chooserSub.className = 'text-xs text-slate-500';
    chooserSub.textContent = `Each column represents 1 pick step for ${isViewingAttack ? 'Attack' : 'Defense'} (choose 1 of 3 heroes). You can pick directly across all 5 columns to complete your lineup.`;
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
      resetBtn.textContent = 'Reset all 5 steps';
      resetBtn.addEventListener('click', () => {
        if (isViewingAttack) localDraftAttackPicks = [null, null, null, null, null];
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
      const stepCandidates = currentCandidates[stepIdx] || [78, 49, 44];
      const isColChosen = Number.isInteger(currentPicks[stepIdx]) && currentPicks[stepIdx] > 0;

      colBox.className = `flex flex-col space-y-2 rounded-xl p-2.5 transition-colors ${
        isColChosen ? 'bg-slate-50/80 border border-emerald-200' : 'bg-slate-50/40 border border-slate-200'
      }`;

      // Column Step Header
      const colHeader = document.createElement('div');
      colHeader.className = 'flex items-center justify-between pb-1.5 border-b border-slate-200/80 text-xs';

      const colTitle = document.createElement('span');
      colTitle.className = 'font-bold text-slate-800 flex items-center gap-1';
      colTitle.innerHTML = `<span class="size-4 rounded-full ${isColChosen ? 'bg-emerald-600' : 'bg-slate-700'} text-white text-[10px] flex items-center justify-center font-bold">${stepIdx + 1}</span> <span>Step ${stepIdx + 1}</span>`;

      const colStatusTag = document.createElement('span');
      colStatusTag.className = `text-[10px] px-1.5 py-0.2 rounded font-semibold ${
        isColChosen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
      }`;
      colStatusTag.textContent = isColChosen ? '✓ Selected' : 'Not picked';

      colHeader.append(colTitle, colStatusTag);
      colBox.append(colHeader);

      // 3 Candidate Hero Cards in this column
      for (let cIdx = 0; cIdx < stepCandidates.length; cIdx++) {
        const cHeroId = stepCandidates[cIdx];
        const meta = globalThis.hwaHelperHeroMetadata?.[cHeroId] || {};
        const snap = cache.heroGetAll?.data?.[cHeroId];
        const isChosen = currentPicks[stepIdx] === cHeroId;

        const card = document.createElement('div');
        card.className = `relative flex flex-col items-center p-2 rounded-xl border transition-all text-center ${
          isChosen ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-400' :
          'border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs'
        }`;

        // Top toolbar of candidate card: pick button & swap button
        const cardTop = document.createElement('div');
        cardTop.className = 'w-full flex items-center justify-between mb-1';

        const choiceTag = document.createElement('span');
        choiceTag.className = 'text-[9px] font-bold text-slate-400';
        choiceTag.textContent = `#${cIdx + 1}`;
        cardTop.append(choiceTag);

        const swapBtn = document.createElement('button');
        swapBtn.type = 'button';
        swapBtn.title = 'Swap this candidate hero';
        swapBtn.className = 'text-[10px] text-slate-400 hover:text-blue-600 cursor-pointer p-0.5 rounded hover:bg-slate-100';
        swapBtn.textContent = '⇄';
        swapBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          activeHeroSwapTarget = { stepIdx, candidateIdx: cIdx };
          render();
        });
        cardTop.append(swapBtn);
        card.append(cardTop);

        // Avatar + Name + Role
        const avWrap = document.createElement('div');
        avWrap.className = 'relative cursor-pointer my-0.5';
        const aPath = meta.avatarFile || (meta.hasAvatar ? `assets/heroes/${cHeroId}.webp` : null);
        const cardGlow = starGlowClass(snap?.star, false);
        if (aPath) {
          const aImg = document.createElement('img');
          aImg.src = aPath;
          aImg.className = `size-9 rounded-full object-cover shrink-0 ${cardGlow}`;
          avWrap.append(aImg);
        } else {
          avWrap.append(createInitialsBadge(meta.name || `#${cHeroId}`, meta.faction, false));
        }
        card.append(avWrap);

        const nameLabel = document.createElement('div');
        nameLabel.className = 'text-xs font-bold text-slate-800 truncate max-w-[90px] mt-0.5';
        nameLabel.textContent = meta.name || globalThis.hwaHelperNameMap.hero(cHeroId) || `#${cHeroId}`;
        card.append(nameLabel);

        if (meta.role) {
          const rBadge = document.createElement('span');
          rBadge.className = 'text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium my-0.5';
          rBadge.textContent = meta.role;
          card.append(rBadge);
        }

        // Pick / Picked button
        const pickCardBtn = document.createElement('button');
        pickCardBtn.type = 'button';
        pickCardBtn.className = `mt-1.5 w-full py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
          isChosen ?
            'bg-emerald-600 text-white shadow-xs' :
            'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200'
        }`;
        pickCardBtn.textContent = isChosen ? '✓ Selected' : 'Pick';
        pickCardBtn.addEventListener('click', () => {
          currentPicks[stepIdx] = cHeroId;
          const nextEmpty = currentPicks.findIndex((p, idx) => idx > stepIdx && !p);
          if (nextEmpty !== -1) {
            activeDraftStep = nextEmpty;
          }
          activeHeroSwapTarget = null;
          render();
        });
        card.append(pickCardBtn);

        colBox.append(card);
      }
      fullGrid.append(colBox);
    }
    chooserSection.append(fullGrid);

    // Swap drawer if active
    if (activeHeroSwapTarget) {
      const { stepIdx: sIdx, candidateIdx: cIdx } = activeHeroSwapTarget;
      const swapWrap = document.createElement('div');
      swapWrap.className = 'rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-2';

      const swapHeader = document.createElement('div');
      swapHeader.className = 'flex items-center justify-between';
      const swapTitle = document.createElement('div');
      swapTitle.className = 'text-xs font-bold text-blue-900';
      swapTitle.textContent = `Select substitute hero for Step ${sIdx + 1} - Choice #${cIdx + 1}:`;
      swapHeader.append(swapTitle);

      const closeSwapBtn = document.createElement('button');
      closeSwapBtn.type = 'button';
      closeSwapBtn.className = 'text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer';
      closeSwapBtn.textContent = 'Close [✕]';
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
          if (!currentCandidates[sIdx]) {
            currentCandidates[sIdx] = [78, 49, 44];
          }
          currentCandidates[sIdx][cIdx] = hId;
          activeHeroSwapTarget = null;
          render();
        });
        swapGrid.append(itemBtn);
      }
      swapWrap.append(swapGrid);
      chooserSection.append(swapWrap);
    }

    container.append(chooserSection);
  } else if (!draft.matchId && !draft.defenceHeroes?.length && !draft.attackHeroes?.length) {
    // Idle state when not in draft and no previous draft exists
    const idleCard = document.createElement('div');
    idleCard.className = 'rounded-xl border border-slate-200 bg-slate-50/70 p-6 text-center space-y-2';
    idleCard.innerHTML = `
      <div class="text-sm font-bold text-slate-800">Legend Draft: Not in match</div>
      <div class="text-xs text-slate-500 max-w-md mx-auto">Start a Legend Draft match in Hero Wars to activate live assistance. Once a match begins, you can pick heroes, review enemy defense, and optimize counter-lineups.</div>
    `;
    container.append(idleCard);
  } else if (isModeLocked && (isDefenseStage || isAttackStage)) {
    // Mode locked notice during active match
    const lockedCard = document.createElement('div');
    lockedCard.className = 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center space-y-1';
    lockedCard.innerHTML = `
      <div class="text-sm font-bold text-emerald-900 flex items-center justify-center gap-1.5">
        <span>✓</span> <span>${isViewingAttack ? 'Attack' : 'Defense'} Lineup locked!</span>
      </div>
      <div class="text-xs text-emerald-700">The 5 heroes for this stage are locked. The match will proceed to the next stage.</div>
    `;
    container.append(lockedCard);
  }

  view.replaceChildren(container);
  const stageDesc = globalThis.hwaHelperPopupData.draftStageDescription(stageId);
  const matchPrefix = draft.matchId ? `Match #${draft.matchId} • ` : '';
  const pickInfo = isActivelyDrafting ? ` • Selected ${val.count}/5 steps` :
    (val.count === 5 ? ` • ${isViewingAttack ? 'Attack' : 'Defense'} lineup locked (5 heroes)` : '');
  status.textContent = `${matchPrefix}${stageDesc}${pickInfo}`;
}

function openGuildVersusModal(vsStatus, cache) {
  const modal = document.querySelector('#guild-versus-modal');
  const body = document.querySelector('#gvs-modal-body');
  if (!modal || !body) return;

  const activeCache = cache || currentCache || {};

  const battle = vsStatus?.battle || {};
  const info = vsStatus?.info || {};
  const rewards = vsStatus?.rewards || {};
  const clan = battle.clan || { name: '4-LEAF CLOVER', server: '1431' };
  const enemyClan = battle.enemyClan || { name: 'Black', server: '1410' };
  const league = battle.league || (info.league ? `League #${info.league}` : 'Bronze');
  const leagueLabel = league.charAt(0).toUpperCase() + league.slice(1);
  const leagueBadge = document.querySelector('#gvs-league-badge');
  if (leagueBadge) leagueBadge.textContent = `${leagueLabel} League`;

  body.replaceChildren();

  function formatRewardItem(key, amount) {
    if (key === 'energy') return `+${amount.toLocaleString()} Energy`;
    if (key === 'gold') return `+${amount.toLocaleString()} Gold`;
    if (key === 'patron:1') return `+${amount} Relic Shard${amount > 1 ? 's' : ''}`;
    if (key === 'consumable:20') return `+${amount.toLocaleString()} Titan Potion`;
    if (key === 'consumable:40228') return `+${amount} Heroes Trove${amount > 1 ? 's' : ''}`;
    if (key === 'consumable:40230') return `+${amount} Titans Trove${amount > 1 ? 's' : ''}`;
    if (key === 'consumable:40232') return `+${amount} Relic Casket${amount > 1 ? 's' : ''}`;
    if (key === 'consumable:40229') return `+${amount} Large Heroes Trove${amount > 1 ? 's' : ''}`;
    if (key === 'consumable:40231') return `+${amount} Large Titans Trove${amount > 1 ? 's' : ''}`;
    if (key === 'material:12') return `+${amount} Honor Marks`;
    if (key === 'coin:40077') return `+${amount.toLocaleString()} Rune Stone`;
    if (key === 'speedUpResearch:2') return `+${amount}x 5m Research Speedup`;
    return `+${amount} ${key}`;
  }

  // --- SECTION 1: MATCHUP BANNER ---
  const matchupSec = document.createElement('div');
  matchupSec.className = 'rounded-xl border border-slate-200 bg-slate-50/80 p-4';
  const clanRoundPoints = battle.clanRoundPoints ?? 10145150;
  const enemyRoundPoints = battle.enemyClanRoundPoints ?? 657950;
  const totalPoints = clanRoundPoints + enemyRoundPoints || 1;
  const clanPct = Math.round((clanRoundPoints / totalPoints) * 100);
  const enemyPct = 100 - clanPct;
  const battleNumber = info.battleNumber ?? 4;
  const roundNumber = info.roundNumber ?? 1;

  matchupSec.innerHTML = `
    <div class="flex items-center justify-between text-xs text-slate-500 mb-3">
      <span>Battle #${battleNumber} • Round ${roundNumber} of 6</span>
      <span class="font-semibold text-emerald-700">Theme: Radar Training</span>
    </div>
    <div class="grid grid-cols-5 items-center gap-2 mb-3">
      <div class="col-span-2 min-w-0">
        <div class="font-bold text-slate-900 text-sm sm:text-base truncate">${clan.name}</div>
        <div class="text-xs text-slate-500">Server ${clan.server || '—'}</div>
        <div class="text-emerald-700 font-black text-base sm:text-lg tabular-nums mt-0.5">${clanRoundPoints.toLocaleString()}</div>
        <div class="text-[11px] text-slate-500">Score: <strong class="text-slate-800">${battle.clanBattleScore ?? 0}</strong></div>
      </div>
      <div class="col-span-1 text-center">
        <span class="inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black text-slate-700">VS</span>
      </div>
      <div class="col-span-2 min-w-0 text-right">
        <div class="font-bold text-slate-900 text-sm sm:text-base truncate">${enemyClan.name}</div>
        <div class="text-xs text-slate-500">Server ${enemyClan.server || '—'}</div>
        <div class="text-rose-700 font-black text-base sm:text-lg tabular-nums mt-0.5">${enemyRoundPoints.toLocaleString()}</div>
        <div class="text-[11px] text-slate-500">Score: <strong class="text-slate-800">${battle.enemyClanBattleScore ?? 0}</strong></div>
      </div>
    </div>
    <div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden flex">
      <div class="bg-emerald-500 h-2.5" style="width: ${clanPct}%"></div>
      <div class="bg-rose-500 h-2.5" style="width: ${enemyPct}%"></div>
    </div>
    <div class="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
      <span>${clanPct}%</span>
      <span>${enemyPct}%</span>
    </div>
  `;
  body.append(matchupSec);

  // --- SECTION 2: PERSONAL POINTS & STANDINGS ---
  const personalSec = document.createElement('div');
  personalSec.className = 'grid grid-cols-2 sm:grid-cols-4 gap-2.5';
  const pScore = vsStatus?.score ?? rewards.userRoundPoints ?? 0;
  const bScore = rewards.userBattlePoints ?? pScore;
  const sScore = rewards.userSeasonPoints ?? 0;
  const cRank = rewards.userClanRank ? `#${rewards.userClanRank}` : '—';
  const sRank = rewards.seasonClanRank ? `#${rewards.seasonClanRank}` : '—';

  const stats = [
    { label: 'Round Points', val: pScore.toLocaleString(), sub: 'Current round' },
    { label: 'Battle Points', val: bScore.toLocaleString(), sub: 'This battle' },
    { label: 'Season Points', val: resourceData.formatAmount(sScore), sub: `Season Rank ${sRank}` },
    { label: 'Clan Rank', val: cRank, sub: 'Among guild members' }
  ];
  for (const s of stats) {
    const tile = document.createElement('div');
    tile.className = 'rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs';
    tile.innerHTML = `
      <div class="text-[11px] font-medium text-slate-500">${s.label}</div>
      <div class="text-base font-bold text-slate-900 tabular-nums my-0.5">${s.val}</div>
      <div class="text-[10px] text-slate-400">${s.sub}</div>
    `;
    personalSec.append(tile);
  }
  body.append(personalSec);

  // --- SECTION 3: MILESTONE CHESTS (1 - 9) ---
  const thresholds = globalThis.hwaHelperClanVersusChestThresholds || {
    1: 25000, 2: 100000, 3: 400000, 4: 600000, 5: 1000000, 6: 1500000, 7: 2000000, 8: 3000000, 9: 4500000
  };
  const rewardMap = globalThis.hwaHelperClanVersusRewards || {};
  const claimedSet = new Set(vsStatus?.chestNumbers || []);

  let targetChestNum = 1;
  for (let c = 1; c <= 9; c++) {
    if (!claimedSet.has(c)) {
      targetChestNum = c;
      break;
    }
  }
  if (claimedSet.size === 9) targetChestNum = 9;
  const targetThreshold = thresholds[targetChestNum] || 0;
  const targetPct = targetThreshold > 0 ? Math.min(100, Math.round((pScore / targetThreshold) * 100)) : 100;

  const chestsSec = document.createElement('div');
  chestsSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs';

  let isStackMode = true;
  let activeChestNum = targetChestNum;

  const headerDiv = document.createElement('div');
  headerDiv.className = 'flex items-center justify-between flex-wrap gap-2';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'flex items-center gap-2';
  titleWrap.innerHTML = `
    <h3 class="text-sm font-bold text-slate-900">🎁 Milestone Chests</h3>
    <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">${claimedSet.size} / 9 Claimed</span>
  `;

  const viewToggleWrap = document.createElement('div');
  viewToggleWrap.className = 'inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-medium select-none';

  const deckModeBtn = document.createElement('button');
  deckModeBtn.type = 'button';
  deckModeBtn.className = 'deck-mode-btn px-2.5 py-0.5 rounded-md font-bold transition-colors bg-white text-slate-900 shadow-2xs cursor-pointer';
  deckModeBtn.textContent = '🎴 Stacked Deck';

  const gridModeBtn = document.createElement('button');
  gridModeBtn.type = 'button';
  gridModeBtn.className = 'grid-mode-btn px-2.5 py-0.5 rounded-md font-medium transition-colors text-slate-600 hover:text-slate-900 cursor-pointer';
  gridModeBtn.textContent = '🃏 Grid View';

  viewToggleWrap.append(deckModeBtn, gridModeBtn);
  headerDiv.append(titleWrap, viewToggleWrap);
  chestsSec.append(headerDiv);

  // Target summary progress banner
  const progBox = document.createElement('div');
  progBox.className = 'rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5 border border-slate-100';
  progBox.innerHTML = `
    <div class="flex justify-between font-medium text-slate-700">
      <span>Target: <strong class="text-amber-800">Chest ${targetChestNum}</strong> (${targetThreshold.toLocaleString()} pts)</span>
      <span class="font-bold text-slate-900">${targetPct}% (${pScore.toLocaleString()} / ${targetThreshold.toLocaleString()})</span>
    </div>
    <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
      <div class="bg-amber-500 h-2 rounded-full transition-all duration-300" style="width: ${targetPct}%"></div>
    </div>
  `;
  chestsSec.append(progBox);

  // Selector ribbon for quick jumping to any card (1-9)
  const ribbonWrap = document.createElement('div');
  ribbonWrap.className = 'flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin';
  const ribbonBtns = new Map();

  for (let c = 1; c <= 9; c++) {
    const isClaimed = claimedSet.has(c);
    const isReady = !isClaimed && pScore >= (thresholds[c] || 0);
    const isTarget = c === targetChestNum;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
      isTarget ? 'ring-2 ring-amber-400 font-bold' : ''
    }`;
    btn.innerHTML = `
      <span class="font-mono">№ ${c}</span>
      <span class="text-[10px]">${isClaimed ? '✓' : isReady ? '★' : isTarget ? '🎯' : '🔒'}</span>
    `;
    btn.title = `Chest ${c} (${(thresholds[c] || 0).toLocaleString()} pts)${isTarget ? ' - Target' : ''}`;
    btn.addEventListener('click', () => {
      setActiveChest(c);
    });
    ribbonBtns.set(c, btn);
    ribbonWrap.append(btn);
  }
  chestsSec.append(ribbonWrap);

  // Deck container & cards wrapper
  const deckContainer = document.createElement('div');
  deckContainer.className = 'chest-deck-container relative pt-1 pb-3 flex flex-col justify-center';

  // 3D Deck Stack underlay layers
  const layer2 = document.createElement('div');
  layer2.className = 'chest-deck-layer-2 absolute inset-x-4 top-3 bottom-1 rounded-2xl bg-slate-200/70 border border-slate-300 shadow-2xs -z-20 pointer-events-none';
  const layer1 = document.createElement('div');
  layer1.className = 'chest-deck-layer-1 absolute inset-x-2 top-2 bottom-2 rounded-2xl bg-slate-100/80 border border-slate-300 shadow-xs -z-10 pointer-events-none';
  deckContainer.append(layer2, layer1);

  const cardsMap = new Map();
  for (let c = 1; c <= 9; c++) {
    const pts = thresholds[c] || 0;
    const isClaimed = claimedSet.has(c);
    const isReady = !isClaimed && pScore >= pts;
    const isTarget = c === targetChestNum;
    const cardPct = pts > 0 ? Math.min(100, Math.round((pScore / pts) * 100)) : 100;

    const chestCard = document.createElement('div');
    chestCard.className = `chest-playing-card rounded-2xl border-2 p-3.5 flex flex-col justify-between text-xs transition-all relative ${
      isClaimed
        ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-100/50 shadow-sm'
        : isReady
          ? 'border-amber-400 bg-gradient-to-br from-amber-50/80 via-white to-amber-100/60 shadow-md resource-capped-amber'
          : isTarget
            ? 'border-indigo-400 bg-gradient-to-br from-indigo-50/60 via-white to-amber-50/40 shadow-md ring-2 ring-indigo-200'
            : 'border-slate-200 bg-gradient-to-br from-slate-50/70 via-white to-slate-100/60 text-slate-700 shadow-2xs'
    }`;

    // Card Top / Header (Rank + Suit + Status Badge)
    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-center justify-between mb-2';
    cardHeader.innerHTML = `
      <div class="flex items-center gap-1.5">
        <span class="font-mono font-black text-xs px-2 py-0.5 rounded bg-black/5 border border-black/10">№ ${c}</span>
        <span class="text-sm">🎁</span>
        <span class="font-bold text-slate-900 text-sm">Chest ${c}</span>
      </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
        isClaimed
          ? 'bg-emerald-600 text-white'
          : isReady
            ? 'bg-amber-500 text-white animate-pulse'
            : isTarget
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-200 text-slate-600'
      }">${isClaimed ? '✓ Claimed' : isReady ? '★ Ready to Claim' : isTarget ? '🎯 Target Chest' : '🔒 Locked'}</span>
    `;

    // Milestone Requirement Row
    const reqRow = document.createElement('div');
    reqRow.className = 'flex items-baseline justify-between py-1 border-b border-slate-200/60';
    reqRow.innerHTML = `
      <span class="text-[11px] text-slate-500 font-medium">Milestone Requirement</span>
      <span class="tabular-nums font-extrabold text-sm ${isClaimed ? 'text-emerald-700' : isReady ? 'text-amber-800' : isTarget ? 'text-indigo-900' : 'text-slate-700'}">${pts.toLocaleString()} pts</span>
    `;

    // Progress bar for active / target card
    const cardProg = document.createElement('div');
    cardProg.className = 'mt-2 space-y-1';
    cardProg.innerHTML = `
      <div class="flex justify-between text-[11px] text-slate-600 font-medium">
        <span>Progress</span>
        <span class="tabular-nums font-bold ${isReady || isClaimed ? 'text-emerald-700' : 'text-slate-800'}">${cardPct}% (${pScore.toLocaleString()} / ${pts.toLocaleString()})</span>
      </div>
      <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
        <div class="h-1.5 rounded-full transition-all duration-300 ${isClaimed ? 'bg-emerald-500' : isReady ? 'bg-amber-500' : 'bg-indigo-500'}" style="width: ${cardPct}%"></div>
      </div>
    `;

    // Rewards List
    const rewardList = document.createElement('div');
    rewardList.className = 'space-y-1.5 text-[11px] text-slate-700 mt-2.5 pt-2 border-t border-slate-200/60';
    const rItems = rewardMap[c];
    if (rItems) {
      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-1.5';
      for (const [rKey, rAmt] of Object.entries(rItems)) {
        const itemRow = document.createElement('div');
        itemRow.className = 'flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 border border-slate-200/70 shadow-2xs font-medium truncate';
        itemRow.textContent = formatRewardItem(rKey, rAmt);
        itemsGrid.append(itemRow);
      }
      rewardList.append(itemsGrid);
    } else {
      rewardList.innerHTML = '<span class="text-slate-400 italic">Bonus milestone reward</span>';
    }

    // Stack navigation footer (visible in Stack mode)
    const cardNav = document.createElement('div');
    cardNav.className = 'card-stack-nav flex items-center justify-between pt-2.5 mt-3 border-t border-slate-200/60 text-xs';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'card-prev-btn px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
    prevBtn.textContent = '‹ Prev';

    const cardCounter = document.createElement('span');
    cardCounter.className = 'text-slate-500 font-medium';
    cardCounter.innerHTML = `Chest ${c} of 9 ${isTarget ? '<strong class="text-amber-600 ml-1">(Target)</strong>' : ''}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'card-next-btn px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
    nextBtn.textContent = 'Next ›';

    if (c === 1) prevBtn.disabled = true;
    if (c === 9) nextBtn.disabled = true;
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation?.();
      if (c > 1) setActiveChest(c - 1);
    });
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation?.();
      if (c < 9) setActiveChest(c + 1);
    });

    cardNav.append(prevBtn, cardCounter, nextBtn);
    chestCard._cardNav = cardNav;

    chestCard.append(cardHeader, reqRow, cardProg, rewardList, cardNav);
    cardsMap.set(c, chestCard);
    deckContainer.append(chestCard);
  }
  chestsSec.append(deckContainer);

  function setActiveChest(num) {
    activeChestNum = num;
    updateDeckView();
  }

  function updateDeckView() {
    // Update selector ribbon button styles
    for (let c = 1; c <= 9; c++) {
      const btn = ribbonBtns.get(c);
      const isClaimed = claimedSet.has(c);
      const isReady = !isClaimed && pScore >= (thresholds[c] || 0);
      const isTarget = c === targetChestNum;
      const isActive = c === activeChestNum;

      if (isActive && isStackMode) {
        btn.className = `px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer bg-slate-900 text-white border-slate-900 shadow-xs ${
          isTarget ? 'ring-2 ring-amber-400' : ''
        }`;
      } else {
        btn.className = `px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
          isClaimed
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            : isReady
              ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
              : isTarget
                ? 'bg-indigo-50 text-indigo-900 border-indigo-300 ring-2 ring-amber-400 font-bold hover:bg-indigo-100'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
        }`;
      }
    }

    if (isStackMode) {
      deckContainer.className = 'chest-deck-container relative pt-1 pb-3 flex flex-col justify-center';
      layer1.hidden = false;
      layer2.hidden = false;
      for (let c = 1; c <= 9; c++) {
        const card = cardsMap.get(c);
        if (card._cardNav) card._cardNav.hidden = false;
        if (c === activeChestNum) {
          card.hidden = false;
          card.classList.add('z-20', 'shadow-xl');
        } else {
          card.hidden = true;
          card.classList.remove('z-20', 'shadow-xl');
        }
      }
    } else {
      deckContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5';
      layer1.hidden = true;
      layer2.hidden = true;
      for (let c = 1; c <= 9; c++) {
        const card = cardsMap.get(c);
        card.hidden = false;
        if (card._cardNav) card._cardNav.hidden = true;
      }
    }
  }

  deckModeBtn.addEventListener('click', () => {
    isStackMode = true;
    deckModeBtn.className = 'deck-mode-btn px-2.5 py-0.5 rounded-md font-bold transition-colors bg-white text-slate-900 shadow-2xs cursor-pointer';
    gridModeBtn.className = 'grid-mode-btn px-2.5 py-0.5 rounded-md font-medium transition-colors text-slate-600 hover:text-slate-900 cursor-pointer';
    updateDeckView();
  });
  gridModeBtn.addEventListener('click', () => {
    isStackMode = false;
    gridModeBtn.className = 'grid-mode-btn px-2.5 py-0.5 rounded-md font-bold transition-colors bg-white text-slate-900 shadow-2xs cursor-pointer';
    deckModeBtn.className = 'deck-mode-btn px-2.5 py-0.5 rounded-md font-medium transition-colors text-slate-600 hover:text-slate-900 cursor-pointer';
    updateDeckView();
  });

  updateDeckView();
  body.append(chestsSec);

  // --- SECTION 4: 6-ROUND SCHEDULE & QUESTS ---
  const roundsSec = document.createElement('div');
  roundsSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs';
  roundsSec.innerHTML = `
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-bold text-slate-900">🗓️ 6-Round Battle Schedule & Quests</h3>
      <span class="text-xs text-slate-500">Click round to view point-earning quests</span>
    </div>
  `;

  const roundQuestsMap = globalThis.hwaHelperClanVersusRoundQuests || {};
  const roundsList = battle.rounds || [
    { index: 1, theme: 'Radar Training & Titan Power', score: 1, points: clanRoundPoints, enemyPoints: enemyRoundPoints, status: 'inProgress' },
    { index: 2, theme: 'City Development & Gathering', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 3, theme: 'Research & Wilderness', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 4, theme: 'Hero Advancement & Equipment', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 5, theme: 'Military Training & Outland', score: 2, points: 0, enemyPoints: 0, status: 'soon' },
    { index: 6, theme: 'Grand Finale & PvP Clash', score: 4, points: 0, enemyPoints: 0, status: 'soon' }
  ];

  const roundGrid = document.createElement('div');
  roundGrid.className = 'space-y-2';
  for (const r of roundsList) {
    const isLive = r.status === 'inProgress';
    const isDone = r.status === 'finished';
    const roundConfig = roundQuestsMap[r.index] || {};
    const themeName = roundConfig.theme || r.theme || ('Round ' + r.index);
    const quests = roundConfig.quests || [];

    const rCard = document.createElement('details');
    rCard.className = `group rounded-lg border text-xs overflow-hidden transition-colors ${
      isLive ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/50'
    }`;
    if (isLive) rCard.open = true;

    const summary = document.createElement('summary');
    summary.className = 'flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-100/60 list-none';

    summary.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="size-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
          isLive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
        }">${r.index}</span>
        <div class="min-w-0">
          <div class="font-bold text-slate-900 truncate">${themeName}</div>
          <div class="text-[10px] text-slate-500">Reward: ${r.score || roundConfig.battlePoints || 1} Battle Point${(r.score || roundConfig.battlePoints || 1) > 1 ? 's' : ''} • ${quests.length} Quests</div>
        </div>
      </div>
      <div class="text-right shrink-0 ml-2">
        ${
          isLive
            ? `<div class="font-black text-emerald-800 tabular-nums">${resourceData.formatAmount(r.points || 0)} vs ${resourceData.formatAmount(r.enemyPoints || 0)}</div>
               <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><span class="size-1.5 rounded-full bg-emerald-500 animate-ping"></span>In Progress</span>`
            : isDone
              ? `<div class="font-bold text-slate-700">${resourceData.formatAmount(r.points || 0)} vs ${resourceData.formatAmount(r.enemyPoints || 0)}</div>
                 <span class="text-[10px] font-semibold text-slate-500">Finished</span>`
              : '<span class="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">Upcoming</span>'
        }
      </div>
    `;

    const questBody = document.createElement('div');
    questBody.className = 'p-3 border-t border-slate-200/80 bg-white/70 space-y-2';
    questBody.innerHTML = `
      <div class="flex items-center justify-between text-[11px] font-bold text-slate-700">
        <span>🎯 Quests to Earn Points:</span>
        <span class="text-[10px] text-slate-400 font-normal">Day ${r.index}</span>
      </div>
    `;

    const qList = document.createElement('div');
    qList.className = 'grid grid-cols-1 sm:grid-cols-2 gap-1.5';
    for (const q of quests) {
      const stock = globalThis.hwaHelperPopupData?.getChallengeResourceStock?.(activeCache, q.label) ?? null;
      const cleanLabel = q.label.replace(/\s*\(\d+[\d,]*\)$/, '');
      const displayLabel = stock != null ? `${cleanLabel} (${stock.toLocaleString()})` : cleanLabel;
      const qItem = document.createElement('div');
      qItem.className = 'flex items-center justify-between rounded bg-white border border-slate-200/80 px-2 py-1 text-[11px]';
      qItem.innerHTML = `
        <span class="text-slate-800 font-medium truncate mr-1.5" title="${displayLabel}">${displayLabel}</span>
        <span class="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.2 font-bold tabular-nums shrink-0 border border-emerald-100">+${q.points.toLocaleString()} pts</span>
      `;
      qList.append(qItem);
    }
    questBody.append(qList);

    rCard.append(summary, questBody);
    roundGrid.append(rCard);
  }
  roundsSec.append(roundGrid);
  body.append(roundsSec);

  // --- SECTION 5: GUILD REQUIREMENTS ---
  const reqSec = document.createElement('div');
  reqSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs';
  const curUsers = info.currentNumActiveUsers ?? 28;
  const minUsers = info.numActiveUsers ?? 5;
  const weeklyAct = info.weeklyUserActivity ?? 2450;
  const personalSat = info.personalRequirementsIsSatisfied ?? true;
  const guildSat = info.guildRequirementsIsSatisfied ?? true;

  reqSec.innerHTML = `
    <h3 class="text-sm font-bold text-slate-900">👥 Guild Participation & Requirements</h3>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
        <div class="text-slate-500 text-[11px]">Active Members</div>
        <div class="font-bold text-slate-900 text-sm mt-0.5">${curUsers} / ${minUsers} req</div>
        <span class="text-[10px] font-semibold text-emerald-600">✓ Satisfied</span>
      </div>
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
        <div class="text-slate-500 text-[11px]">Weekly Activity</div>
        <div class="font-bold text-slate-900 text-sm mt-0.5">${weeklyAct.toLocaleString()}</div>
        <span class="text-[10px] text-slate-400">Total guild score</span>
      </div>
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
        <div class="text-slate-500 text-[11px]">Personal Status</div>
        <div class="font-bold text-sm mt-0.5 ${personalSat ? 'text-emerald-700' : 'text-amber-700'}">${personalSat ? 'Eligible' : 'Pending'}</div>
        <span class="text-[10px] font-semibold text-emerald-600">${personalSat ? '✓ Qualified' : 'Action needed'}</span>
      </div>
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
        <div class="text-slate-500 text-[11px]">Guild Status</div>
        <div class="font-bold text-sm mt-0.5 ${guildSat ? 'text-emerald-700' : 'text-amber-700'}">${guildSat ? 'Eligible' : 'Pending'}</div>
        <span class="text-[10px] font-semibold text-emerald-600">${guildSat ? '✓ Qualified' : 'Action needed'}</span>
      </div>
    </div>
  `;
  body.append(reqSec);

  // --- SECTION 6: DAILY CHALLENGES ---
  const challenges = Array.isArray(info.challenges) ? info.challenges : [];
  if (challenges.length > 0) {
    const chSec = document.createElement('div');
    chSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs';

    const challengeNames = globalThis.hwaHelperClanVersusChallengeNames || {};
    const challengePoints = globalThis.hwaHelperClanVersusChallengePoints || {};
    const challengeSteps = globalThis.hwaHelperClanVersusChallengeSteps || {};

    let totalChallengePts = 0;
    for (const ch of challenges) {
      const progress = Number(ch.progress || 0);
      const step = Number(challengeSteps[ch.id] || 1);
      const ptsPerStep = Number(challengePoints[ch.id] || 0);
      totalChallengePts += Math.floor(progress / step) * ptsPerStep;
    }

    chSec.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-1">
        <h3 class="text-sm font-bold text-slate-900">🎯 Daily Challenges (${challenges.length})</h3>
        <span class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-200">Total: ${totalChallengePts.toLocaleString()} pts</span>
      </div>
    `;

    const chGrid = document.createElement('div');
    chGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';

    for (const ch of challenges) {
      const name = challengeNames[ch.id] || `Daily Challenge #${ch.id}`;
      const stock = globalThis.hwaHelperPopupData?.getChallengeResourceStock?.(activeCache, ch.id) ?? null;
      const cleanName = name.replace(/\s*\(\d+[\d,]*\)$/, '');
      const displayName = stock != null ? `${cleanName} (${stock.toLocaleString()})` : cleanName;
      const progress = Number(ch.progress || 0);
      const step = Number(challengeSteps[ch.id] || 1);
      const ptsPerStep = Number(challengePoints[ch.id] || 0);
      const convertedPts = Math.floor(progress / step) * ptsPerStep;

      const item = document.createElement('div');
      item.className = 'flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs';
      item.innerHTML = `
        <span class="font-medium text-slate-800 truncate mr-2" title="${displayName}">${displayName}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="rounded bg-white px-2 py-0.5 font-bold text-slate-900 border border-slate-200 tabular-nums">${progress.toLocaleString()}</span>
          <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            convertedPts > 0
              ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
              : 'bg-slate-100 text-slate-500 border border-slate-200'
          }" title="${ptsPerStep > 0 ? `${ptsPerStep.toLocaleString()} pts per ${step === 1 ? 'completion' : `${step} units`}` : ''}">${convertedPts.toLocaleString()} pts</span>
        </div>
      `;
      chGrid.append(item);
    }
    chSec.append(chGrid);
    body.append(chSec);
  }

  modal.hidden = false;
}

function openDungeonModal(dungeonStatus) {
  const modal = document.querySelector('#dungeon-modal');
  const body = document.querySelector('#dungeon-modal-body');
  if (!modal || !body) return;

  const data = dungeonStatus || {};
  const floorNumber = data.floorNumber || (data.maxFloorPassed ? data.maxFloorPassed + 1 : 1);
  const floorBadge = document.querySelector('#dungeon-floor-badge');
  if (floorBadge) floorBadge.textContent = `Floor ${floorNumber}`;

  body.replaceChildren();

  // --- SECTION 1: OVERVIEW STATS ---
  const overviewSec = document.createElement('div');
  overviewSec.className = 'grid grid-cols-2 sm:grid-cols-4 gap-2.5';
  const stats = [
    { label: 'Current Floor', val: `Floor ${floorNumber}`, sub: 'In progress' },
    { label: 'Cleared Floors', val: String(data.maxFloorPassed ?? 0), sub: 'Total passed' },
    { label: 'Checkpoint', val: `Floor ${data.respawnFloor || 0}`, sub: 'Respawn point' },
    { label: 'Guild Activity', val: `${(data.dungeonActivity ?? 0).toLocaleString()} pts`, sub: 'Dungeon score' }
  ];
  for (const s of stats) {
    const tile = document.createElement('div');
    tile.className = 'rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs';
    tile.innerHTML = `
      <div class="text-[11px] font-medium text-slate-500">${s.label}</div>
      <div class="text-base font-bold text-slate-900 tabular-nums my-0.5">${s.val}</div>
      <div class="text-[10px] text-slate-400">${s.sub}</div>
    `;
    overviewSec.append(tile);
  }
  body.append(overviewSec);

  // --- SECTION 2: ELEMENT AFFINITIES ---
  const elements = data.elements || {};
  const prime = elements.prime ? elements.prime.charAt(0).toUpperCase() + elements.prime.slice(1) : 'None';
  const nonprime = Array.isArray(elements.nonprime)
    ? elements.nonprime.map((e) => e.charAt(0).toUpperCase() + e.slice(1)).join(', ')
    : 'None';

  const elemSec = document.createElement('div');
  elemSec.className = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4';
  elemSec.innerHTML = `
    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">Element Affinities</h3>
    <div class="flex items-center gap-4 flex-wrap text-sm">
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-slate-500">Prime Element:</span>
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">🌟 ${prime}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-slate-500">Non-Prime Elements:</span>
        <span class="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">${nonprime}</span>
      </div>
    </div>
  `;
  body.append(elemSec);

  // --- SECTION 3: CURRENT FLOOR DOORS ---
  const doors = Array.isArray(data.currentFloorDoors) ? data.currentFloorDoors : [];
  if (doors.length > 0) {
    const doorsSec = document.createElement('div');
    doorsSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs';
    doorsSec.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900">🚪 Floor ${floorNumber} Doors</h3>
        <span class="text-xs text-slate-500">${doors.length} battle choices</span>
      </div>
    `;

    const doorsGrid = document.createElement('div');
    doorsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3';

    doors.forEach((door, idx) => {
      const doorCard = document.createElement('div');
      doorCard.className = 'rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5';

      const attackerType = door.attackerType ? door.attackerType.charAt(0).toUpperCase() + door.attackerType.slice(1) : 'Any';
      const defenderType = door.defenderType ? door.defenderType.charAt(0).toUpperCase() + door.defenderType.slice(1) : 'Unknown';
      const powerStr = door.power ? Number(door.power).toLocaleString() : '—';

      doorCard.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">Door ${idx + 1}</span>
          <span class="text-xs font-bold text-slate-700">⚔️ Power: ${powerStr}</span>
        </div>
        <div class="flex items-center justify-between text-xs text-slate-600">
          <div>Attacker: <strong class="text-slate-900">${attackerType} Titans</strong></div>
          <div>Defender: <strong class="text-slate-900">${defenderType}</strong></div>
        </div>
      `;

      if (Array.isArray(door.team) && door.team.length > 0) {
        const teamBox = document.createElement('div');
        teamBox.className = 'flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200';
        for (const unit of door.team) {
          const titanId = String(unit.id);
          const meta = globalThis.hwaHelperTitanMetadata?.[titanId];
          const name = meta?.name || `Titan ${titanId}`;
          const starStr = unit.star ? '★'.repeat(unit.star) : '';
          const unitTag = document.createElement('span');
          unitTag.className = 'inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 shadow-2xs';
          const avatarImg = `<img src="assets/titans/${titanId}.png" class="size-4 rounded-full object-cover shrink-0 border border-slate-200" onerror="this.style.display='none'">`;
          unitTag.innerHTML = `${avatarImg}<span>${name}</span> <span class="text-slate-400 font-normal">(Lv.${unit.level || '?'}${starStr ? ` ${starStr}` : ''})</span>`;
          teamBox.append(unitTag);
        }
        doorCard.append(teamBox);
      }

      doorsGrid.append(doorCard);
    });

    doorsSec.append(doorsGrid);
    body.append(doorsSec);
  } else {
    const emptyDoors = document.createElement('div');
    emptyDoors.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400';
    emptyDoors.textContent = 'Floor doors will update when a new dungeon floor is unlocked in game.';
    body.append(emptyDoors);
  }

  // --- SECTION 4: TITANS HEALTH & ENERGY STATUS ---
  const titansState = data.states?.titans || {};
  const titanEntries = Object.entries(titansState);
  if (titanEntries.length > 0) {
    const titansSec = document.createElement('div');
    titansSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs';
    titansSec.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900">🛡️ Titan Health & Energy</h3>
        <span class="text-xs text-slate-500">${titanEntries.length} deployed titans</span>
      </div>
    `;

    const titansList = document.createElement('div');
    titansList.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5';

    for (const [tId, state] of titanEntries) {
      const meta = globalThis.hwaHelperTitanMetadata?.[tId];
      const name = meta?.name || `Titan ${tId}`;
      const elem = meta?.element || '';
      const isDead = state.isDead === true || (state.hp <= 0);
      const maxHp = state.maxHp || 1;
      const hp = Math.max(0, state.hp || 0);
      const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));
      const energy = Math.max(0, state.energy || 0);
      const energyPct = Math.min(100, Math.round((energy / 1000) * 100));

      const row = document.createElement('div');
      row.className = `rounded-xl border p-3 ${isDead ? 'border-rose-200 bg-rose-50/40 opacity-70' : 'border-slate-200 bg-slate-50/50'}`;

      const avatarImg = `<img src="assets/titans/${tId}.png" class="size-8 rounded-full object-cover shrink-0 border border-slate-200" onerror="this.style.display='none'">`;
      row.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2 min-w-0">
            ${avatarImg}
            <div class="min-w-0">
              <div class="font-bold text-xs sm:text-sm text-slate-900 truncate">${name}</div>
              ${elem ? `<span class="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">${elem}</span>` : ''}
            </div>
          </div>
          <span class="rounded-full px-2 py-0.5 text-[10px] font-bold ${isDead ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}">
            ${isDead ? 'Fallen' : 'Alive'}
          </span>
        </div>
        <div class="space-y-1.5">
          <div>
            <div class="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>HP</span>
              <span class="tabular-nums font-semibold">${hp.toLocaleString()} / ${maxHp.toLocaleString()} (${hpPct}%)</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div class="${isDead ? 'bg-rose-500' : 'bg-emerald-500'} h-1.5 rounded-full" style="width: ${hpPct}%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>Energy</span>
              <span class="tabular-nums font-semibold">${energy.toLocaleString()} / 1,000 (${energyPct}%)</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div class="bg-amber-400 h-1.5 rounded-full" style="width: ${energyPct}%"></div>
            </div>
          </div>
        </div>
      `;

      titansList.append(row);
    }

    titansSec.append(titansList);
    body.append(titansSec);
  } else {
    const emptyTitans = document.createElement('div');
    emptyTitans.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400';
    emptyTitans.textContent = 'Deployed titan health and energy will update during dungeon battles.';
    body.append(emptyTitans);
  }

  modal.hidden = false;
}

function renderEvents(cache) {
  const query = search.value.trim().toLowerCase();
  const eventCards = [];

  // 1. Guild Versus (clanVersus)
  const vsStatus = cache.clanVersusStatus?.data;
  if (vsStatus && (vsStatus.battle || vsStatus.info || vsStatus.rewards || vsStatus.chestNumbers || vsStatus.score)) {
    const battle = vsStatus.battle || {};
    const info = vsStatus.info || {};
    const rewards = vsStatus.rewards || {};
    const clanName = battle.clan?.name || 'Our Guild';
    const enemyClanName = battle.enemyClan?.name || 'Opponent Guild';
    const clanServer = battle.clan?.server ? `S${battle.clan.server}` : '';
    const enemyServer = battle.enemyClan?.server ? `S${battle.enemyClan.server}` : '';
    const league = battle.league || (info.league ? `League #${info.league}` : 'Bronze');
    const leagueLabel = league.charAt(0).toUpperCase() + league.slice(1);
    const roundNumber = info.roundNumber || 1;
    const currentRound = (battle.rounds || []).find((r) => r.status === 'inProgress') || battle.rounds?.[0] || {};
    const theme = currentRound.theme || 'Radar Training';
    const roundPoints = resourceData.formatAmount(battle.clanRoundPoints ?? currentRound.points ?? 0);
    const enemyRoundPoints = resourceData.formatAmount(battle.enemyClanRoundPoints ?? currentRound.enemyPoints ?? 0);
    const personalScore = vsStatus.score ?? rewards.userRoundPoints ?? 0;
    const claimedCount = (vsStatus.chestNumbers || []).length;

    eventCards.push({
      id: 'clanVersus',
      type: 'guild_versus',
      title: '⚔️ Guild Versus',
      searchStr: `guild versus gvs ${clanName} ${enemyClanName} ${theme} ${league}`.toLowerCase(),
      featured: true,
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-emerald-300 bg-emerald-50/50 p-4 shadow-sm hover:border-emerald-400 transition-colors cursor-pointer';
        card.addEventListener('click', () => openGuildVersusModal(vsStatus, cache));

        const topRow = document.createElement('div');
        topRow.className = 'flex items-center justify-between gap-2 flex-wrap mb-2.5';
        topRow.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="font-bold text-slate-900 text-sm">Guild Versus</span>
            <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">${leagueLabel} League</span>
          </div>
          <span class="text-xs font-semibold text-emerald-800">Round ${roundNumber} of 6 • ${theme}</span>
        `;

        const matchupBox = document.createElement('div');
        matchupBox.className = 'flex items-center justify-between rounded-lg bg-white border border-emerald-100 p-3 text-xs mb-2.5';
        matchupBox.innerHTML = `
          <div class="min-w-0">
            <div class="font-bold text-slate-900 truncate">${clanName} <span class="text-slate-400 font-normal">${clanServer}</span></div>
            <div class="text-emerald-700 font-bold text-sm">${roundPoints} <span class="text-[10px] font-normal text-slate-500">pts</span></div>
          </div>
          <div class="shrink-0 px-2 text-center">
            <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">VS</span>
            <div class="text-[10px] text-slate-400 mt-0.5">${battle.clanBattleScore ?? 0} : ${battle.enemyClanBattleScore ?? 0}</div>
          </div>
          <div class="min-w-0 text-right">
            <div class="font-bold text-slate-900 truncate">${enemyClanName} <span class="text-slate-400 font-normal">${enemyServer}</span></div>
            <div class="text-rose-700 font-bold text-sm">${enemyRoundPoints} <span class="text-[10px] font-normal text-slate-500">pts</span></div>
          </div>
        `;

        const footerRow = document.createElement('div');
        footerRow.className = 'flex items-center justify-between gap-2 flex-wrap text-xs text-slate-600';
        footerRow.innerHTML = `
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium">Personal: <strong class="text-slate-900">${resourceData.formatAmount(personalScore)}</strong> pts</span>
            <span class="text-slate-300">•</span>
            <span class="font-medium">Chests: <strong class="text-slate-900">${claimedCount}/9</strong> claimed</span>
          </div>
          <button type="button" class="cursor-pointer font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1">
            View Details <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        `;

        card.append(topRow, matchupBox, footerRow);
        return card;
      }
    });
  }

  // 1.5 Titan Dungeon
  const dungeonStatus = cache.dungeonStatus?.data;
  if (dungeonStatus && (dungeonStatus.floorNumber || dungeonStatus.maxFloorPassed)) {
    const floor = dungeonStatus.floorNumber || (dungeonStatus.maxFloorPassed + 1);
    const activity = dungeonStatus.dungeonActivity ?? 0;
    const prime = dungeonStatus.elements?.prime ? dungeonStatus.elements.prime.charAt(0).toUpperCase() + dungeonStatus.elements.prime.slice(1) : 'Earth';
    const respawn = dungeonStatus.respawnFloor || 0;

    eventCards.push({
      id: 'titanDungeon',
      type: 'dungeon',
      title: '🏰 Titan Dungeon',
      searchStr: `titan dungeon floor ${floor} checkpoint ${respawn} ${prime}`.toLowerCase(),
      featured: true,
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-blue-300 bg-blue-50/50 p-4 shadow-sm hover:border-blue-400 transition-colors cursor-pointer';
        card.addEventListener('click', () => openDungeonModal(dungeonStatus));

        const topRow = document.createElement('div');
        topRow.className = 'flex items-center justify-between gap-2 flex-wrap mb-2.5';
        topRow.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span class="font-bold text-slate-900 text-sm">Titan Dungeon</span>
            <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">Floor ${floor}</span>
          </div>
          <span class="text-xs font-semibold text-blue-800">Prime Element: ${prime}</span>
        `;

        const detailsBox = document.createElement('div');
        detailsBox.className = 'flex items-center justify-between rounded-lg bg-white border border-blue-100 p-3 text-xs mb-2.5';
        detailsBox.innerHTML = `
          <div class="min-w-0">
            <div class="text-slate-500">Progress</div>
            <div class="text-blue-900 font-bold text-sm">Cleared ${dungeonStatus.maxFloorPassed || 0} Floors</div>
          </div>
          <div class="text-center">
            <div class="text-slate-500">Checkpoint</div>
            <div class="text-slate-800 font-bold text-sm">Floor ${respawn}</div>
          </div>
          <div class="text-right">
            <div class="text-slate-500">Guild Activity</div>
            <div class="text-emerald-700 font-bold text-sm">${activity.toLocaleString()} pts</div>
          </div>
        `;

        const footerRow = document.createElement('div');
        footerRow.className = 'flex items-center justify-between gap-2 flex-wrap text-xs text-slate-600';
        footerRow.innerHTML = `
          <div class="text-xs text-slate-500">
            Click to view floor doors & titan health status
          </div>
          <button type="button" class="cursor-pointer font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1">
            View Details <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        `;

        card.append(topRow, detailsBox, footerRow);
        return card;
      }
    });
  }

  // 2. Guild War Championship
  const gwStatus = cache.clanWarChampStatus?.data;
  if (gwStatus) {
    const current = gwStatus.seasonStatus?.current;
    eventCards.push({
      id: 'clanWarChamp',
      type: 'guild_war',
      title: '🏆 Guild War Championship',
      searchStr: `guild war championship season ${gwStatus.seasonId || ''} ${current?.stageType || ''}`.toLowerCase(),
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
        const stageLabel = (current?.stageType || 'REGULAR_STAGE').replace(/_/g, ' ');
        const hours = current?.startHour != null && current?.endHour != null
          ? `${String(current.startHour).padStart(2, '0')}:00 - ${String(current.endHour).padStart(2, '0')}:00`
          : 'Active';
        card.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900 text-sm">🏆 Guild War Championship</span>
              <span class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">Season ${gwStatus.seasonId || '58'}</span>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">${stageLabel}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600 mt-2">
            <span>Daily War Window: <strong class="text-slate-800">${hours}</strong></span>
            <span>Tries: <strong class="text-slate-800">${gwStatus.tries ?? 0}</strong></span>
          </div>
        `;
        return card;
      }
    });
  }

  // 3. Guild Clash
  const clashStatus = cache.clanClashStatus?.data?.clashEvent;
  if (clashStatus) {
    eventCards.push({
      id: 'clanClash',
      type: 'clash',
      title: '🛡️ Guild Clash',
      searchStr: `guild clash cycle ${clashStatus.cycleId || ''}`.toLowerCase(),
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
        const lanesCount = clashStatus.lanes?.length || 0;
        card.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900 text-sm">🛡️ Guild Clash</span>
              <span class="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">Cycle ${clashStatus.cycleId || 1}</span>
            </div>
            <span class="text-xs text-slate-500">${lanesCount} Lanes Contested</span>
          </div>
          <div class="text-xs text-slate-600">
            Current stage in progress with lane attacks & defense stationed.
          </div>
        `;
        return card;
      }
    });
  }

  // 4. Hero Brawl
  const brawls = cache.brawlStatus?.data?.brawls;
  if (Array.isArray(brawls) && brawls.length > 0) {
    const brawl = brawls[0];
    eventCards.push({
      id: 'brawl',
      type: 'brawl',
      title: '🥊 Hero Brawl',
      searchStr: `hero brawl #${brawl.brawlId || ''}`.toLowerCase(),
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
        card.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span class="font-bold text-slate-900 text-sm">🥊 Hero Brawl</span>
            <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Brawl #${brawl.brawlId}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600">
            <span>Wins: <strong class="text-slate-800">${brawl.wins ?? 0}</strong></span>
            <span>Defense Power: <strong class="text-slate-800">${resourceData.formatAmount(Number(brawl.power) || 0)}</strong></span>
          </div>
        `;
        return card;
      }
    });
  }

  // 5. Special Quest Events
  const questEvents = cache.questEvents?.data?.events;
  if (Array.isArray(questEvents)) {
    for (const qe of questEvents) {
      const titleMap = {
        ADVENTURE_HERO62_TITLE_EVENT_UPGRADE: 'Soleil Upgrade Event',
        DAEMONSKIN22_UI_TITLE: 'Demon Skin Festival'
      };
      const title = titleMap[qe.name_localeKey] || qe.name_localeKey?.replace(/_/g, ' ') || `Special Event #${qe.id}`;
      eventCards.push({
        id: `questEvent:${qe.id}`,
        type: 'special_event',
        title: `✨ ${title}`,
        searchStr: `special quest event ${title}`.toLowerCase(),
        render: () => {
          const card = document.createElement('div');
          card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
          card.innerHTML = `
            <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
              <span class="font-bold text-slate-900 text-sm">✨ ${title}</span>
              <span class="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800">Special Quest</span>
            </div>
            <div class="text-xs text-slate-500">Event ID: ${qe.id} • Active Special Quests & Rewards</div>
          `;
          return card;
        }
      });
    }
  }

  // 6. Fortress Event
  const fortress = cache.fortressEventStatus?.data;
  if (fortress?.id) {
    eventCards.push({
      id: 'fortress',
      type: 'fortress',
      title: '🏰 Fortress Event',
      searchStr: `fortress event #${fortress.id}`.toLowerCase(),
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
        card.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
            <span class="font-bold text-slate-900 text-sm">🏰 Fortress Event</span>
            <span class="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">Event #${fortress.id}</span>
          </div>
          <div class="text-xs text-slate-500">World Map Fortress conquests active</div>
        `;
        return card;
      }
    });
  }

  // 7. Hydra Boss
  const clanBoss = cache.clanBoss_getAll?.data;
  if (clanBoss && Array.isArray(clanBoss.heads)) {
    const deadCount = clanBoss.heads.filter((h) => h.state?.isDead).length;
    const totalCount = clanBoss.heads.length;
    eventCards.push({
      id: 'clanBoss',
      type: 'boss',
      title: '🐉 Hydra Boss',
      searchStr: 'hydra clan boss heads'.toLowerCase(),
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
        card.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span class="font-bold text-slate-900 text-sm">🐉 Hydra Boss</span>
            <span class="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">Daily Clan Boss</span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600">
            <span>Heads Defeated: <strong class="text-slate-800">${deadCount} / ${totalCount}</strong></span>
            <span>Tries: <strong class="text-slate-800">${clanBoss.tries ?? 0} regular, ${clanBoss.superTries ?? 0} super</strong></span>
          </div>
        `;
        return card;
      }
    });
  }

  const filtered = eventCards.filter((card) => !query || card.searchStr.includes(query) || card.title.toLowerCase().includes(query));
  status.textContent = `${filtered.length} active event${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    if (eventCards.length > 0 && query) {
      showEmpty(`No events matching "${search.value}".`);
    } else {
      showEmpty('No event data observed yet. Open Events or Guild Versus in the game to sync.');
    }
    return;
  }

  const listContainer = document.createElement('div');
  listContainer.className = 'p-4 space-y-3';
  for (const item of filtered) {
    listContainer.append(item.render());
  }
  view.append(listContainer);
}

function setupGuildVersusModal() {
  const modal = document.querySelector('#guild-versus-modal');
  const closeBtn = document.querySelector('#gvs-modal-close');
  if (!modal) return;

  function closeModal() {
    modal.hidden = true;
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}

function setupDungeonModal() {
  const modal = document.querySelector('#dungeon-modal');
  const closeBtn = document.querySelector('#dungeon-modal-close');
  if (!modal) return;

  function closeModal() {
    modal.hidden = true;
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}

let activeGoalsFilter = 'all';

function renderGoals(cache) {
  const query = search.value.trim().toLowerCase();
  const goalsData = globalThis.hwaHelperPopupData?.extractEventGoals?.(cache) || {
    all: [], activities: [], resources: [], metrics: { totalGoals: 0, synergiesCount: 0, readyCount: 0 }
  };

  view.replaceChildren();

  if (!goalsData.all || goalsData.all.length === 0) {
    status.textContent = '0 active event goals';
    showEmpty('No active event goals or challenges detected in current cache.');
    return;
  }

  status.textContent = `${goalsData.metrics.totalGoals} active goals • ${goalsData.metrics.synergiesCount} synergies • ${goalsData.metrics.readyCount} ready`;

  const container = document.createElement('div');
  container.className = 'p-4 space-y-4';

  // 1. KPI Stats Cards Bar
  const kpiBar = document.createElement('div');
  kpiBar.className = 'grid grid-cols-3 gap-2.5';
  kpiBar.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
      <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>Active Goals</span>
        <span>🎯</span>
      </div>
      <div class="text-xl font-black text-slate-900 tabular-nums">${goalsData.metrics.totalGoals}</div>
      <div class="text-[10px] text-slate-400 mt-0.5">Across current events</div>
    </div>
    <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-xs">
      <div class="flex items-center justify-between text-xs text-amber-800 mb-1">
        <span class="font-semibold">Synergies</span>
        <span>🔥</span>
      </div>
      <div class="text-xl font-black text-amber-900 tabular-nums">${goalsData.metrics.synergiesCount}</div>
      <div class="text-[10px] text-amber-700/80 mt-0.5">Completes 2+ events at once</div>
    </div>
    <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
      <div class="flex items-center justify-between text-xs text-emerald-800 mb-1">
        <span class="font-semibold">Ready / Stocked</span>
        <span>✓</span>
      </div>
      <div class="text-xl font-black text-emerald-900 tabular-nums">${goalsData.metrics.readyCount}</div>
      <div class="text-[10px] text-emerald-700/80 mt-0.5">In-stock & daily-limited</div>
    </div>
  `;
  container.append(kpiBar);

  // 2. Filter Pills Bar
  const filterBar = document.createElement('div');
  filterBar.className = 'flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1';

  const filterOptions = [
    { id: 'all', label: `All (${goalsData.all.length})` },
    { id: 'activities', label: `⚡ Activities (${goalsData.activities.length})` },
    { id: 'resources', label: `💎 Resources (${goalsData.resources.length})` },
    { id: 'synergies', label: `🔥 Synergies (${goalsData.metrics.synergiesCount})` },
    { id: 'ready', label: `✓ Ready (${goalsData.metrics.readyCount})` }
  ];

  for (const opt of filterOptions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = activeGoalsFilter === opt.id;
    btn.className = `cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
      isActive
        ? 'bg-blue-600 text-white shadow-xs'
        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
    }`;
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      activeGoalsFilter = opt.id;
      renderGoals(cache);
    });
    filterBar.append(btn);
  }
  container.append(filterBar);

  // Filter items
  function matchGoal(g) {
    if (activeGoalsFilter === 'activities' && g.category !== 'Activities') return false;
    if (activeGoalsFilter === 'resources' && g.category !== 'Resources') return false;
    if (activeGoalsFilter === 'synergies' && g.overlapCount <= 1) return false;
    if (activeGoalsFilter === 'ready' && !(g.category === 'Resources' ? g.inStock : (g.isLimited && !g.isUnavailable && !g.isCompleted))) return false;

    if (query) {
      const q = query.toLowerCase();
      const inTitle = g.title.toLowerCase().includes(q);
      const inCat = g.category.toLowerCase().includes(q);
      const inEvents = g.events.some((e) => e.name.toLowerCase().includes(q));
      if (!inTitle && !inCat && !inEvents) return false;
    }
    return true;
  }

  const visibleActivities = goalsData.activities.filter(matchGoal);
  const visibleResources = goalsData.resources.filter(matchGoal);

  if (visibleActivities.length === 0 && visibleResources.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500';
    noResults.textContent = 'No event goals match current filter or search criteria.';
    container.append(noResults);
    view.append(container);
    return;
  }

  // 3. Render Activities Group
  if (visibleActivities.length > 0) {
    const actSec = document.createElement('div');
    actSec.className = 'space-y-2.5';
    actSec.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <span>⚡</span> Activities & Quests (${visibleActivities.length})
        </h3>
        <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Daily-Limited & Battle Tasks</span>
      </div>
    `;

    const actGrid = document.createElement('div');
    actGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5';

    for (const act of visibleActivities) {
      const card = document.createElement('div');
      const isSynergy = act.overlapCount > 1;
      const isCleared = act.isUnavailable || act.isCompleted;
      card.className = `rounded-xl border p-3 text-xs space-y-2 transition-colors ${
        isCleared
          ? 'border-slate-200 bg-slate-50/70 opacity-80'
          : isSynergy
            ? 'border-amber-300 bg-amber-50/40 shadow-xs'
            : act.isLimited
              ? 'border-blue-200 bg-blue-50/30'
              : 'border-slate-200 bg-white'
      }`;

      // Card Header
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-1.5 flex-wrap';
      header.innerHTML = `
        <div class="flex items-center gap-1.5 font-bold text-slate-900 truncate">
          <span class="shrink-0 text-sm">${act.icon}</span>
          <span class="truncate" title="${act.title}">${act.title}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${
            isSynergy
              ? `<span class="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 border border-amber-300">🔥 ${act.overlapCount}x Synergy</span>`
              : ''
          }
          ${
            isCleared
              ? '<span class="rounded-full bg-slate-200 text-slate-700 text-[10px] font-semibold px-2 py-0.5 border border-slate-300">🔒 Cleared Today</span>'
              : act.isLimited
                ? '<span class="rounded-full bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 border border-blue-200">⚡ Daily Limited</span>'
                : ''
          }
        </div>
      `;

      // Events pills
      const pillBox = document.createElement('div');
      pillBox.className = 'flex flex-wrap gap-1';
      for (const ev of act.events) {
        const pill = document.createElement('span');
        pill.className = 'inline-flex items-center rounded-md bg-white px-2 py-0.5 text-[11px] font-medium border border-slate-200/90 text-slate-700 shadow-2xs';
        pill.innerHTML = `<span class="font-bold text-slate-900 mr-1">${ev.name}:</span> ${ev.amount ? `${ev.amount.toLocaleString()} ${ev.unit || ''}` : ''} ${ev.points > 0 ? `<span class="ml-1 text-emerald-700 font-bold tabular-nums">(+${ev.points.toLocaleString()} pts)</span>` : ''}`;
        pillBox.append(pill);
      }

      // Hint / Footer
      const footer = document.createElement('div');
      footer.className = 'text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between flex-wrap gap-1';
      footer.innerHTML = `
        <span class="text-slate-600 font-medium">
          ${
            isSynergy
              ? `💡 <strong class="text-amber-900">Priority Route:</strong> Progresses ${act.overlapCount} events simultaneously.`
              : act.isLimited
                ? '💡 Daily task: Complete before reset to optimize score.'
                : act.hint
                  ? `💡 ${act.hint}`
                  : ''
          }
        </span>
        ${act.totalPoints > 0 ? `<span class="font-bold text-emerald-700 tabular-nums">+${act.totalPoints.toLocaleString()} total pts</span>` : ''}
      `;

      card.append(header, pillBox, footer);
      actGrid.append(card);
    }

    actSec.append(actGrid);
    container.append(actSec);
  }

  // 4. Render Resources Group
  if (visibleResources.length > 0) {
    const resSec = document.createElement('div');
    resSec.className = 'space-y-2.5';
    resSec.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <span>💎</span> Resources to Spend (${visibleResources.length})
        </h3>
        <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Stock & Spending Targets</span>
      </div>
    `;

    const resGrid = document.createElement('div');
    resGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5';

    for (const res of visibleResources) {
      const card = document.createElement('div');
      const isSynergy = res.overlapCount > 1;
      card.className = `rounded-xl border p-3 text-xs space-y-2 transition-colors ${
        isSynergy
          ? 'border-amber-300 bg-amber-50/40 shadow-xs'
          : res.inStock
            ? 'border-emerald-200 bg-emerald-50/30'
            : 'border-rose-200 bg-rose-50/20'
      }`;

      // Card Header
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-1.5 flex-wrap';
      header.innerHTML = `
        <div class="flex items-center gap-1.5 font-bold text-slate-900 truncate">
          <span class="shrink-0 text-sm">${res.icon}</span>
          <span class="truncate" title="${res.title}">${res.title}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${
            isSynergy
              ? `<span class="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 border border-amber-300">🔥 ${res.overlapCount}x Synergy</span>`
              : ''
          }
          ${
            res.inStock
              ? '<span class="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 border border-emerald-300">✓ In Stock</span>'
              : '<span class="rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 border border-rose-300">⚠️ Shortage</span>'
          }
        </div>
      `;

      // Stock comparison bar
      const stockBar = document.createElement('div');
      stockBar.className = 'flex items-center justify-between text-xs bg-white rounded-lg p-2 border border-slate-200/80';
      const completions = res.needed > 0 ? Math.floor((res.stock || 0) / res.needed) : 0;
      stockBar.innerHTML = `
        <div>Stock: <strong class="text-slate-900 tabular-nums">${(res.stock || 0).toLocaleString()}</strong> owned</div>
        <div class="text-slate-400">•</div>
        <div>Target: <strong class="text-slate-900 tabular-nums">${res.needed.toLocaleString()}</strong> per step</div>
        <div class="text-slate-400">•</div>
        <div class="${res.inStock ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'} tabular-nums">
          ${res.inStock ? `${completions}x ready` : `Need ${((res.needed || 0) - (res.stock || 0)).toLocaleString()}`}
        </div>
      `;

      // Events pills
      const pillBox = document.createElement('div');
      pillBox.className = 'flex flex-wrap gap-1';
      for (const ev of res.events) {
        const pill = document.createElement('span');
        pill.className = 'inline-flex items-center rounded-md bg-white px-2 py-0.5 text-[11px] font-medium border border-slate-200/90 text-slate-700 shadow-2xs';
        pill.innerHTML = `<span class="font-bold text-slate-900 mr-1">${ev.name}:</span> ${ev.amount ? `${ev.amount.toLocaleString()} ${ev.unit || ''}` : ''} ${ev.points > 0 ? `<span class="ml-1 text-emerald-700 font-bold tabular-nums">(+${ev.points.toLocaleString()} pts)</span>` : ''}`;
        pillBox.append(pill);
      }

      // Hint / Footer
      const footer = document.createElement('div');
      footer.className = 'text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between flex-wrap gap-1';
      footer.innerHTML = `
        <span class="text-slate-600 font-medium">
          ${
            isSynergy
              ? `💡 <strong class="text-amber-900">High Synergy:</strong> Spending this satisfies ${res.overlapCount} events simultaneously.`
              : res.inStock
                ? '💡 Sufficient inventory to claim event points immediately.'
                : `💡 Shortage: Save resources or accumulate ${((res.needed || 0) - (res.stock || 0)).toLocaleString()} more before spending.`
          }
        </span>
        ${res.totalPoints > 0 ? `<span class="font-bold text-emerald-700 tabular-nums">+${res.totalPoints.toLocaleString()} total pts</span>` : ''}
      `;

      card.append(header, stockBar, pillBox, footer);
      resGrid.append(card);
    }

    resSec.append(resGrid);
    container.append(resSec);
  }

  view.append(container);
}

function renderConfigOther(cache) {
  const container = document.querySelector('#config-other-list');
  const countBadge = document.querySelector('#config-other-count');
  if (!container) return;
  container.replaceChildren();

  const entries = Object.values(cache || {}).filter((entry) =>
    !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'guildChat', 'energyStatus',
      'worldEnergyStatus', 'worldEnergyRallies', 'resourceActionHistory',
      'accountStatus', 'buildingStatus', 'marchStatus',
      'researchStatus', 'productionConfigStatus', 'productionStatus',
      'productionBonusStatus', 'missionProgressStatus', 'clanVersusStatus', 'questEvents',
      'clanWarChampStatus', 'fortressEventStatus', 'clanClashStatus', 'brawlStatus', 'legendDraftStatus'].includes(entry?.key)
    && !entry?.key?.startsWith('resource:'));

  if (countBadge) countBadge.textContent = `${entries.length} snapshot${entries.length === 1 ? '' : 's'}`;

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-slate-400 italic py-2';
    empty.textContent = 'No other snapshots observed yet.';
    container.append(empty);
    return;
  }

  for (const entry of entries) {
    const details = document.createElement('details');
    details.className = 'rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs transition-colors';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer font-medium text-slate-800 flex items-center justify-between select-none';
    const sizeStr = Array.isArray(entry.data) ? `${entry.data.length} elements` : `${Object.keys(entry.data ?? {}).length} keys`;
    summary.innerHTML = `<span class="font-bold text-blue-700">${entry.method || entry.key}</span> <span class="text-slate-500 text-[11px]">${entry.feature || entry.group || 'data'} • ${sizeStr}</span>`;
    details.append(summary);

    details.addEventListener('toggle', () => {
      if (!details.open || details.querySelector('pre')) return;
      const body = document.createElement('pre');
      body.className = 'mt-2 max-h-44 overflow-auto rounded bg-white border border-slate-200 p-2 whitespace-pre-wrap break-all text-[11px] text-slate-800';
      body.textContent = JSON.stringify(entry.data, null, 2);
      details.append(body);
    });
    container.append(details);
  }
}

function updateGuildChatBadge(cache, lastReadTime) {
  const chatBadgeEl = document.querySelector?.('#guild-chat-badge');
  const chatCountEl = document.querySelector?.('#guild-chat-count');
  const messages = cache?.guildChat?.data?.messages || [];
  const unreadCount = globalThis.hwaHelperPopupData?.getUnreadChatCount
    ? globalThis.hwaHelperPopupData.getUnreadChatCount(messages, lastReadTime)
    : (Array.isArray(messages) ? messages.filter((m) => Number(m.ctime || 0) > Number(lastReadTime || 0)).length : 0);

  if (chatCountEl) {
    chatCountEl.textContent = String(messages.length);
  }
  if (chatBadgeEl) {
    if (unreadCount > 0) {
      chatBadgeEl.hidden = false;
      chatBadgeEl.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      chatBadgeEl.title = `${unreadCount} unread guild message${unreadCount === 1 ? '' : 's'}`;
    } else {
      chatBadgeEl.hidden = true;
      chatBadgeEl.textContent = '';
      chatBadgeEl.title = '';
      chatBadgeEl.removeAttribute?.('title');
    }
  }
  return unreadCount;
}

async function markGuildChatAsRead(cache) {
  const messages = cache?.guildChat?.data?.messages || [];
  if (!messages.length) return 0;
  const maxCtime = messages.reduce((max, m) => {
    const t = Number(m.ctime || 0);
    return t > max ? t : max;
  }, 0);
  if (maxCtime > currentGuildChatLastReadTime) {
    currentGuildChatLastReadTime = maxCtime;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ guildChatLastReadTime: maxCtime }).catch(() => {});
    }
  }
  updateGuildChatBadge(cache, currentGuildChatLastReadTime);
  return currentGuildChatLastReadTime;
}

let chatVisibleCount = 15;
let chatScrollListenerAttached = false;

function renderGuildChat(cache, keepScroll = false, previousReadTime = 0) {
  const visibleLimit = (typeof chatVisibleCount !== 'undefined') ? chatVisibleCount : (renderGuildChat.visibleCount || 15);
  renderGuildChat.visibleCount = visibleLimit;
  const chatData = cache?.guildChat?.data;
  const rawMessages = Array.isArray(chatData?.messages) ? chatData.messages : [];
  const users = chatData?.users || {};

  // Sort messages chronologically ascending (oldest at top, newest at bottom) for standard chat UI dialog flow
  const sortedMessages = [...rawMessages].sort((a, b) => Number(a.ctime || 0) - Number(b.ctime || 0));

  const isChatTab = typeof activeTab === 'undefined' || activeTab === 'chat';
  const query = (isChatTab && typeof search !== 'undefined' && search?.value) ? search.value.trim().toLowerCase() : '';
  const filtered = sortedMessages.filter((m) => {
    if (!query) return true;
    const text = (m.data?.text || '').toLowerCase();
    const sender = (users[m.userId]?.name || m.userId || '').toLowerCase();
    return text.includes(query) || sender.includes(query);
  });

  const chatMessagesEl = document.querySelector?.('#guild-chat-messages');
  const chatCountEl = document.querySelector?.('#guild-chat-count');
  const chatBadgeEl = document.querySelector?.('#guild-chat-badge');

  if (chatCountEl) chatCountEl.textContent = String(rawMessages.length);
  if (chatBadgeEl) {
    chatBadgeEl.hidden = true;
    chatBadgeEl.textContent = '';
    chatBadgeEl.title = '';
    chatBadgeEl.removeAttribute?.('title');
  }

  const targetEl = chatMessagesEl || view;
  if (!targetEl) return;

  if (targetEl === view && typeof status !== 'undefined' && status) {
    status.textContent = `${filtered.length} guild message${filtered.length === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    targetEl.replaceChildren();
    const emptyP = document.createElement('p');
    emptyP.className = 'text-xs text-slate-400 italic p-3 text-center';
    emptyP.textContent = (rawMessages.length > 0 && query)
      ? `No guild messages matching "${query}".`
      : 'No guild chat messages observed yet. Open Guild Chat in game to sync.';
    targetEl.append(emptyP);
    return;
  }

  const startIdx = Math.max(0, filtered.length - visibleLimit);
  const visibleMessages = filtered.slice(startIdx);

  targetEl.replaceChildren();

  if (startIdx > 0) {
    const moreNotice = document.createElement('div');
    moreNotice.className = 'text-center text-[10px] text-slate-400 py-1 select-none';
    moreNotice.textContent = `↑ Scroll up for older messages (${startIdx} more)`;
    targetEl.append(moreNotice);
  }

  for (const m of visibleMessages) {
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
    card.className = `rounded-xl border p-2.5 transition-colors text-xs ${
      isAnnouncement
        ? 'border-amber-300 bg-amber-50/70 shadow-2xs'
        : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
    }`;

    const header = document.createElement('div');
    header.className = 'flex items-center gap-1.5 flex-wrap text-xs';

    const initial = (senderName[0] || '?').toUpperCase();
    const avatarBadge = document.createElement('span');
    avatarBadge.className = `size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
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
    nameSpan.className = 'font-semibold text-slate-900 truncate max-w-[120px]';
    nameSpan.textContent = senderName;

    const roleBadge = document.createElement('span');
    roleBadge.className = `rounded px-1.5 py-0.2 text-[9px] font-semibold ${
      isAnnouncement ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400' : roleInfo.badgeClass
    }`;
    roleBadge.textContent = isAnnouncement ? 'Announcement' : roleInfo.label;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'ml-auto text-[10px] text-slate-400 tabular-nums';
    timeSpan.textContent = timeText;

    header.append(avatarBadge, nameSpan);
    if (user.level) {
      const levelBadge = document.createElement('span');
      levelBadge.className = 'rounded bg-slate-100 px-1 py-0.2 text-[9px] font-medium text-slate-600 tabular-nums';
      levelBadge.textContent = `Lv.${user.level}`;
      header.append(levelBadge);
    }
    header.append(roleBadge, timeSpan);
    if (previousReadTime > 0 && Number(m.ctime || 0) > previousReadTime) {
      const newBadge = document.createElement('span');
      newBadge.className = 'rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 ring-1 ring-emerald-300';
      newBadge.textContent = 'New';
      header.append(newBadge);
    }

    const body = document.createElement('div');
    body.className = 'mt-1 text-xs text-slate-800 break-words whitespace-pre-wrap select-text pl-6.5';
    body.textContent = m.data?.text || '—';

    card.append(header, body);
    targetEl.append(card);
  }

  if (!keepScroll && targetEl.scrollTop !== undefined) {
    targetEl.scrollTop = targetEl.scrollHeight;
  }

  const isListenerAttached = (typeof chatScrollListenerAttached !== 'undefined') ? chatScrollListenerAttached : renderGuildChat.listenerAttached;
  if (chatMessagesEl && !isListenerAttached) {
    if (typeof chatScrollListenerAttached !== 'undefined') chatScrollListenerAttached = true;
    renderGuildChat.listenerAttached = true;
    chatMessagesEl.addEventListener('scroll', () => {
      const currentLimit = (typeof chatVisibleCount !== 'undefined') ? chatVisibleCount : (renderGuildChat.visibleCount || 15);
      if (chatMessagesEl.scrollTop < 25 && currentLimit < filtered.length) {
        const oldHeight = chatMessagesEl.scrollHeight;
        const newLimit = Math.min(filtered.length, currentLimit + 15);
        renderGuildChat.visibleCount = newLimit;
        if (typeof chatVisibleCount !== 'undefined') chatVisibleCount = newLimit;
        renderGuildChat(currentCache, true);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight - oldHeight;
      }
    });
  }
}

async function render() {
  const [stored, session] = await Promise.all([
    chrome.storage.local.get([CACHE_KEY, 'resourceSelection', 'guildChatLastReadTime', 'favoriteHeroes', 'favoriteTitans']), chrome.storage.session.get('recordingState')
  ]);
  const cache = stored[CACHE_KEY] || {};
  currentCache = cache;
  currentGuildChatLastReadTime = Number(stored.guildChatLastReadTime || 0);
  favoriteHeroes = new Set(Array.isArray(stored.favoriteHeroes) ? stored.favoriteHeroes.map(String) : []);
  favoriteTitans = new Set(Array.isArray(stored.favoriteTitans) ? stored.favoriteTitans.map(String) : []);
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
  if (tableExportBtn && !['heroes', 'titans', 'items', 'resources', 'teams', 'other'].includes(activeTab)) {
    tableExportBtn.hidden = true;
  }
  document.querySelector('#clear').hidden = activeTab !== 'log';
  document.querySelector('#item-group-filter').hidden = activeTab !== 'items';
  document.querySelector('#log-sort-wrap').hidden = activeTab !== 'log';
  document.querySelector('#resource-sort-wrap').hidden = activeTab !== 'resources';
  if (resourceFilterToggle) resourceFilterToggle.hidden = activeTab !== 'resources';
  document.querySelector('#search-label').textContent = activeTab === 'log' ? 'Filter endpoint' :
    activeTab === 'draft' ? 'Search hero by name, role, or ID' :
    activeTab === 'chat' ? 'Search message or sender' :
    activeTab === 'goals' ? 'Search goal, activity, or event' :
    activeTab === 'events' ? 'Search event name or type' : 'Search ID, name, or group';
  search.placeholder = activeTab === 'log' ? 'Filter endpoint' :
    activeTab === 'draft' ? 'Search hero by name, role, or ID' :
    activeTab === 'chat' ? 'Search message or sender' :
    activeTab === 'goals' ? 'Search goal, activity, or event' :
    activeTab === 'events' ? 'Search event name or type' : 'Search ID, name, or group';

  if (activeTab === 'config') {
    status.textContent = 'Settings and data stored in this browser.';
    renderConfigOther(cache);
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
    showSnapshot(cache.titanGetAll, ['Titan ID', 'Name', 'Level', 'Star', 'Soul stones', 'Artifacts', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, titan]) => {
        const { owned, needed } = globalThis.hwaHelperPopupData.titanSoulProgress(id, titan, cache.inventoryGet?.data);
        const soulStones = `${formatNumber(owned)} / ${typeof needed === 'number' ? formatNumber(needed) : needed ?? '—'}`;
        const artifactLevels = globalThis.hwaHelperPopupData.formatTitanArtifactLevels(id, titan);
        return [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(titan?.level),
          titan?.star, soulStones, artifactLevels, formatNumber(titan?.power)];
      }));
  } else if (activeTab === 'teams') {
    showSnapshot(cache.teamGetAll, ['Mode', 'Team', 'Members', 'Hero/Titan names'], (data) =>
      globalThis.hwaHelperPopupData.teamRows(data, globalThis.hwaHelperNameMap));
  } else if (activeTab === 'chat') {
    const prevRead = currentGuildChatLastReadTime;
    renderGuildChat(cache, false, prevRead);
    await markGuildChatAsRead(cache);
  } else if (activeTab === 'events') {
    renderEvents(cache);
  } else if (activeTab === 'goals') {
    renderGoals(cache);
  } else if (activeTab === 'other') {
    const entries = Object.values(cache).filter((entry) =>
      !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'guildChat', 'energyStatus',
        'worldEnergyStatus', 'worldEnergyRallies', 'resourceActionHistory',
        'accountStatus', 'buildingStatus', 'marchStatus',
        'researchStatus', 'productionConfigStatus', 'productionStatus',
        'productionBonusStatus', 'missionProgressStatus', 'clanVersusStatus', 'questEvents', 'clanWarChampStatus', 'fortressEventStatus', 'clanClashStatus', 'brawlStatus', 'legendDraftStatus'].includes(entry.key)
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
  const chatPanel = document.querySelector('#guild-chat-panel');
  if (chatPanel && !chatPanel.hidden) {
    await markGuildChatAsRead(cache);
    renderGuildChat(cache, true);
  } else if (activeTab !== 'chat') {
    updateGuildChatBadge(cache, currentGuildChatLastReadTime);
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
setupGuildVersusModal();
setupDungeonModal();
setInterval(refreshTimed, 1000);


// Setup Guild Chat FAB and Panel
const chatFab = document.querySelector('#guild-chat-fab');
const chatPanel = document.querySelector('#guild-chat-panel');
const chatClose = document.querySelector('#guild-chat-close');
if (chatFab && chatPanel) {
  chatFab.addEventListener('click', async () => {
    chatPanel.hidden = !chatPanel.hidden;
    if (!chatPanel.hidden) {
      const prevRead = currentGuildChatLastReadTime;
      renderGuildChat(currentCache, false, prevRead);
      await markGuildChatAsRead(currentCache);
    } else {
      updateGuildChatBadge(currentCache, currentGuildChatLastReadTime);
    }
  });
}
if (chatClose && chatPanel) {
  chatClose.addEventListener('click', () => {
    chatPanel.hidden = true;
    updateGuildChatBadge(currentCache, currentGuildChatLastReadTime);
  });
}
