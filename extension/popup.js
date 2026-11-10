function applyTheme(theme) {
  const isDark = theme === 'dark' || (!theme) ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

try {
  chrome.storage?.local?.get?.('theme', (res) => {
    applyTheme(res?.theme || 'dark');
  });
} catch (_) {
  applyTheme('dark');
}

if (typeof window !== 'undefined' && window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      chrome.storage?.local?.get?.('theme', (res) => {
        if (res?.theme === 'system') applyTheme('system');
      });
    });
  } catch (_) {}
}

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
let activeTab = 'dashboard';

const DEFAULT_TAB_CONFIG = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'items', label: 'Items' },
  { id: 'resources', label: 'Resources' },
  { id: 'titans', label: 'Titans' },
  { id: 'teams', label: 'Teams' },
  { id: 'events', label: 'Events' },
  { id: 'goals', label: 'Goals' },
  { id: 'log', label: 'Log' }
];

let currentTabConfig = DEFAULT_TAB_CONFIG.map((t) => ({ id: t.id, visible: true }));
let currentAutoClaimSettings = { mail: true, reports: true, quests: true, onOpen: false };
let currentAutoGatherSettings = { enabled: false, maxMarches: 3, mineLevel: 5, mineType: 'rotate', lastAutoMineType: null };
let popupRpcEnabled = false;
let claimRpcStatus = null;
let hasAutoClaimedThisSession = false;
const experimentalSelection = { rallyTeam: '', gatherTeam: 'weakest', bossLevel: 1, searchedBossLevel: 1,
  waitSeconds: 300, minMembers: 4, autoCancel: true, raidCount: 2, targetMobId: '', mineType: 'food', mineLevel: 1, mineId: '', units: '' };
let raidPreferencesLoaded = false;
let raidQueueState = null;
const monsterSelection = { teamId: '', level: 1, count: 2, targetMobId: '' };
let monsterPreferencesAccount = null;
let monsterQueueState = null;
let monsterMessage = '';
function saveMonsterPreferences() {
  return chrome.storage.local.set({ monsterPreferences: {
    accountId: currentCache.accountStatus?.data?.id,
    teamId: monsterSelection.teamId, level: monsterSelection.level, count: monsterSelection.count
  } });
}
let towerAutomationSettings = { accountId: null, buffPriority: [] };
let towerSettingsLoadedFor = null;
let towerRunState = null;
let towerAutomationMessage = '';
let dungeonRunState = null;
let dungeonAutomationMessage = '';
let dungeonAutomationSettings = {
  accountId: null,
  attackerPriority: ['water', 'neutral', 'earth', 'fire'],
  pools: null
};
let dungeonSettingsLoadedFor = null;
let troopCapacitySettings = { defaultHero: 600, base: 950 };
let experimentalMessage = '';

function saveRaidPreferences() {
  return chrome.storage.local.set({ raidPreferences: { accountId: currentCache.accountStatus?.data?.id,
    rallyTeam: experimentalSelection.rallyTeam, bossLevel: experimentalSelection.searchedBossLevel ?? experimentalSelection.bossLevel,
    waitSeconds: experimentalSelection.waitSeconds, minMembers: experimentalSelection.minMembers,
    autoCancel: experimentalSelection.autoCancel,
    raidCount: experimentalSelection.raidCount } });
}
let experimentalPending = null;
let currentRpcPolicy = { mode: 'piggyback', monitor: true };
let campaignRaidSequential = true;
let isCampaignRaidLoopRunning = false;
let abortCampaignRaidLoop = false;

let itemsViewMode = 'grid'; // 'grid' | 'list'
try {
  chrome.storage?.local?.get?.('itemsViewMode')?.then?.((stored) => {
    if (stored?.itemsViewMode) {
      itemsViewMode = stored.itemsViewMode;
      updateItemsViewButtons();
    }
  });
} catch (_) {}

function updateItemsViewButtons() {
  const btnGrid = document.querySelector('#items-view-grid');
  const btnList = document.querySelector('#items-view-list');
  if (!btnGrid || !btnList) return;
  if (itemsViewMode === 'grid') {
    btnGrid.className = 'cursor-pointer rounded-md px-2.5 py-1.5 transition-all bg-white text-blue-700 shadow-xs font-semibold';
    btnList.className = 'cursor-pointer rounded-md px-2.5 py-1.5 transition-all text-slate-600 hover:text-slate-900 font-normal';
  } else {
    btnList.className = 'cursor-pointer rounded-md px-2.5 py-1.5 transition-all bg-white text-blue-700 shadow-xs font-semibold';
    btnGrid.className = 'cursor-pointer rounded-md px-2.5 py-1.5 transition-all text-slate-600 hover:text-slate-900 font-normal';
  }
}

document.querySelector('#items-view-grid')?.addEventListener('click', async () => {
  if (itemsViewMode === 'grid') return;
  itemsViewMode = 'grid';
  updateItemsViewButtons();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ itemsViewMode: 'grid' });
  }
  render();
});

document.querySelector('#items-view-list')?.addEventListener('click', async () => {
  if (itemsViewMode === 'list') return;
  itemsViewMode = 'list';
  updateItemsViewButtons();
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    await chrome.storage.local.set({ itemsViewMode: 'list' });
  }
  render();
});

function normalizeTabConfig(storedConfig) {
  if (!Array.isArray(storedConfig) || storedConfig.length === 0) {
    return DEFAULT_TAB_CONFIG.map((t) => ({ id: t.id, visible: true }));
  }
  const knownIds = new Set(DEFAULT_TAB_CONFIG.map((t) => t.id));
  const result = [];
  const seenIds = new Set();
  for (const item of storedConfig) {
    if (item && knownIds.has(item.id) && !seenIds.has(item.id)) {
      result.push({
        id: item.id,
        visible: item.visible !== false
      });
      seenIds.add(item.id);
    }
  }
  for (const def of DEFAULT_TAB_CONFIG) {
    if (!seenIds.has(def.id)) {
      if (def.id === 'dashboard') result.unshift({ id: def.id, visible: true });
      else result.push({ id: def.id, visible: true });
    }
  }
  if (!result.some((t) => t.visible)) {
    result[0].visible = true;
  }
  return result;
}

function applyTabConfig(config) {
  const tabsNav = document.querySelector('#tabs');
  if (!tabsNav) return;
  const configBtn = tabsNav.querySelector('[data-tab="config"]');

  config.forEach((item) => {
    const btn = tabsNav.querySelector(`[data-tab="${item.id}"]`);
    if (btn) {
      btn.hidden = !item.visible;
      if (configBtn) {
        tabsNav.insertBefore(btn, configBtn);
      } else {
        tabsNav.appendChild(btn);
      }
    }
  });

  if (activeTab !== 'config') {
    const currentTabItem = config.find((t) => t.id === activeTab);
    if (currentTabItem && !currentTabItem.visible) {
      const firstVisible = config.find((t) => t.visible);
      if (firstVisible) {
        activeTab = firstVisible.id;
        const allTabs = [...tabsNav.querySelectorAll('[data-tab]')];
        allTabs.forEach((t) => { t.setAttribute('aria-selected', String(t.dataset.tab === activeTab)); });
      }
    }
  }
}

async function saveTabConfig(config) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ tabConfig: config }).catch(() => {});
  }
}

function renderConfigTabs() {
  const container = document.querySelector('#config-tabs-list');
  if (!container) return;
  container.replaceChildren();

  const labelMap = Object.fromEntries(DEFAULT_TAB_CONFIG.map((t) => [t.id, t.label]));

  currentTabConfig.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between rounded-md bg-white px-3 py-2 border border-slate-200 shadow-xs text-xs';

    const left = document.createElement('label');
    left.className = 'flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.visible;
    checkbox.className = 'tab-visibility-toggle size-4 accent-blue-600 cursor-pointer';
    checkbox.dataset.tabId = item.id;
    checkbox.addEventListener('change', async () => {
      if (!checkbox.checked) {
        const visibleCount = currentTabConfig.filter((t) => t.visible).length;
        if (visibleCount <= 1) {
          checkbox.checked = true;
          return;
        }
      }
      item.visible = checkbox.checked;
      await saveTabConfig(currentTabConfig);
      applyTabConfig(currentTabConfig);
      renderConfigTabs();
    });

    const span = document.createElement('span');
    span.textContent = labelMap[item.id] || item.id;
    left.append(checkbox, span);

    const right = document.createElement('div');
    right.className = 'flex items-center gap-1';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.title = 'Move Up';
    upBtn.setAttribute('aria-label', `Move ${span.textContent} up`);
    upBtn.disabled = index === 0;
    upBtn.className = 'tab-move-up-btn cursor-pointer rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed';
    upBtn.dataset.tabIndex = String(index);
    upBtn.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 17a1 1 0 0 1-1-1V5.414l-3.293 3.293a1 1 0 0 1-1.414-1.414l5-5a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1-1.414 1.414L11 5.414V16a1 1 0 0 1-1 1z" clip-rule="evenodd"/></svg>';
    upBtn.addEventListener('click', async () => {
      if (index > 0) {
        const temp = currentTabConfig[index];
        currentTabConfig[index] = currentTabConfig[index - 1];
        currentTabConfig[index - 1] = temp;
        await saveTabConfig(currentTabConfig);
        applyTabConfig(currentTabConfig);
        renderConfigTabs();
      }
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.title = 'Move Down';
    downBtn.setAttribute('aria-label', `Move ${span.textContent} down`);
    downBtn.disabled = index === currentTabConfig.length - 1;
    downBtn.className = 'tab-move-down-btn cursor-pointer rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed';
    downBtn.dataset.tabIndex = String(index);
    downBtn.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 0 1 1 1v10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L9 14.586V4a1 1 0 0 1 1-1z" clip-rule="evenodd"/></svg>';
    downBtn.addEventListener('click', async () => {
      if (index < currentTabConfig.length - 1) {
        const temp = currentTabConfig[index];
        currentTabConfig[index] = currentTabConfig[index + 1];
        currentTabConfig[index + 1] = temp;
        await saveTabConfig(currentTabConfig);
        applyTabConfig(currentTabConfig);
        renderConfigTabs();
      }
    });

    right.append(upBtn, downBtn);
    row.append(left, right);
    container.append(row);
  });
}

globalThis.hwaHelperTabConfig = {
  DEFAULT_TAB_CONFIG,
  normalizeTabConfig,
  applyTabConfig,
  saveTabConfig,
  renderConfigTabs,
  get currentTabConfig() { return currentTabConfig; },
  set currentTabConfig(v) { currentTabConfig = v; }
};
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

const extManifestVer = chrome.runtime?.getManifest?.()?.version;
if (extManifestVer) {
  const vEl = document.querySelector('#version');
  if (vEl) vEl.textContent = extManifestVer;
  const headerVEl = document.querySelector('#extension-header-version');
  if (headerVEl) headerVEl.textContent = `v.${extManifestVer}`;
}
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

document.querySelector('#draft-alert')?.addEventListener('click', () => openDraftModal(currentCache));

const formatNumber = (value) => typeof value === 'number' ? value.toLocaleString('en-US') : '—';
const formatTime = (value) => value ? new Date(value).toLocaleString('en-US') : 'not available';
const byId = ([a], [b]) => Number(a) - Number(b);
const resourceData = globalThis.hwaHelperResourceData;

function resourceLabel(entry) {
  const id = String(entry?.key || '').replace(/^resource:/, '');
  const [type, itemId] = id.split(':');
  const fallback = { gold: 'Gold', starMoney: 'Emeralds', energy: 'Energy',
    'world-energy': 'World Energy' }[id] || (itemId ? type + ' #' + itemId : id || 'Resource');
  let name = null;
  if (type === 'refillable') {
    name = globalThis.hwaHelperRefillableRules?.[itemId]?.label;
  } else if (type && itemId && !id.startsWith('world-refillable:')) {
    name = globalThis.hwaHelperNameMap?.item?.(type, itemId);
  }
  const label = typeof name === 'string' && name.trim() ? name : entry?.data?.label;
  return typeof label === 'string' && label.trim() ? label : fallback;
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
  if (march.kind === 'attack') {
    const target = Number.isInteger(march.mobConfigId) ? `Monster #${march.mobConfigId}` : 'Monster';
    const heroes = (march.team?.heroIds || []).map((id) =>
      globalThis.hwaHelperNameMap?.hero?.(id) || `Hero #${id}`).join(', ');
    const state = isReturning ? `${march.result === 'win' ? 'Victory' : march.result ? `Result: ${march.result}` : 'Battle complete'} · Returning` :
      Number.isFinite(march.targetArrivalAt) && now >= march.targetArrivalAt ? 'Battle in progress' : 'Traveling to target';
    const remaining = Number.isFinite(march.endsAt) ? Math.max(0, Math.ceil((march.endsAt - now) / 1000)) : null;
    return `${target} · ${state}${heroes ? `\nHeroes: ${heroes}` : ''}${remaining !== null ? `\n${resourceData.tooltipTime(remaining)} remaining` : ''}${march.returnEstimated && isReturning ? '\nReturn time estimated' : ''}`;
  }
  const action = isReturning ? (prevLabel ? `${prevLabel} returning` : 'Returning') : isMine ?
    `${isTraveling ? 'Traveling to' : 'Gathering'} ${style.label}` :
    march.kind === 'return' ? 'Returning' :
    march.rally?.isAutoJoin ? (march.stage === 'moveToRallyLeader' ? 'Auto-joining raid' : 'Auto-join raid waiting') :
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

function getMarchBadgeInfo(march, now = Date.now()) {
  const isAutoJoin = Boolean(march?.rally?.isAutoJoin);
  const isRaid = Boolean(march?.rally) || march?.kind === 'raid' || march?.previousKind === 'raid';
  const isMine = Boolean(march?.mineId) ||
    ['food', 'wood', 'stone', 'iron', 'mine'].includes(march?.kind) ||
    ['food', 'wood', 'stone', 'iron', 'mine'].includes(march?.previousKind);
  const isMonster = !isRaid && !isMine && (
    march?.kind === 'attack' ||
    march?.previousKind === 'attack' ||
    Boolean(march?.mobConfigId)
  );
  const isReturning = march?.kind === 'return' || march?.stage === 'returnToOutpost';

  let category = 'other';
  let icon = '⚔️';
  let classes = 'bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
  let isPulse = false;

  if (isRaid) {
    category = 'raid';
    classes = 'bg-indigo-100 text-indigo-900 ring-indigo-400 dark:bg-indigo-950/70 dark:text-indigo-200 dark:ring-indigo-700';
    isPulse = true;

    const expData = globalThis.hwaHelperExperimentalData;
    const phase = expData?.rallyPhase ? expData.rallyPhase(march, now) : null;
    const pName = phase?.phase;

    if (isReturning || pName === 'Returning' || pName === 'Battle complete') {
      icon = '↩️';
    } else if (pName === 'Battle / awaiting result' || march?.stage === 'battle') {
      icon = '💥';
    } else if (pName === 'Traveling to boss' || march?.stage === 'moveToTargetInRally' || march?.stage === 'moveToTarget') {
      icon = '🏹';
    } else if (pName === 'Waiting' || march?.stage === 'waitingForRallyStart' || (march?.rally?.waitUntil && now < march.rally.waitUntil)) {
      icon = isAutoJoin ? '⚡' : '⏳';
    } else if (isAutoJoin) {
      icon = '⚡';
    } else {
      icon = '⚔️';
    }
  } else if (isMine) {
    category = 'gather';
    classes = 'bg-emerald-100 text-emerald-900 ring-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-700';

    if (isReturning) {
      icon = '↩️';
    } else if (march?.stage === 'moveToTargetInSolo' && Number.isFinite(march?.targetArrivalAt) && now < march.targetArrivalAt) {
      icon = '🚶‍♂️';
    } else {
      icon = '⛏️';
    }
  } else if (isMonster) {
    category = 'monster';
    classes = 'bg-amber-100 text-amber-900 ring-amber-400 dark:bg-amber-950/70 dark:text-amber-200 dark:ring-amber-700';

    const isFighting = !isReturning && Number.isFinite(march?.targetArrivalAt) && now >= march.targetArrivalAt;
    if (isReturning) {
      icon = '↩️';
    } else if (isFighting) {
      icon = '💥';
    } else if (march?.stage === 'moveToTargetInSolo' || (Number.isFinite(march?.targetArrivalAt) && now < march.targetArrivalAt)) {
      icon = '🏃‍♂️';
    } else {
      icon = '👾';
    }
  } else if (march?.kind === 'scout') {
    category = 'scout';
    classes = 'bg-violet-100 text-violet-900 ring-violet-400 dark:bg-violet-950/70 dark:text-violet-200 dark:ring-violet-700';
    icon = isReturning ? '↩️' : '⌖';
  } else if (isReturning) {
    icon = '↩️';
  }

  return { category, icon, classes, isPulse };
}

function renderMarches(cache, wrap = document.querySelector('#marches')) {
  if (!wrap) return;
  wrap.replaceChildren();
  const seen = new Set();
  const now = Date.now();
  const marches = cache?.marchStatus?.data?.marches || [];
  const identities = (march) => [march.squadId && `squad:${march.squadId}`,
    march.rally?.id && `rally:${march.rally.id}`].filter(Boolean);
  const expired = new Set(marches.filter((march) => isMarchExpired(march, now))
    .flatMap(identities));
  for (const [index, march] of marches.entries()) {
    if (isMarchExpired(march, now)) continue;
    const keys = identities(march);
    if (keys.some((key) => seen.has(key) || expired.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    const info = getMarchBadgeInfo(march, now);
    const badge = document.createElement('span');
    const pulseClass = info.isPulse ? 'animate-pulse march-raid-pulse' : '';
    badge.className = ('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ' + info.classes + (pulseClass ? ' ' + pulseClass : '')).trim();
    badge.dataset.marchIndex = String(index);
    badge.dataset.resourceTooltip = '';
    badge.dataset.tooltipBelow = '';
    badge.tabIndex = 0;
    badge.textContent = info.icon;
    wrap.append(badge);
  }
  wrap.hidden = wrap.children.length === 0;
}

let dashboardStatusPollCounter = 0;

function updateActionQueueBadges(root = document) {
  const raidBtn = root.querySelector ? root.querySelector('#open-raid-dialog') : null;
  if (raidBtn) {
    const currentRaidQueue = typeof raidQueueState !== 'undefined' ? raidQueueState : null;
    const raidQueueRunning = currentRaidQueue && !['stopped', 'complete'].includes(currentRaidQueue.phase);
    const count = raidQueueRunning ?
      (currentRaidQueue.bossQueue?.remain_raid_count ??
       Math.max(0, (currentRaidQueue.options?.count || 0) - (globalThis.hwaHelperRaidQueue?.confirmedWins?.(currentRaidQueue) ?? 0))) : 0;
    let badge = raidBtn.querySelector ? raidBtn.querySelector('#open-raid-dialog-badge') :
      raidBtn.children?.find?.((c) => c.id === 'open-raid-dialog-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'open-raid-dialog-badge';
        badge.className = 'absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold leading-none text-white shadow-xs ring-2 ring-slate-900 animate-pulse pointer-events-none';
        raidBtn.append(badge);
      }
      badge.textContent = String(count);
      badge.dataset.queueCount = String(count);
      badge.title = `${count} queued remaining`;
      badge.setAttribute?.('aria-label', `${count} queued remaining`);
    } else if (badge) {
      if (typeof badge.remove === 'function') badge.remove();
      else if (raidBtn.children) raidBtn.children = raidBtn.children.filter((c) => c !== badge);
    }
  }

  const monsterBtn = root.querySelector ? root.querySelector('#open-monster-dialog') : null;
  if (monsterBtn) {
    const currentMonsterQueue = typeof monsterQueueState !== 'undefined' ? monsterQueueState : null;
    const monsterQueueRunning = currentMonsterQueue && !['stopped', 'complete'].includes(currentMonsterQueue.phase);
    const count = monsterQueueRunning ?
      Math.max(0, (currentMonsterQueue.options?.count || 0) - (globalThis.hwaHelperMonsterQueue?.confirmedWins?.(currentMonsterQueue) ?? currentMonsterQueue.completed ?? 0)) : 0;
    let badge = monsterBtn.querySelector ? monsterBtn.querySelector('#open-monster-dialog-badge') :
      monsterBtn.children?.find?.((c) => c.id === 'open-monster-dialog-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'open-monster-dialog-badge';
        badge.className = 'absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold leading-none text-white shadow-xs ring-2 ring-slate-900 animate-pulse pointer-events-none';
        monsterBtn.append(badge);
      }
      badge.textContent = String(count);
      badge.dataset.queueCount = String(count);
      badge.title = `${count} queued remaining`;
      badge.setAttribute?.('aria-label', `${count} queued remaining`);
    } else if (badge) {
      if (typeof badge.remove === 'function') badge.remove();
      else if (monsterBtn.children) monsterBtn.children = monsterBtn.children.filter((c) => c !== badge);
    }
  }
}

function refreshTimed() {
  const now = Date.now();
  if (typeof activeTab !== 'undefined' && activeTab === 'dashboard') {
    if (++dashboardStatusPollCounter % 3 === 0 && typeof updateDashboardGameStatus === 'function') {
      updateDashboardGameStatus();
    }
    updateActionQueueBadges();
  }
  for (const countdown of document.querySelectorAll('[data-experimental-until]')) {
    const until = Number(countdown.dataset.experimentalUntil);
    const diffSec = Math.max(0, Math.ceil((until - now) / 1000));
    if (countdown.dataset.countdownFormat === 'hms') {
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      countdown.textContent = h > 0
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
      countdown.textContent = ` · ${diffSec}s`;
    }
  }
  for (const bar of document.querySelectorAll('[data-progress-bar]')) {
    const start = Number(bar.dataset.progressStart);
    const duration = Number(bar.dataset.progressDuration);
    if (Number.isFinite(start) && Number.isFinite(duration) && duration > 0) {
      const pct = Math.min(100, Math.max(0, ((now - start) / duration) * 100));
      bar.style.width = `${pct.toFixed(1)}%`;
    }
  }
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
      const info = getMarchBadgeInfo(march, now);
      if (badge.textContent !== info.icon) badge.textContent = info.icon;
      const pulseClass = info.isPulse ? 'animate-pulse march-raid-pulse' : '';
      const targetClassName = ('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ' + info.classes + (pulseClass ? ' ' + pulseClass : '')).trim();
      if (badge.className !== targetClassName) badge.className = targetClassName;
    }
  }
  marchesWrap.hidden = ![...marchesWrap.children].some((badge) => !badge.hidden);
  const mailStatus = currentCache.mailStatus?.data;
  const mailBadge = document.querySelector('#mail-badge');
  if (mailBadge) {
    const hasUnclaimed = Boolean(mailStatus?.hasUnclaimed || (mailStatus?.totalUnclaimed && mailStatus.totalUnclaimed > 0) || (mailStatus?.unclaimedReportsCount && mailStatus.unclaimedReportsCount > 0));
    const count = mailStatus?.totalUnclaimed || mailStatus?.unclaimedReportsCount || 0;
    mailBadge.hidden = !hasUnclaimed;
    if (hasUnclaimed) {
      setResourceTooltip(mailBadge, `New mail / battle report with reward${count > 1 ? `s (${count})` : ''}`);
    }
  }
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
  const energyBadge = document.querySelector('#energy-badge');
  energyBadge?.classList?.toggle('resource-capped-amber', isEnergyCapped);
  const energyPing = energyBadge?.querySelector?.('.hwa-mail-dot-ping');
  if (energyPing) energyPing.hidden = !isEnergyCapped;

  const worldVal = resourceData.amountAt(worldEnergy) ?? currentCache.worldEnergyStatus?.data?.energy;
  const worldCap = worldEnergy?.data?.cap ?? 200;
  const isWorldCapped = Number.isFinite(worldVal) && Number.isFinite(worldCap) && worldVal >= worldCap;
  const worldBadge = document.querySelector('#world-energy-badge');
  worldBadge?.classList?.toggle('resource-capped-sky', isWorldCapped);
  const worldPing = worldBadge?.querySelector?.('.hwa-mail-dot-ping');
  if (worldPing) worldPing.hidden = !isWorldCapped;

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
    let pillPing = pill?.querySelector?.('.hwa-mail-dot-ping');
    if (isCapped) {
      if (!pillPing) {
        pill?.classList?.add('relative');
        pillPing = document.createElement('span');
        pillPing.className = 'hwa-mail-dot-ping';
        pill.append(pillPing);
      }
      pillPing.hidden = false;
    } else if (pillPing) {
      pillPing.hidden = true;
    }
  }

  const eventsBadge = document.querySelector('#events-tab-badge');
  if (eventsBadge) {
    const hasActiveEvents = Boolean(currentCache.clanVersusStatus || currentCache.clanWarChampStatus ||
      currentCache.clanClashStatus || currentCache.brawlStatus ||
      globalThis.hwaHelperQuestData?.visibleEvents(currentCache).length ||
      globalThis.hwaHelperQuestData?.visibleMetadata(currentCache).length);
    eventsBadge.hidden = !hasActiveEvents;
  }
  const heroesBadge = document.querySelector('#heroes-tab-badge');
  if (heroesBadge) {
    const heroCount = globalThis.hwaHelperPopupData?.countEvolvableHeroes
      ? globalThis.hwaHelperPopupData.countEvolvableHeroes(currentCache.heroGetAll?.data, currentCache.inventoryGet?.data)
      : 0;
    if (heroCount > 0) {
      heroesBadge.textContent = String(heroCount);
      heroesBadge.hidden = false;
      heroesBadge.classList?.remove?.('hidden');
    } else {
      heroesBadge.hidden = true;
      heroesBadge.classList?.add?.('hidden');
    }
  }

  const titansBadge = document.querySelector('#titans-tab-badge');
  if (titansBadge) {
    const titanCount = globalThis.hwaHelperPopupData?.countEvolvableTitans
      ? globalThis.hwaHelperPopupData.countEvolvableTitans(currentCache.titanGetAll?.data, currentCache.inventoryGet?.data)
      : 0;
    if (titanCount > 0) {
      titansBadge.textContent = String(titanCount);
      titansBadge.hidden = false;
      titansBadge.classList?.remove?.('hidden');
    } else {
      titansBadge.hidden = true;
      titansBadge.classList?.add?.('hidden');
    }
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
  renderDraftAlert(currentCache);
  const draftStatus = currentCache.legendDraftStatus?.data;
  if (draftStatus?.stageFinishTs) {
    const formatted = globalThis.hwaHelperPopupData.formatCountdown(draftStatus.stageFinishTs);

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
      resourceFilterToggle.className = 'inline-flex cursor-pointer items-center gap-1 shrink-0 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 shadow-2xs dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
      resourceFilterToggleText.textContent = hiddenCount > 0 ? `Hide Inactive (${hiddenCount})` : 'Hide Inactive';
      resourceFilterToggle.title = 'Hide test, debug, and unreleased event resources';
    } else {
      resourceFilterToggle.className = 'inline-flex cursor-pointer items-center gap-1 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400';
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
  list.className = 'divide-y divide-slate-100 dark:divide-slate-800';

  function createResourceRow(entry) {
    const amt = resourceData.amountAt(entry);
    const cap = entry.data?.cap;
    const isCapped = Number.isFinite(amt) && Number.isFinite(cap) && amt >= cap;

    const label = document.createElement('label');
    label.className = `flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-blue-50/50 dark:hover:bg-slate-800/60 ${isCapped ? 'bg-amber-50/40 dark:bg-amber-950/30' : ''}`;
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
    name.className = 'min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200 flex items-center gap-1.5';
    name.textContent = resourceLabel(entry);
    if (isCapped) {
      const fullBadge = document.createElement('span');
      fullBadge.className = 'rounded bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white uppercase';
      fullBadge.textContent = 'Full';
      name.append(fullBadge);
    }

    const amount = document.createElement('strong');
    amount.className = 'tabular-nums text-slate-900 dark:text-slate-100';
    amount.dataset.resourceAmount = entry.key;
    amount.textContent = resourceData.formatAmount(amt);

    label.append(iconSpan, name, amount);
    return label;
  }

  if (renewableRows.length > 0) {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-100/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-400';
    groupHeader.innerHTML = `<span>⚡ Renewable Resources</span><span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">${renewableRows.length}</span>`;
    list.append(groupHeader);
    for (const entry of renewableRows) list.append(createResourceRow(entry));
  }

  if (otherRows.length > 0) {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sticky top-0 z-10 flex items-center justify-between border-b border-t border-slate-200 bg-slate-100/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-400';
    groupHeader.innerHTML = `<span>📦 Other Resources</span><span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">${otherRows.length}</span>`;
    list.append(groupHeader);
    for (const entry of otherRows) list.append(createResourceRow(entry));
  }

  view.append(list);
}

function starIcons(count) {
  const JUSTICE_STAR_SVG_PATH = 'm256.438 25.78-41.75 127.19 41.625 30 42.093-30.22-41.97-126.97zm-90.157 91.064c-16.33 0-29.374 13.043-29.374 29.375 0 16.33 13.044 29.374 29.375 29.374 16.333 0 29.345-13.044 29.345-29.375 0-16.333-13.012-29.376-29.344-29.376zm179.97.375c-16.332 0-29.375 13.042-29.375 29.374 0 16.33 13.043 29.344 29.375 29.344s29.375-13.013 29.375-29.344c0-16.332-13.043-29.375-29.375-29.375zM207.5 170.843c-5.795 9.65-14.895 17.124-25.688 20.844L197.595 241l2.062 6.438-5.47 3.968-49.06 35.813c5.772 7.404 9.438 16.525 10.06 26.436l59.658.28 6.75.033 2.094 6.405L243 379.188a47.585 47.585 0 0 1 13.78-2.032c4.652 0 9.145.69 13.408 1.938l19.5-58.97 2.093-6.405 6.75-.033 56.72-.156c.83-10.39 5.006-19.848 11.438-27.342l-48.032-35.22L313.22 247l2.092-6.406 15.625-48.5a48.443 48.443 0 0 1-26-21.03l-43.187 31.03-5.47 3.906-5.467-3.906-43.313-31.25zm-44.375 23.78-140.188.657 108.157 79 46.625-34-14.595-45.655zm186.53.25-14.5 45.032 46.876 34.344c.24-.117.48-.23.72-.344l107.188-78.625-140.282-.405zm-242.405 92.44c-16.332-.002-29.375 13.042-29.375 29.373 0 16.332 13.043 29.375 29.375 29.375s29.375-13.043 29.375-29.375c0-16.33-13.043-29.375-29.375-29.375zm295.875.686c-16.332 0-29.375 13.043-29.375 29.375s13.043 29.375 29.375 29.375 29.375-13.043 29.375-29.375S419.457 288 403.125 288zm-46.594 44.22-51.217.124-18.344 55.47 113.78 81.78-44.22-137.375zm-200.5.124-43.905 137.25 113.906-82.188-18-54.812-52-.25zm100.75 63.5c-16.33 0-29.374 13.043-29.374 29.375 0 16.33 13.044 29.374 29.375 29.374 16.333 0 29.376-13.044 29.376-29.375 0-16.333-13.043-29.376-29.375-29.376z';
  const wrap = document.createElement('span');
  wrap.className = 'inline-flex items-center gap-0.5';
  if (!Number.isInteger(count) || count < 1) {
    wrap.textContent = '—';
    return wrap;
  }
  wrap.setAttribute('aria-label', `${count} stars`);
  wrap.title = `${count} stars`;

  if (count >= 6) {
    const starSpan = document.createElement('span');
    starSpan.className = 'justice-star inline-flex items-center text-amber-400 leading-none drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)]';
    starSpan.innerHTML = `<svg class="size-4 inline-block fill-current align-middle" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="${JUSTICE_STAR_SVG_PATH}"/></svg>`;
    wrap.append(starSpan);
    return wrap;
  }

  const color = ['text-slate-400', 'text-green-500', 'text-blue-500',
    'text-violet-500', 'text-orange-400', 'text-amber-400'][Math.min(count, 6) - 1] || 'text-slate-400';
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

function createHeroInline(heroId, displayName, heroSnapshot, draftMode = false) {
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
  container.addEventListener('click', (e) => {
    if (!draftMode && typeof openHeroDialog === 'function') {
      e.stopPropagation();
      openHeroDialog(heroId, typeof currentCache !== 'undefined' ? currentCache : {});
    }
  });

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

  const nameRow = document.createElement('div');
  nameRow.className = 'flex items-center justify-between gap-1';

  const nameEl = document.createElement('div');
  nameEl.className = 'font-bold text-sm text-white truncate';
  nameEl.textContent = displayName;
  nameRow.append(nameEl);

  if (heroId) {
    const idBadge = document.createElement('span');
    idBadge.className = 'text-[10px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0';
    idBadge.textContent = `#${heroId}`;
    nameRow.append(idBadge);
  }

  infoCol.append(nameRow);

  const starsEl = document.createElement('div');
  starsEl.className = 'flex items-center gap-1 text-xs';
  if (Number.isInteger(starCount) && starCount >= 1) {
    starsEl.append(starIcons(starCount));
  } else {
    starsEl.className += ' text-slate-400';
    starsEl.textContent = 'Stars: —';
  }
  infoCol.append(starsEl);

  if (!draftMode) {
    const powerEl = document.createElement('div');
    powerEl.className = 'text-xs text-amber-300 font-medium tabular-nums';
    powerEl.textContent = Number.isFinite(heroSnapshot?.power) ?
      `⚡ Power: ${formatNumber(heroSnapshot.power)}` : 'Power: —';
    infoCol.append(powerEl);
  }

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

  const equipmentRank = globalThis.hwaHelperPopupData?.getHeroEquipmentRank?.(heroSnapshot?.color);
  if (equipmentRank) {
    const rankBox = document.createElement('div');
    rankBox.className = 'col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between';
    const rankLabel = document.createElement('span');
    rankLabel.className = 'text-slate-400 text-[10px] uppercase tracking-wider font-semibold';
    rankLabel.textContent = 'Equipment rank';
    const rankValue = document.createElement('span');
    rankValue.className = 'font-semibold text-xs';
    rankValue.style.color = equipmentRank.color;
    rankValue.style.textShadow = equipmentRank.textShadow;
    rankValue.textContent = equipmentRank.label;
    rankBox.append(rankLabel, rankValue);
    details.append(rankBox);
  }

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
      if (stat === 'Dodge') stat = 'Ddg';
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
    const glyphStats = globalThis.hwaHelperHeroGlyphs?.[heroId] || ['PA', 'Arm', 'HP', 'MD', 'Str'];
    const statFullName = {
      PA: 'Physical Attack', MA: 'Magic Attack', HP: 'Health', Arm: 'Armor',
      MD: 'Magic Defense', Crit: 'Crit Hit Chance', MCrit: 'Magic Crit Chance',
      Ddg: 'Dodge', Dodge: 'Dodge', AP: 'Armor Penetration', MP: 'Magic Penetration',
      Agi: 'Agility', Str: 'Strength', Int: 'Intelligence', Tough: 'Toughness', Crush: 'Crush'
    };
    heroRunes.forEach((lvl, idx) => {
      let stat = glyphStats[idx] || `G${idx + 1}`;
      if (stat === 'Dodge') stat = 'Ddg';
      const badge = document.createElement('span');
      badge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        lvl > 0 ? 'bg-slate-700/80 text-emerald-300' : 'bg-slate-800 text-slate-500'
      }`;
      badge.textContent = `${stat}: ${lvl}`;
      badge.title = `${statFullName[stat] || stat}: ${lvl}/40`;
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
      const artLvl = Number(art.level) || 0;
      const tierStyle = globalThis.hwaHelperPopupData?.getHeroArtifactTierStyle?.(artLvl) || {
        badge: 'bg-slate-700/80 text-slate-300 ring-1 ring-slate-600/60'
      };
      badge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tierStyle.badge}`;
      const name = typeAbbr[art.artifactType] || art.artifactType || 'Art';
      badge.textContent = `${name}: ${art.star || 0}★ Lv.${artLvl}`;
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

  const nameRow = document.createElement('div');
  nameRow.className = 'flex items-center justify-between gap-1';

  const nameEl = document.createElement('div');
  nameEl.className = 'font-bold text-sm text-white truncate';
  nameEl.textContent = displayName;
  nameRow.append(nameEl);

  if (titanId) {
    const idBadge = document.createElement('span');
    idBadge.className = 'text-[10px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0';
    idBadge.textContent = `#${titanId}`;
    nameRow.append(idBadge);
  }

  infoCol.append(nameRow);

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
    const displayHeading = ((heading === 'Hero ID' && activeTab === 'heroes') || (heading === 'Titan ID' && activeTab === 'titans')) ? 'Fav' : heading;
    button.textContent = `${displayHeading} ${selectedSort?.column === index ?
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
    if (activeTab === 'heroes') {
      line.className += ' cursor-pointer';
      line.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const heroId = values[0];
        if (typeof openHeroDialog === 'function') {
          openHeroDialog(heroId, typeof currentCache !== 'undefined' ? currentCache : {});
        }
      });
    }
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
        favBtn.dataset.heroId = heroId;
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

        wrap.append(favBtn);
        cell.append(wrap);
      } else if (heading === 'Titan ID' && activeTab === 'titans') {
        const titanId = String(value);
        const isThisFav = typeof favoriteTitans !== 'undefined' && favoriteTitans.has(titanId);
        const wrap = document.createElement('div');
        wrap.className = 'inline-flex items-center gap-1.5';

        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.dataset.titanId = titanId;
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

        wrap.append(favBtn);
        cell.append(wrap);
      } else if (heading === 'Name' && activeTab === 'heroes') {
        const heroId = values[0];
        const heroSnapshot = currentCache.heroGetAll?.data?.[heroId];
        cell.append(createHeroInline(heroId, String(value ?? '—'), heroSnapshot));
      } else if (heading === 'Equipment rank' && activeTab === 'heroes') {
        const equipmentRank = globalThis.hwaHelperPopupData?.getHeroEquipmentRank?.(value);
        if (equipmentRank) {
          const badge = document.createElement('span');
          badge.className = 'inline-block font-semibold';
          badge.textContent = equipmentRank.label;
          badge.style.color = equipmentRank.color;
          badge.style.textShadow = equipmentRank.textShadow;
          cell.append(badge);
        } else {
          cell.textContent = '—';
        }
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
  const recent = records.filter((record) => matches([record.endpoint, record.method, record.topic,
    record.direction, record.eventMethod, record.eventType]));
  if (logSort.value === 'oldest') recent.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  else if (logSort.value === 'duration-desc') recent.sort((a, b) => b.durationMs - a.durationMs);
  else if (logSort.value === 'duration-asc') recent.sort((a, b) => a.durationMs - b.durationMs);
  else recent.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  status.textContent = recordingState?.error ||
    `${records.length} entries this browser session · ${recordingState?.active ? 'Recording' : 'Stopped'}`;
  if (!recent.length) return showEmpty('No matching entries.');
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
    code.textContent = record.transport === 'websocket' ? record.direction :
      record.status === null ? record.outcome : String(record.status);
    const meta = document.createElement('span');
    meta.className = 'text-xs text-slate-500';
    meta.textContent = record.transport === 'websocket' ?
      `MQTT · QoS ${record.qos} · ${formatTime(record.timestamp)}` :
      `${record.transport} · ${record.durationMs} ms · ${formatTime(record.timestamp)}`;
    summary.append(method, code, meta);
    const endpoint = document.createElement('div');
    endpoint.className = 'mt-1 break-all text-xs text-slate-600';
    endpoint.textContent = record.transport === 'websocket' ?
      `${record.endpoint} · ${record.topic || '(topic alias)'}${record.eventType ? ` · ${record.eventType}` : ''}` : record.endpoint;
    row.append(summary, endpoint);
    if (record.transport === 'websocket') {
      const details = document.createElement('details');
      details.className = 'mt-2';
      const title = document.createElement('summary');
      title.className = 'cursor-pointer text-blue-700';
      title.textContent = `MQTT payload (${record.encoding}${record.payloadTruncated ? ', truncated' : ''}; ${record.payloadBytes} bytes)`;
      const body = document.createElement('pre');
      body.className = 'mt-2 max-h-44 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap break-all text-xs';
      body.textContent = record.payload || '(empty payload)';
      details.append(title, body);
      row.append(details);
    } else if (record.method === 'POST') {
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
  const getLabel = (group) => {
    const meta = globalThis.hwaHelperPopupData?.getItemCategoryMeta?.(group);
    return meta ? `${meta.label} (${group})` : group;
  };
  for (const [value, label] of [['', 'All groups'],
    ...Object.keys(data ?? {}).sort().map((group) => [group, getLabel(group)])]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    itemGroup.append(option);
  }
  itemGroup.value = [...itemGroup.options].some((option) => option.value === selected) ? selected : '';
}

function renderInventoryGrid(cache) {
  const entry = cache.inventoryGet;
  if (!entry?.data) {
    if (tableExportBtn) tableExportBtn.hidden = true;
    status.textContent = 'No cached data yet. Use the game to observe RPCs.';
    showEmpty('No matching RPC observed yet.');
    return;
  }

  const selectedGroup = itemGroup.value;
  const groups = Object.entries(entry.data)
    .filter(([category]) => !selectedGroup || category === selectedGroup)
    .map(([category, items]) => {
      const meta = globalThis.hwaHelperPopupData?.getItemCategoryMeta?.(category) || {
        order: 100,
        label: category,
        icon: '📦'
      };
      const itemList = Object.entries(items ?? {})
        .map(([id, quantity]) => {
          const name = globalThis.hwaHelperNameMap?.item?.(category, id) || '—';
          return {
            id,
            category,
            name,
            amount: Number(quantity) || 0
          };
        })
        .filter((it) => matches([category, it.id, it.name, it.amount]))
        .sort((a, b) => Number(a.id) - Number(b.id));

      return {
        category,
        order: meta.order,
        label: meta.label,
        icon: meta.icon,
        items: itemList
      };
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);
  status.textContent = `${totalItems} items across ${groups.length} groups · Updated ${formatTime(entry.updatedAt)}`;
  if (tableExportBtn) tableExportBtn.hidden = totalItems === 0;

  if (totalItems === 0) {
    showEmpty('No rows match the filter.');
    return;
  }

  const getItemAbbr = globalThis.hwaHelperPopupData?.getItemAbbr || ((name, id) => id ? `#${id}` : '');

  const container = document.createElement('div');
  container.className = 'space-y-4 p-2';

  for (const group of groups) {
    const groupSection = document.createElement('section');
    groupSection.className = 'space-y-2';

    // Group Divider Header
    const header = document.createElement('div');
    header.className = 'flex items-center gap-2 border-b border-slate-200 pb-1.5 pt-1';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'text-sm select-none';
    iconSpan.textContent = group.icon;

    const title = document.createElement('h3');
    title.className = 'text-xs font-bold text-slate-800 uppercase tracking-wide';
    title.textContent = group.label;

    const countBadge = document.createElement('span');
    countBadge.className = 'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 tabular-nums';
    countBadge.textContent = String(group.items.length);

    header.append(iconSpan, title, countBadge);
    groupSection.append(header);

    // Borderless Inventory Grid
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2';

    for (const item of group.items) {
      const tile = document.createElement('div');
      tile.className = 'relative aspect-square rounded-xl bg-slate-800 flex items-center justify-center p-1 select-none overflow-hidden ring-1 ring-slate-700/60 hover:ring-2 hover:ring-blue-400 hover:scale-105 transition-all shadow-xs cursor-default';
      const fullName = (item.name && item.name !== '—') ? item.name : `${group.label} #${item.id}`;
      const tooltipText = `${fullName} (${group.label} #${item.id})\nQuantity: ${formatNumber(item.amount)}`;
      tile.setAttribute('title', tooltipText);
      setResourceTooltip(tile, tooltipText);

      // Visual Content
      let itemImgSrc = null;
      if (item.category === 'fragmentHero') {
        itemImgSrc = `assets/heroes/${item.id}.webp`;
      } else if (item.category === 'fragmentTitan') {
        itemImgSrc = `assets/titans/${item.id}.png`;
      } else if (item.category === 'gear' || item.category === 'fragmentGear') {
        itemImgSrc = `assets/items/gear/${item.id}.png`;
      } else if (item.category === 'consumable') {
        itemImgSrc = `assets/items/consumable/${item.id}.png`;
      } else if (item.category === 'scroll' || item.category === 'fragmentScroll') {
        itemImgSrc = `assets/items/scroll/${item.id}.png`;
      } else if (item.category === 'fragmentArtifact') {
        itemImgSrc = `assets/items/fragmentArtifact/${item.id}.png`;
      } else if (item.category === 'artifact') {
        itemImgSrc = `assets/items/artifact/${item.id}.png`;
      } else if (item.category === 'coin') {
        itemImgSrc = `assets/items/coin/${item.id}.png`;
      }

      const showFallbackIcon = () => {
        const icon = document.createElement('span');
        icon.className = 'text-2xl select-none drop-shadow-sm opacity-85 pointer-events-none';
        icon.textContent = group.icon;
        tile.append(icon);
      };

      if (itemImgSrc) {
        const img = document.createElement('img');
        img.src = itemImgSrc;
        img.alt = fullName;
        img.className = 'size-full object-cover rounded-lg pointer-events-none';
        img.onerror = () => {
          if (item.category === 'fragmentHero') {
            img.src = `assets/heroes/${item.id}.png`;
            img.onerror = () => {
              img.style.display = 'none';
              showFallbackIcon();
            };
          } else if (item.category === 'fragmentArtifact') {
            // Fallback to corresponding artifact image if separate fragment is not found
            img.src = `assets/items/artifact/${item.id}.png`;
            img.onerror = () => {
              img.style.display = 'none';
              showFallbackIcon();
            };
          } else {
            img.style.display = 'none';
            showFallbackIcon();
          }
        };
        tile.append(img);
      } else {
        showFallbackIcon();
      }

      // Small abbreviated name at top-left
      const abbrSpan = document.createElement('span');
      abbrSpan.className = 'absolute top-1 left-1.5 text-[9px] font-black uppercase text-amber-300 drop-shadow-md tracking-tight leading-none truncate max-w-[80%] pointer-events-none';
      abbrSpan.textContent = getItemAbbr(item.name, item.id);
      tile.append(abbrSpan);

      // Small quantity at bottom-right
      const qtySpan = document.createElement('span');
      qtySpan.className = 'absolute bottom-1 right-1 text-[10px] font-bold text-white tabular-nums bg-slate-950/85 rounded px-1 leading-tight shadow-xs border border-white/10 pointer-events-none';
      qtySpan.textContent = formatNumber(item.amount);
      tile.append(qtySpan);

      grid.append(tile);
    }

    groupSection.append(grid);
    container.append(groupSection);
  }

  view.append(container);
}

let localDraftDefencePicks = [null, null, null, null, null];
let localDraftAttackPicks = [null, null, null, null, null];
let activeDraftStep = 0;
let draftViewMode = null; // 'defense' or 'attack'
let lastRenderedMatchId = null;
let lastRenderedStageId = null;
let draftStepCandidates = {
  matchId: null,
  defense: globalThis.hwaHelperPopupData.defaultDraftCandidates('defense'),
  attack: globalThis.hwaHelperPopupData.defaultDraftCandidates('attack')
};
let storedDraftStepCandidates = null;

try {
  chrome.storage?.local?.get?.('draftStepCandidates')?.then?.((res) => {
    storedDraftStepCandidates = res?.draftStepCandidates || null;
    if (storedDraftStepCandidates?.matchId === lastRenderedMatchId && lastRenderedMatchId) {
      if (Array.isArray(storedDraftStepCandidates.defense)) draftStepCandidates.defense = storedDraftStepCandidates.defense;
      if (Array.isArray(storedDraftStepCandidates.attack)) draftStepCandidates.attack = storedDraftStepCandidates.attack;
      draftStepCandidates.matchId = lastRenderedMatchId;
    }
  });
} catch (_) {}

let activeHeroSwapTarget = null;
let selectedRoleFilter = 'all';

function renderDraft(cache, target = view) {
  const draft = cache.legendDraftStatus?.data || {};
  const observedMatchId = draft.matchId ?? draft.lastResult?.matchId;
  const observedChoices = globalThis.hwaHelperPopupData.observedDraftChoices(observedMatchId);
  const draftSnapshot = (mode, heroId) => {
    const star = draft[`${mode}Stars`]?.[heroId];
    return Number.isInteger(star) ? { star } : null;
  };

  const stageId = Number.isInteger(draft.stageId) ? draft.stageId : 0;
  const isDefenseStage = stageId === 2 || stageId === 3;
  const isAttackStage = stageId === 4;
  const isReady = stageId === 5;
  const isSearching = stageId === 1;
  const isMatchCompleted = (stageId === 0 || stageId === 7) && Boolean(draft.lastResult);

  // Reset local picks when entering a new match
  if (draft.matchId && draft.matchId !== lastRenderedMatchId) {
    lastRenderedMatchId = draft.matchId;
    lastRenderedStageId = stageId;
    localDraftDefencePicks = [null, null, null, null, null];
    localDraftAttackPicks = [null, null, null, null, null];
    activeHeroSwapTarget = null;
    draftViewMode = isAttackStage ? 'attack' : 'defense';
    activeDraftStep = 0;
  } else if (!draft.matchId && !draft.active) {
    lastRenderedMatchId = null;
    lastRenderedStageId = null;
  }
  if (Array.isArray(cache.legendDraft?.candidates) && cache.legendDraft.candidates.length >= 15) {
    const pool = cache.legendDraft.candidates;
    const stepCount = 5;
    const perStep = Math.floor(pool.length / stepCount);
    const steps = [];
    for (let s = 0; s < stepCount; s++) {
      steps.push(pool.slice(s * perStep, (s + 1) * perStep));
    }
    draftStepCandidates = {
      matchId: draft.matchId || 'hooked',
      defense: steps,
      attack: steps
    };
  } else if (observedChoices) {
    draftStepCandidates = {
      matchId: observedMatchId,
      defense: observedChoices.defense || globalThis.hwaHelperPopupData.defaultDraftCandidates('defense'),
      attack: observedChoices.attack || globalThis.hwaHelperPopupData.defaultDraftCandidates('attack')
    };
  } else if (draft.matchId && draftStepCandidates.matchId !== draft.matchId) {
    draftStepCandidates = {
      matchId: draft.matchId,
      defense: storedDraftStepCandidates?.matchId === draft.matchId && Array.isArray(storedDraftStepCandidates.defense) ?
        storedDraftStepCandidates.defense : globalThis.hwaHelperPopupData.defaultDraftCandidates('defense'),
      attack: storedDraftStepCandidates?.matchId === draft.matchId && Array.isArray(storedDraftStepCandidates.attack) ?
        storedDraftStepCandidates.attack : globalThis.hwaHelperPopupData.defaultDraftCandidates('attack')
    };
  }

  // A mode is only locked if it was explicitly submitted in this match, or the server advanced past it
  const isDefenseLocked = !isDefenseStage ? Boolean(
    stageId >= 4 ||
    (isMatchCompleted && Array.isArray(draft.lastResult?.defenceHeroes) && draft.lastResult.defenceHeroes.length === 5) ||
    (Array.isArray(draft.defenceHeroes) && draft.defenceHeroes.length === 5)
  ) : Boolean(
    Array.isArray(draft.defenceHeroes) && draft.defenceHeroes.length === 5 && draft.lastPickAction === 'saveDefence' &&
    !(draft.lastError && draft.lastErrorAction === 'saveDefence')
  );

  const isAttackLocked = !isAttackStage ? Boolean(
    stageId >= 5 ||
    (isMatchCompleted && Array.isArray(draft.lastResult?.attackHeroes) && draft.lastResult.attackHeroes.length === 5) ||
    (Array.isArray(draft.attackHeroes) && draft.attackHeroes.length === 5)
  ) : Boolean(
    Array.isArray(draft.attackHeroes) && draft.attackHeroes.length === 5 && draft.lastPickAction === 'saveAttack' &&
    !(draft.lastError && draft.lastErrorAction === 'saveAttack')
  );

  if (isDefenseLocked) {
    const src = (draft.defenceHeroes?.length === 5 ? draft.defenceHeroes : draft.lastResult?.defenceHeroes) || [];
    if (src.length === 5) localDraftDefencePicks = [...src];
  }
  if (isAttackLocked) {
    const src = (draft.attackHeroes?.length === 5 ? draft.attackHeroes : draft.lastResult?.attackHeroes) || [];
    if (src.length === 5) localDraftAttackPicks = [...src];
  }

  // Auto-switch viewMode when stage changes
  if (stageId !== lastRenderedStageId) {
    lastRenderedStageId = stageId;
    if (isAttackStage && !isAttackLocked) {
      draftViewMode = 'attack';
      activeDraftStep = globalThis.hwaHelperPopupData.getDraftActiveStep(localDraftAttackPicks);
    } else if (isDefenseStage && !isDefenseLocked) {
      draftViewMode = 'defense';
      activeDraftStep = globalThis.hwaHelperPopupData.getDraftActiveStep(localDraftDefencePicks);
    }
  }

  // Determine active view mode (toggle takes priority, else match stage)
  if (!draftViewMode) {
    draftViewMode = isAttackStage ? 'attack' : 'defense';
  }
  const isViewingAttack = draftViewMode === 'attack';

  const currentPicks = isViewingAttack ? localDraftAttackPicks : localDraftDefencePicks;
  while (currentPicks.length < 5) currentPicks.push(null);

  const val = globalThis.hwaHelperPopupData.validateDraftPicks(currentPicks);
  const isModeLocked = isViewingAttack ? isAttackLocked : isDefenseLocked;

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

  if (Array.isArray(cache.legendDraft?.candidates) && cache.legendDraft.candidates.length >= 15) {
    const hookBadge = document.createElement('div');
    hookBadge.className = 'text-2xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md px-2 py-0.5 inline-flex items-center gap-1';
    hookBadge.innerHTML = `<span>🧠 Unity Hook: ${cache.legendDraft.candidates.length} pool candidates</span>`;
    stageCol.append(hookBadge);
  }

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

  if (!popupRpcEnabled) {
    const rpcAlert = document.createElement('div');
    rpcAlert.className = 'mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-center justify-between gap-2';
    rpcAlert.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-base leading-none">⚠️</span>
        <span>Popup RPC is currently disabled. Enable it to submit your Legend Draft lineup.</span>
      </div>
    `;
    const enableBtn = document.createElement('button');
    enableBtn.type = 'button';
    enableBtn.className = 'px-2.5 py-1 rounded bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 cursor-pointer shrink-0';
    enableBtn.textContent = 'Enable Popup RPC';
    enableBtn.addEventListener('click', async () => {
      popupRpcEnabled = true;
      await chrome.storage?.local?.set?.({ popupRpcEnabled: true });
      render();
    });
    rpcAlert.append(enableBtn);
    headerCard.append(rpcAlert);
  } else if (currentRpcPolicy?.mode !== 'direct') {
    const modeAlert = document.createElement('div');
    modeAlert.className = 'mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900 flex items-center justify-between gap-2';
    modeAlert.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-base leading-none">⚡</span>
        <span>Recommended: Switch to <strong>Direct RPC</strong> to submit your lineup immediately (avoids delays from native game queues).</span>
      </div>
    `;
    const switchDirectBtn = document.createElement('button');
    switchDirectBtn.type = 'button';
    switchDirectBtn.className = 'px-2.5 py-1 rounded bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 cursor-pointer shrink-0';
    switchDirectBtn.textContent = 'Switch to Direct RPC';
    switchDirectBtn.addEventListener('click', async () => {
      currentRpcPolicy = { ...currentRpcPolicy, mode: 'direct' };
      await chrome.storage?.local?.set?.({ socketRefreshMode: 'direct' });
      render();
    });
    modeAlert.append(switchDirectBtn);
    headerCard.append(modeAlert);
  }

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
      const heroSnap = draftSnapshot('enemyDefence', heroId);
      const slot = document.createElement('div');
      slot.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white shadow-xs';
      slot.append(createHeroInline(heroId, heroMeta.name || globalThis.hwaHelperNameMap.hero(heroId) || `#${heroId}`, heroSnap, true));
      enemySlotRow.append(slot);
    }
    enemyLineupCard.append(enemySlotRow);
    if (observedChoices?.enemyDefence) {
      const observedPicks = document.createElement('div');
      observedPicks.className = 'flex flex-wrap gap-2 text-[11px] text-amber-900';
      observedChoices.enemyDefence.forEach((choices, step) => {
        const position = choices.findIndex(Number.isInteger);
        if (position < 0) return;
        const heroId = choices[position];
        const label = document.createElement('span');
        label.className = 'rounded border border-amber-200 bg-white px-2 py-1';
        label.textContent = `Step ${step + 1}, choice ${position + 1}: ${globalThis.hwaHelperHeroMetadata?.[heroId]?.name || `#${heroId}`}`;
        observedPicks.append(label);
      });
      enemyLineupCard.append(observedPicks);
    }
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
      const heroSnap = draftSnapshot('enemyAttack', heroId);
      const slot = document.createElement('div');
      slot.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white shadow-xs';
      slot.append(createHeroInline(heroId, heroMeta.name || globalThis.hwaHelperNameMap.hero(heroId) || `#${heroId}`, heroSnap, true));
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

  const teamHeaderActions = document.createElement('div');
  teamHeaderActions.className = 'flex items-center gap-2';

  // Lock action button or locked badge
  if (isActivelyDrafting) {
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = val.valid && popupRpcEnabled ?
      'cursor-pointer px-4 py-1.5 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all' :
      'px-4 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-400 cursor-not-allowed border border-slate-200';
    lockBtn.disabled = !val.valid || !popupRpcEnabled;
    lockBtn.textContent = popupRpcEnabled ?
      (isViewingAttack ? 'Lock Attack Lineup (5 Heroes)' : 'Lock Defense Lineup (5 Heroes)') :
      'Enable popup RPC calls to submit';
    if (val.valid && popupRpcEnabled) {
      lockBtn.addEventListener('click', () => {
        lockBtn.disabled = true;
        lockBtn.textContent = 'Submitting...';
        const action = isViewingAttack ? 'saveAttack' : 'saveDefence';
        chrome.runtime?.sendMessage?.({ kind: 'draft-action', action, heroes: val.heroes }, (response) => {
          if (!response?.ok) {
            lockBtn.disabled = false;
            lockBtn.textContent = response?.error || 'Could not submit lineup';
          } else if (response.queued) lockBtn.textContent = 'Queued for next game RPC...';
          else setTimeout(render, 500);
        });
      });
    }
    teamHeaderActions.append(lockBtn);
  } else if (isModeLocked) {
    const lockedTag = document.createElement('span');
    lockedTag.className = 'px-3 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 flex items-center gap-1';
    lockedTag.textContent = '✓ Lineup successfully locked';
    teamHeaderActions.append(lockedTag);
  }
  teamHeader.append(teamHeaderActions);
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
      const heroSnap = draftSnapshot(isViewingAttack ? 'attack' : 'defence', heroId);
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
      if (Number.isInteger(heroSnap?.star)) {
        const starLabel = document.createElement('span');
        starLabel.className = 'text-[10px] font-bold text-amber-700';
        starLabel.textContent = heroSnap.star >= 6 ? '★6' : `★${heroSnap.star}`;
        heroWrapper.append(starLabel);
      }

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

  // Step-by-step hero picker form when lineup is not locked
  if (!isModeLocked) {
    if (draft.lastError && (draft.lastErrorAction === (isViewingAttack ? 'saveAttack' : 'saveDefence'))) {
      const errorAlert = document.createElement('div');
      errorAlert.className = 'rounded-xl border border-red-300 bg-red-50/90 p-3 text-xs text-red-900 flex items-start gap-2.5';
      errorAlert.innerHTML = `
        <span class="text-base leading-none">❌</span>
        <div class="space-y-0.5">
          <div class="font-bold">Server rejected lineup: "${draft.lastError}"${draft.lastErrorCode ? ` (Error code: ${draft.lastErrorCode})` : ''}</div>
          <div class="text-[11px] text-red-800">
            In Legend Draft, the server only accepts heroes offered in the 3 choices for each step (Step 1 → Step 5) shown on screen. The submitted lineup contains an invalid hero. Please consult the game screen to select the matching hero for each step.
          </div>
        </div>
      `;
      teamSection.append(errorAlert);
    }

    if (!observedChoices) {
      const unprobedAlert = document.createElement('div');
      unprobedAlert.className = 'rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2.5';
      unprobedAlert.innerHTML = `
        <span class="text-base leading-none">⚠️</span>
        <div class="space-y-0.5">
          <div class="font-bold">Offered heroes not found in game payload (encrypted draft payload).</div>
          <div class="text-[11px] text-amber-800">
            The 15 offered heroes are processed within the game client. The server only accepts heroes from the 3 choices for each step (Step 1 → Step 5) displayed on screen. Please consult the game screen to select the corresponding hero for each step before locking and submitting.
          </div>
        </div>
      `;
      teamSection.append(unprobedAlert);
    }

    const pickerCard = document.createElement('div');
    pickerCard.className = 'rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-3';

    // Step Switcher Toolbar
    const pickerTop = document.createElement('div');
    pickerTop.className = 'flex items-center justify-between flex-wrap gap-2';

    const pickerTitle = document.createElement('div');
    pickerTitle.className = 'text-xs font-bold text-slate-800 flex items-center gap-1.5';
    pickerTitle.innerHTML = `<span>🎯 Select Hero for <strong>Step ${activeDraftStep + 1}</strong>:</span> <span class="text-[11px] font-normal text-slate-500">(${isViewingAttack ? 'Attack Lineup' : 'Defense Lineup'})</span>`;
    pickerTop.append(pickerTitle);

    const stepPills = document.createElement('div');
    stepPills.className = 'inline-flex rounded-lg border border-slate-200 bg-white p-0.5 gap-1';
    for (let s = 0; s < 5; s++) {
      const pill = document.createElement('button');
      pill.type = 'button';
      const isSActive = activeDraftStep === s;
      const isSPicked = Boolean(currentPicks[s]);
      pill.className = `px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
        isSActive ? 'bg-blue-600 text-white shadow-xs' :
        isSPicked ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' :
        'text-slate-600 hover:bg-slate-100'
      }`;
      pill.textContent = isSPicked ? `Step ${s + 1} ✓` : `Step ${s + 1}`;
      pill.addEventListener('click', () => {
        activeDraftStep = s;
        render();
      });
      stepPills.append(pill);
    }
    pickerTop.append(stepPills);
    pickerCard.append(pickerTop);

    // Filter toolbar: Search input + Role filter buttons
    const filterRow = document.createElement('div');
    filterRow.className = 'flex items-center gap-2 flex-wrap';

    const searchInp = document.createElement('input');
    searchInp.type = 'text';
    searchInp.placeholder = 'Search hero by name, role, ID...';
    searchInp.className = 'flex-1 min-w-[150px] px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';

    const roleChips = document.createElement('div');
    roleChips.className = 'flex items-center gap-1 flex-wrap';
    const roles = ['all', 'Tank', 'Warrior', 'Marksman', 'Mage', 'Support', 'Control'];
    roles.forEach(r => {
      const rBtn = document.createElement('button');
      rBtn.type = 'button';
      const isActiveRole = selectedRoleFilter === r.toLowerCase();
      rBtn.className = `px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
        isActiveRole ?
        'bg-slate-800 text-white' :
        'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
      }`;
      rBtn.textContent = r === 'all' ? 'All' : r;
      rBtn.addEventListener('click', () => {
        selectedRoleFilter = r.toLowerCase();
        renderHeroGrid(searchInp.value);
      });
      roleChips.append(rBtn);
    });
    filterRow.append(searchInp, roleChips);

    // Hero List Grid
    const heroGrid = document.createElement('div');
    heroGrid.className = 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[260px] overflow-y-auto p-1.5 border border-slate-200/80 rounded-lg bg-white';

    const allHeroes = Object.entries(globalThis.hwaHelperHeroMetadata || {}).map(([id, meta]) => ({
      id: Number(id),
      meta,
      snap: draftSnapshot(isViewingAttack ? 'attack' : 'defence', id)
    })).filter(h => Number.isInteger(h.id) && h.id < 1000)
      .sort((a, b) => (a.meta.name || '').localeCompare(b.meta.name || ''));

    function renderHeroGrid(query = '') {
      heroGrid.replaceChildren();
      const q = query.trim().toLowerCase();
      const filtered = allHeroes.filter(({ id: hId, meta }) => {
        if (selectedRoleFilter !== 'all' && (meta.role || '').toLowerCase() !== selectedRoleFilter) {
          return false;
        }
        if (!q) return true;
        const name = (meta.name || globalThis.hwaHelperNameMap.hero(hId) || '').toLowerCase();
        const role = (meta.role || '').toLowerCase();
        return name.includes(q) || role.includes(q) || String(hId).includes(q);
      });

      if (filtered.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'col-span-full py-4 text-center text-xs text-slate-400';
        emptyMsg.textContent = 'No heroes match the filter';
        heroGrid.append(emptyMsg);
        return;
      }

      for (const { id: hId, meta, snap } of filtered) {
        const alreadyPickIdx = currentPicks.findIndex(p => p === hId);
        const isAlreadyPickedInOtherStep = alreadyPickIdx !== -1 && alreadyPickIdx !== activeDraftStep;
        const isCurrentStepPick = currentPicks[activeDraftStep] === hId;

        const heroBtn = document.createElement('button');
        heroBtn.type = 'button';
        heroBtn.disabled = isAlreadyPickedInOtherStep;
        heroBtn.className = `flex items-center gap-2 p-1.5 rounded-lg border text-left text-xs transition-all ${
          isCurrentStepPick ?
            'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400 font-bold' :
          isAlreadyPickedInOtherStep ?
            'border-slate-200 bg-slate-100/70 text-slate-400 cursor-not-allowed opacity-60' :
            'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/60 cursor-pointer'
        }`;

        const avPath = meta.avatarFile || (meta.hasAvatar ? `assets/heroes/${hId}.webp` : null);
        const glow = starGlowClass(snap?.star, false);
        if (avPath) {
          const img = document.createElement('img');
          img.src = avPath;
          img.className = `size-7 rounded-full object-cover shrink-0 ${glow}`;
          heroBtn.append(img);
        } else {
          heroBtn.append(createInitialsBadge(meta.name || `#${hId}`, meta.faction, false));
        }

        const textCol = document.createElement('div');
        textCol.className = 'min-w-0 flex-1';
        const nameRow = document.createElement('div');
        nameRow.className = 'truncate text-[11px] font-bold text-slate-800';
        nameRow.textContent = meta.name || globalThis.hwaHelperNameMap.hero(hId) || `#${hId}`;
        textCol.append(nameRow);

        const subRow = document.createElement('div');
        subRow.className = 'text-[9px] text-slate-500 truncate';
        if (isAlreadyPickedInOtherStep) {
          subRow.textContent = `Selected (Step ${alreadyPickIdx + 1})`;
          subRow.className = 'text-[9px] text-amber-700 font-medium truncate';
        } else if (isCurrentStepPick) {
          subRow.textContent = '✓ Selected';
          subRow.className = 'text-[9px] text-emerald-700 font-bold truncate';
        } else {
          subRow.textContent = meta.role || (snap?.star ? `★${snap.star}` : '');
        }
        textCol.append(subRow);
        heroBtn.append(textCol);

        if (!isAlreadyPickedInOtherStep) {
          heroBtn.addEventListener('click', () => {
            currentPicks[activeDraftStep] = hId;
            const nextEmpty = currentPicks.findIndex((p) => !p);
            if (nextEmpty !== -1) {
              activeDraftStep = nextEmpty;
            }
            render();
          });
        }

        heroGrid.append(heroBtn);
      }
    }

    searchInp.addEventListener('input', (e) => renderHeroGrid(e.target.value));
    renderHeroGrid('');

    // Check if candidates for the active step are known (e.g. from observedChoices or hook)
    const activeCandidatesMode = isViewingAttack ? 'attack' : 'defense';
    const activeCurrentCandidates = observedChoices?.[activeCandidatesMode] || draftStepCandidates?.[activeCandidatesMode];
    const activeStepCandidates = (activeCurrentCandidates?.[activeDraftStep] || []).filter((id) => Number.isInteger(id) && id > 0);
    const hasStepCandidates = activeStepCandidates.length > 0;

    if (hasStepCandidates) {
      const stepCandidatesWrap = document.createElement('div');
      stepCandidatesWrap.className = 'space-y-2';

      const stepCandidatesHead = document.createElement('div');
      stepCandidatesHead.className = 'flex items-center justify-between text-xs pb-1';
      stepCandidatesHead.innerHTML = `
        <span class="font-bold text-slate-800 flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-blue-600"></span>
          <span>3 Choices for Step ${activeDraftStep + 1} (Pick 1 of 3):</span>
        </span>
        <span class="text-[11px] text-blue-600 font-semibold">Click to select & advance step</span>
      `;
      stepCandidatesWrap.append(stepCandidatesHead);

      const candidateCardsGrid = document.createElement('div');
      candidateCardsGrid.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2.5';

      activeStepCandidates.forEach((cHeroId, cIdx) => {
        const meta = globalThis.hwaHelperHeroMetadata?.[cHeroId] || {};
        const snap = draftSnapshot(isViewingAttack ? 'attack' : 'defence', cHeroId);
        const isChosen = currentPicks[activeDraftStep] === cHeroId;
        const alreadyPickIdx = currentPicks.findIndex((p) => p === cHeroId);
        const isPickedInOtherStep = alreadyPickIdx !== -1 && alreadyPickIdx !== activeDraftStep;

        const card = document.createElement('div');
        card.className = `flex flex-col items-center justify-between p-3 rounded-xl border transition-all text-center relative ${
          isChosen ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400 shadow-sm' :
          isPickedInOtherStep ? 'border-slate-200 bg-slate-100/70 text-slate-400 opacity-60' :
          'border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs cursor-pointer'
        }`;

        const cardTop = document.createElement('div');
        cardTop.className = 'w-full flex items-center justify-between mb-1 text-[10px]';
        const tag = document.createElement('span');
        tag.className = 'font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600';
        tag.textContent = `Choice #${cIdx + 1}`;
        cardTop.append(tag);

        if (Number.isInteger(snap?.star)) {
          const starTag = document.createElement('span');
          starTag.className = 'font-bold text-amber-700';
          starTag.textContent = snap.star >= 6 ? '★6' : `★${snap.star}`;
          cardTop.append(starTag);
        }
        card.append(cardTop);

        const avWrap = document.createElement('div');
        avWrap.className = 'my-1';
        const aPath = meta.avatarFile || (meta.hasAvatar ? `assets/heroes/${cHeroId}.webp` : null);
        const cardGlow = starGlowClass(snap?.star, false);
        if (aPath) {
          const aImg = document.createElement('img');
          aImg.src = aPath;
          aImg.className = `size-12 rounded-full object-cover shrink-0 ${cardGlow}`;
          avWrap.append(aImg);
        } else {
          avWrap.append(createInitialsBadge(meta.name || `#${cHeroId}`, meta.faction, true));
        }
        card.append(avWrap);

        const nameDiv = document.createElement('div');
        nameDiv.className = 'text-xs font-bold text-slate-900 truncate max-w-[120px]';
        nameDiv.textContent = meta.name || globalThis.hwaHelperNameMap.hero(cHeroId) || `#${cHeroId}`;
        card.append(nameDiv);

        if (meta.role) {
          const roleBadge = document.createElement('span');
          roleBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium my-1';
          roleBadge.textContent = meta.role;
          card.append(roleBadge);
        }

        const pickActionBtn = document.createElement('button');
        pickActionBtn.type = 'button';
        pickActionBtn.disabled = isPickedInOtherStep;
        pickActionBtn.className = isChosen ?
          'mt-2 w-full py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs' :
          isPickedInOtherStep ?
          'mt-2 w-full py-1.5 rounded-lg text-xs font-semibold bg-slate-200 text-slate-500 cursor-not-allowed' :
          'mt-2 w-full py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-xs';
        pickActionBtn.textContent = isChosen ? '✓ Selected' : (isPickedInOtherStep ? `Selected in Step ${alreadyPickIdx + 1}` : 'Pick this Hero');

        const handlePick = () => {
          if (isPickedInOtherStep) return;
          currentPicks[activeDraftStep] = cHeroId;
          const nextEmpty = currentPicks.findIndex((p, idx) => idx > activeDraftStep && !p);
          if (nextEmpty !== -1) {
            activeDraftStep = nextEmpty;
          } else {
            const anyEmpty = currentPicks.findIndex((p) => !p);
            if (anyEmpty !== -1) activeDraftStep = anyEmpty;
          }
          render();
        };

        if (!isPickedInOtherStep) {
          card.addEventListener('click', handlePick);
          pickActionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePick();
          });
        }
        card.append(pickActionBtn);
        candidateCardsGrid.append(card);
      });

      stepCandidatesWrap.append(candidateCardsGrid);
      pickerCard.append(stepCandidatesWrap);

      const manualDetails = document.createElement('details');
      manualDetails.className = 'pt-1 border-t border-slate-200/80 text-xs';
      const manualSummary = document.createElement('summary');
      manualSummary.className = 'cursor-pointer text-slate-500 hover:text-slate-800 font-medium py-1 select-none';
      manualSummary.textContent = '🔍 Or search and pick another hero (Manual / Custom)...';
      manualDetails.append(manualSummary);
      manualDetails.append(filterRow, heroGrid);
      pickerCard.append(manualDetails);
    } else {
      pickerCard.append(filterRow, heroGrid);
    }

    // Bottom Action Bar: Clear step pick + Submit Button
    const bottomBar = document.createElement('div');
    bottomBar.className = 'flex items-center justify-between flex-wrap gap-2 pt-1 text-xs';

    const clearBtnsGroup = document.createElement('div');
    clearBtnsGroup.className = 'flex items-center gap-2';

    if (currentPicks[activeDraftStep]) {
      const clearStepBtn = document.createElement('button');
      clearStepBtn.type = 'button';
      clearStepBtn.className = 'px-2.5 py-1 rounded-md text-[11px] text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 cursor-pointer';
      clearStepBtn.textContent = `Clear Step ${activeDraftStep + 1}`;
      clearStepBtn.addEventListener('click', () => {
        currentPicks[activeDraftStep] = null;
        render();
      });
      clearBtnsGroup.append(clearStepBtn);
    }

    if (currentPicks.some(Boolean)) {
      const resetAllBtn = document.createElement('button');
      resetAllBtn.type = 'button';
      resetAllBtn.className = 'px-2.5 py-1 rounded-md text-[11px] text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer';
      resetAllBtn.textContent = 'Reset All 5 Steps';
      resetAllBtn.addEventListener('click', () => {
        if (isViewingAttack) localDraftAttackPicks = [null, null, null, null, null];
        else localDraftDefencePicks = [null, null, null, null, null];
        activeDraftStep = 0;
        render();
      });
      clearBtnsGroup.append(resetAllBtn);
    }
    bottomBar.append(clearBtnsGroup);

    if (val.valid && isActivelyDrafting) {
      const submitDirectBtn = document.createElement('button');
      submitDirectBtn.type = 'button';
      submitDirectBtn.className = popupRpcEnabled ?
        'px-4 py-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm cursor-pointer' :
        'px-4 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-400 cursor-not-allowed border border-slate-200';
      submitDirectBtn.disabled = !popupRpcEnabled;
      submitDirectBtn.textContent = popupRpcEnabled ?
        `✓ Lock & Submit ${isViewingAttack ? 'Attack Lineup' : 'Defense Lineup'} (5/5 Heroes)` :
        'Enable Popup RPC to Submit';
      if (popupRpcEnabled) {
        submitDirectBtn.addEventListener('click', () => {
          submitDirectBtn.disabled = true;
          submitDirectBtn.textContent = 'Submitting...';
          const action = isViewingAttack ? 'saveAttack' : 'saveDefence';
          chrome.runtime?.sendMessage?.({ kind: 'draft-action', action, heroes: val.heroes }, (response) => {
            if (!response?.ok) {
              submitDirectBtn.disabled = false;
              submitDirectBtn.textContent = response?.error || 'Could not submit lineup';
            } else if (response.queued) submitDirectBtn.textContent = 'Queued for next game RPC...';
            else setTimeout(render, 500);
          });
        });
      }
      bottomBar.append(submitDirectBtn);
    }

    pickerCard.append(bottomBar);
    teamSection.append(pickerCard);
  }

  container.append(teamSection);

  // Locked mode status notification if current phase is locked
  if (isModeLocked && (isDefenseStage || isAttackStage)) {
    const lockedCard = document.createElement('div');
    lockedCard.className = 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-center space-y-1';
    lockedCard.innerHTML = `
      <div class="text-sm font-bold text-emerald-900 flex items-center justify-center gap-1.5">
        <span>✓</span> <span>${isViewingAttack ? 'Attack' : 'Defense'} Lineup locked!</span>
      </div>
      <div class="text-xs text-emerald-700">The 5 heroes for this stage are locked.</div>
    `;
    container.append(lockedCard);
  } else if (!draft.matchId && !draft.defenceHeroes?.length && !draft.attackHeroes?.length) {
    const idleCard = document.createElement('div');
    idleCard.className = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center space-y-1.5';
    idleCard.innerHTML = `
      <div class="text-sm font-bold text-slate-800">Legend Draft: Not in match</div>
      <div class="text-xs text-slate-500 max-w-md mx-auto">Start a Legend Draft match in Hero Wars to activate live assistance. You can also pick heroes for each step below to test draft lineups.</div>
    `;
    container.append(idleCard);
  }

  // 5. Full 15-Hero Draft Grid (5 Columns x 3 Rows)
  // Only rendered when choices were recorded (e.g. historical / confirmed match data)
  if (observedChoices) {
    const candidatesMode = isViewingAttack ? 'attack' : 'defense';
    const currentCandidates = observedChoices?.[candidatesMode] || draftStepCandidates[candidatesMode] ||
      globalThis.hwaHelperPopupData.defaultDraftCandidates(candidatesMode);

    const chooserSection = document.createElement('div');
    chooserSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4';

  const chooserHeader = document.createElement('div');
  chooserHeader.className = 'flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100';

  const chooserTitleCol = document.createElement('div');
  chooserTitleCol.className = 'space-y-0.5';
  const chooserTitle = document.createElement('h3');
  chooserTitle.className = 'text-sm font-bold text-slate-900 flex items-center gap-2';
  chooserTitle.innerHTML = `<span class="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">15</span> <span>${observedChoices ? 'Recorded Draft Choices' : 'Manual Candidate Planner'} (5 Steps × 3 Choices)</span>`;
  chooserTitleCol.append(chooserTitle);

  const chooserSub = document.createElement('div');
  chooserSub.className = 'text-xs text-slate-500';
  chooserSub.textContent = observedChoices ?
    `Choices recorded for match #${observedMatchId}. Stars are shown when confirmed by battle data.` :
    `Choices are unknown until you record them. Use ⇄ to enter the 3 heroes offered in each ${isViewingAttack ? 'Attack' : 'Defense'} step.`;
  chooserTitleCol.append(chooserSub);
  chooserHeader.append(chooserTitleCol);

  const chooserActions = document.createElement('div');
  chooserActions.className = 'flex items-center gap-2';

  // Reset picks button
  const hasAnyPick = currentPicks.some(Boolean);
  if (hasAnyPick && !isModeLocked) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 cursor-pointer transition-colors';
    resetBtn.textContent = 'Reset picks';
    resetBtn.addEventListener('click', () => {
      if (isViewingAttack) localDraftAttackPicks = [null, null, null, null, null];
      else localDraftDefencePicks = [null, null, null, null, null];
      activeHeroSwapTarget = null;
      render();
    });
    chooserActions.append(resetBtn);
  }

  // Restore default candidate matrix button
  const restoreDefaultBtn = document.createElement('button');
  restoreDefaultBtn.type = 'button';
  restoreDefaultBtn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors';
  restoreDefaultBtn.textContent = 'Clear choices';
  restoreDefaultBtn.title = 'Clear recorded choices for this mode';
  restoreDefaultBtn.addEventListener('click', () => {
    draftStepCandidates[candidatesMode] = globalThis.hwaHelperPopupData.defaultDraftCandidates(candidatesMode);
    try {
      chrome.storage?.local?.set?.({ draftStepCandidates });
    } catch (_) {}
    render();
  });
  if (!observedChoices) chooserActions.append(restoreDefaultBtn);

  chooserHeader.append(chooserActions);
  chooserSection.append(chooserHeader);

  // 5 Columns x 3 Rows Grid
  const fullGrid = document.createElement('div');
  fullGrid.className = 'grid grid-cols-1 sm:grid-cols-5 gap-3';

  for (let stepIdx = 0; stepIdx < 5; stepIdx++) {
    const colBox = document.createElement('div');
    const stepCandidates = currentCandidates[stepIdx] || [null, null, null];
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
      const isKnownChoice = Number.isInteger(cHeroId) && cHeroId > 0;
      const meta = globalThis.hwaHelperHeroMetadata?.[cHeroId] || {};
      const snap = draftSnapshot(isViewingAttack ? 'attack' : 'defence', cHeroId);
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
      if (!observedChoices) cardTop.append(swapBtn);
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
        avWrap.append(createInitialsBadge(meta.name || '?', meta.faction, false));
      }
      card.append(avWrap);

      const nameLabel = document.createElement('div');
      nameLabel.className = 'text-xs font-bold text-slate-800 truncate max-w-[90px] mt-0.5';
      nameLabel.textContent = isKnownChoice ?
        (meta.name || globalThis.hwaHelperNameMap.hero(cHeroId) || `#${cHeroId}`) : 'Choice not recorded';
      card.append(nameLabel);

      if (meta.role) {
        const rBadge = document.createElement('span');
        rBadge.className = 'text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium my-0.5';
        rBadge.textContent = meta.role;
        card.append(rBadge);
      }

      // Only confirmed draft stars affect hero selection.
      const statsRow = document.createElement('div');
      statsRow.className = 'text-[10px] text-slate-500 font-medium flex items-center justify-center gap-1.5 my-0.5';
      statsRow.textContent = !isKnownChoice ? 'Select hero with ⇄' :
        (snap?.star >= 6 ? '★6' : (snap?.star ? `★${snap.star}` : 'Stars: —'));
      card.append(statsRow);

      // Pick button or Chosen indicator
      if (isChosen) {
        const pickedTag = document.createElement('div');
        pickedTag.className = 'mt-1.5 w-full py-1 rounded-md text-[11px] font-bold bg-emerald-600 text-white shadow-xs';
        pickedTag.textContent = `✓ Picked (Step ${stepIdx + 1})`;
        card.append(pickedTag);
      } else if (!isModeLocked && isKnownChoice) {
        const pickCardBtn = document.createElement('button');
        pickCardBtn.type = 'button';
        pickCardBtn.className = 'mt-1.5 w-full py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200';
        pickCardBtn.textContent = 'Pick';
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
      } else {
        const candTag = document.createElement('div');
        candTag.className = 'mt-1.5 w-full py-1 rounded-md text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200';
        candTag.textContent = 'Candidate';
        card.append(candTag);
      }

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

    // Search input for hero swapping
    const searchBox = document.createElement('div');
    searchBox.className = 'pt-0.5';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search hero by name, role, or ID...';
    searchInput.className = 'w-full px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';
    searchBox.append(searchInput);
    swapWrap.append(searchBox);

    const swapGrid = document.createElement('div');
    swapGrid.className = 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-[220px] overflow-y-auto p-1';

    const allHeroEntries = Object.entries(globalThis.hwaHelperHeroMetadata || {}).map(([id, hMeta]) => ({
      id: Number(id),
      meta: hMeta,
      snap: draftSnapshot(isViewingAttack ? 'attack' : 'defence', id)
    })).filter((item) => Number.isInteger(item.id) && item.id < 1000)
      .sort((a, b) => (a.meta.name || '').localeCompare(b.meta.name || ''));

    const renderSwapList = (query = '') => {
      swapGrid.replaceChildren();
      const q = query.trim().toLowerCase();
      const filtered = allHeroEntries.filter(({ id: hId, meta: hMeta }) => {
        if (!q) return true;
        const name = (hMeta.name || globalThis.hwaHelperNameMap.hero(hId) || '').toLowerCase();
        const role = (hMeta.role || '').toLowerCase();
        return name.includes(q) || role.includes(q) || String(hId).includes(q);
      });

      for (const { id: hId, meta: hMeta, snap: hSnap } of filtered) {
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
            currentCandidates[sIdx] = [null, null, null];
          }
          currentCandidates[sIdx][cIdx] = hId;
          try {
            chrome.storage?.local?.set?.({ draftStepCandidates });
          } catch (_) {}
          activeHeroSwapTarget = null;
          render();
        });
        swapGrid.append(itemBtn);
      }
    };

    searchInput.addEventListener('input', (e) => renderSwapList(e.target.value));
    renderSwapList('');

    swapWrap.append(swapGrid);
    chooserSection.append(swapWrap);
  }

  container.append(chooserSection);
  }

  target.replaceChildren(container);
  const stageDesc = globalThis.hwaHelperPopupData.draftStageDescription(stageId);
  const matchPrefix = draft.matchId ? `Match #${draft.matchId} • ` : '';
  const pickInfo = isActivelyDrafting ? ` • Selected ${val.count}/5 steps` :
    (val.count === 5 ? ` • ${isViewingAttack ? 'Attack' : 'Defense'} lineup locked (5 heroes)` : '');
  if (target === view) status.textContent = `${matchPrefix}${stageDesc}${pickInfo}`;
  return container;
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
  matchupSec.className = 'rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/60';
  const clanRoundPoints = battle.clanRoundPoints ?? 10145150;
  const enemyRoundPoints = battle.enemyClanRoundPoints ?? 657950;
  const totalPoints = clanRoundPoints + enemyRoundPoints || 1;
  const clanPct = Math.round((clanRoundPoints / totalPoints) * 100);
  const enemyPct = 100 - clanPct;
  const battleNumber = info.battleNumber ?? 4;
  const roundNumber = info.roundNumber ?? 1;

  matchupSec.innerHTML = `
    <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
      <span>Battle #${battleNumber} • Round ${roundNumber} of 6</span>
      <span class="font-semibold text-emerald-700 dark:text-emerald-400">Theme: Radar Training</span>
    </div>
    <div class="grid grid-cols-5 items-center gap-2 mb-3">
      <div class="col-span-2 min-w-0">
        <div class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">${clan.name}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">Server ${clan.server || '—'}</div>
        <div class="text-emerald-700 dark:text-emerald-400 font-black text-base sm:text-lg tabular-nums mt-0.5">${clanRoundPoints.toLocaleString()}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400">Score: <strong class="text-slate-800 dark:text-slate-200">${battle.clanBattleScore ?? 0}</strong></div>
      </div>
      <div class="col-span-1 text-center">
        <span class="inline-flex rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-1 text-xs font-black text-slate-700 dark:text-slate-300">VS</span>
      </div>
      <div class="col-span-2 min-w-0 text-right">
        <div class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">${enemyClan.name}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">Server ${enemyClan.server || '—'}</div>
        <div class="text-rose-700 dark:text-rose-400 font-black text-base sm:text-lg tabular-nums mt-0.5">${enemyRoundPoints.toLocaleString()}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400">Score: <strong class="text-slate-800 dark:text-slate-200">${battle.enemyClanBattleScore ?? 0}</strong></div>
      </div>
    </div>
    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden flex">
      <div class="bg-emerald-500 h-2.5" style="width: ${clanPct}%"></div>
      <div class="bg-rose-500 h-2.5" style="width: ${enemyPct}%"></div>
    </div>
    <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
      <span>${clanPct}%</span>
      <span>${enemyPct}%</span>
    </div>
  `;
  body.append(matchupSec);

  // --- SECTION 2: PERSONAL POINTS & STANDINGS ---
  const personalSec = document.createElement('div');
  personalSec.className = 'grid grid-cols-2 sm:grid-cols-4 gap-2.5';
  const isStaleVersusDay = activeCache.clanVersusStatus?.updatedAt &&
    new Date(activeCache.clanVersusStatus.updatedAt).toDateString() !== new Date().toDateString();
  const pScore = isStaleVersusDay ? 0 : (vsStatus?.score ?? rewards.userRoundPoints ?? 0);
  const bScore = isStaleVersusDay ? 0 : (rewards.userBattlePoints ?? pScore);
  const sScore = rewards.userSeasonPoints ?? 0;
  const cRank = rewards.userClanRank ? `#${rewards.userClanRank}` : '—';
  const sRank = rewards.seasonClanRank ? `#${rewards.seasonClanRank}` : '—';

  const stats = [
    { label: 'Round Points', val: pScore.toLocaleString(), sub: isStaleVersusDay ? 'New round starting' : 'Current round' },
    { label: 'Battle Points', val: bScore.toLocaleString(), sub: 'This battle' },
    { label: 'Season Points', val: resourceData.formatAmount(sScore), sub: `Season Rank ${sRank}` },
    { label: 'Clan Rank', val: cRank, sub: 'Among guild members' }
  ];
  for (const s of stats) {
    const tile = document.createElement('div');
    tile.className = 'rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70';
    tile.innerHTML = `
      <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">${s.label}</div>
      <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">${s.val}</div>
      <div class="text-[10px] text-slate-400 dark:text-slate-500">${s.sub}</div>
    `;
    personalSec.append(tile);
  }
  body.append(personalSec);

  // --- SECTION 3: MILESTONE CHESTS (1 - 9) ---
  const thresholds = globalThis.hwaHelperClanVersusChestThresholds || {
    1: 25000, 2: 100000, 3: 400000, 4: 600000, 5: 1000000, 6: 1500000, 7: 2000000, 8: 3000000, 9: 4500000
  };
  const rewardMap = globalThis.hwaHelperClanVersusRewards || {};
  const claimedSet = new Set(isStaleVersusDay ? [] : (vsStatus?.chestNumbers || []));

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
  chestsSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';

  let isStackMode = true;
  let activeChestNum = targetChestNum;

  const headerDiv = document.createElement('div');
  headerDiv.className = 'flex items-center justify-between flex-wrap gap-2';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'flex items-center gap-2';
  titleWrap.innerHTML = `
    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🎁 Milestone Chests</h3>
    <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50">${claimedSet.size} / 9 Claimed</span>
  `;

  const viewToggleWrap = document.createElement('div');
  viewToggleWrap.className = 'inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-medium select-none dark:border-slate-700 dark:bg-slate-800';

  const deckModeBtn = document.createElement('button');
  deckModeBtn.type = 'button';
  deckModeBtn.className = 'deck-mode-btn px-2.5 py-0.5 rounded-md font-bold transition-colors bg-white text-slate-900 shadow-2xs cursor-pointer dark:bg-slate-700 dark:text-slate-100';
  deckModeBtn.textContent = '🎴 Stacked Deck';

  const gridModeBtn = document.createElement('button');
  gridModeBtn.type = 'button';
  gridModeBtn.className = 'grid-mode-btn px-2.5 py-0.5 rounded-md font-medium transition-colors text-slate-600 hover:text-slate-900 cursor-pointer dark:text-slate-400 dark:hover:text-slate-100';
  gridModeBtn.textContent = '🃏 Grid View';

  viewToggleWrap.append(deckModeBtn, gridModeBtn);
  headerDiv.append(titleWrap, viewToggleWrap);
  chestsSec.append(headerDiv);

  // Target summary progress banner
  const progBox = document.createElement('div');
  progBox.className = 'rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60';
  progBox.innerHTML = `
    <div class="flex justify-between font-medium text-slate-700 dark:text-slate-300">
      <span>Target: <strong class="text-amber-800 dark:text-amber-300">Chest ${targetChestNum}</strong> (${targetThreshold.toLocaleString()} pts)</span>
      <span class="font-bold text-slate-900 dark:text-slate-100">${targetPct}% (${pScore.toLocaleString()} / ${targetThreshold.toLocaleString()})</span>
    </div>
    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
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
  layer2.className = 'chest-deck-layer-2 absolute inset-x-4 top-3 bottom-1 rounded-2xl bg-slate-200/70 border border-slate-300 shadow-2xs -z-20 pointer-events-none dark:bg-slate-800/50 dark:border-slate-700/60';
  const layer1 = document.createElement('div');
  layer1.className = 'chest-deck-layer-1 absolute inset-x-2 top-2 bottom-2 rounded-2xl bg-slate-100/80 border border-slate-300 shadow-xs -z-10 pointer-events-none dark:bg-slate-800/80 dark:border-slate-700/80';
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
        ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-100/50 shadow-sm dark:border-emerald-600/60 dark:from-emerald-950/40 dark:via-slate-800/90 dark:to-emerald-950/30'
        : isReady
          ? 'border-amber-400 bg-gradient-to-br from-amber-50/80 via-white to-amber-100/60 shadow-md resource-capped-amber dark:border-amber-500/70 dark:from-amber-950/40 dark:via-slate-800/90 dark:to-amber-950/30'
          : isTarget
            ? 'border-indigo-400 bg-gradient-to-br from-indigo-50/60 via-white to-amber-50/40 shadow-md ring-2 ring-indigo-200 dark:border-indigo-500/70 dark:ring-indigo-900/50 dark:from-indigo-950/40 dark:via-slate-800/90 dark:to-slate-800'
            : 'border-slate-200 bg-gradient-to-br from-slate-50/70 via-white to-slate-100/60 text-slate-700 shadow-2xs dark:border-slate-700/80 dark:from-slate-800/80 dark:via-slate-800/95 dark:to-slate-900 dark:text-slate-300'
    }`;

    // Card Top / Header (Rank + Suit + Status Badge)
    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-center justify-between mb-2';
    cardHeader.innerHTML = `
      <div class="flex items-center gap-1.5">
        <span class="font-mono font-black text-xs px-2 py-0.5 rounded bg-black/5 border border-black/10 dark:bg-white/10 dark:border-white/10 dark:text-slate-200">№ ${c}</span>
        <span class="text-sm">🎁</span>
        <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">Chest ${c}</span>
      </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
        isClaimed
          ? 'bg-emerald-600 text-white'
          : isReady
            ? 'bg-amber-500 text-white animate-pulse'
            : isTarget
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
      }">${isClaimed ? '✓ Claimed' : isReady ? '★ Ready to Claim' : isTarget ? '🎯 Target Chest' : '🔒 Locked'}</span>
    `;

    // Milestone Requirement Row
    const reqRow = document.createElement('div');
    reqRow.className = 'flex items-baseline justify-between py-1 border-b border-slate-200/60 dark:border-slate-700/60';
    reqRow.innerHTML = `
      <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Milestone Requirement</span>
      <span class="tabular-nums font-extrabold text-sm ${isClaimed ? 'text-emerald-700 dark:text-emerald-400' : isReady ? 'text-amber-800 dark:text-amber-400' : isTarget ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}">${pts.toLocaleString()} pts</span>
    `;

    // Progress bar for active / target card
    const cardProg = document.createElement('div');
    cardProg.className = 'mt-2 space-y-1';
    cardProg.innerHTML = `
      <div class="flex justify-between text-[11px] text-slate-600 dark:text-slate-400 font-medium">
        <span>Progress</span>
        <span class="tabular-nums font-bold ${isReady || isClaimed ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}">${cardPct}% (${pScore.toLocaleString()} / ${pts.toLocaleString()})</span>
      </div>
      <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div class="h-1.5 rounded-full transition-all duration-300 ${isClaimed ? 'bg-emerald-500' : isReady ? 'bg-amber-500' : 'bg-indigo-500'}" style="width: ${cardPct}%"></div>
      </div>
    `;

    // Rewards List
    const rewardList = document.createElement('div');
    rewardList.className = 'space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300 mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60';
    const rItems = rewardMap[c];
    if (rItems) {
      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-1.5';
      for (const [rKey, rAmt] of Object.entries(rItems)) {
        const itemRow = document.createElement('div');
        itemRow.className = 'flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 border border-slate-200/70 shadow-2xs font-medium truncate dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-200';
        itemRow.textContent = formatRewardItem(rKey, rAmt);
        itemsGrid.append(itemRow);
      }
      rewardList.append(itemsGrid);
    } else {
      rewardList.innerHTML = '<span class="text-slate-400 dark:text-slate-500 italic">Bonus milestone reward</span>';
    }

    // Stack navigation footer (visible in Stack mode)
    const cardNav = document.createElement('div');
    cardNav.className = 'card-stack-nav flex items-center justify-between pt-2.5 mt-3 border-t border-slate-200/60 dark:border-slate-700/60 text-xs';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'card-prev-btn px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200';
    prevBtn.textContent = '‹ Prev';

    const cardCounter = document.createElement('span');
    cardCounter.className = 'text-slate-500 dark:text-slate-400 font-medium';
    cardCounter.innerHTML = `Chest ${c} of 9 ${isTarget ? '<strong class="text-amber-600 dark:text-amber-400 ml-1">(Target)</strong>' : ''}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'card-next-btn px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200';
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
        btn.className = `px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer bg-slate-900 text-white border-slate-900 shadow-xs dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 ${
          isTarget ? 'ring-2 ring-amber-400' : ''
        }`;
      } else {
        btn.className = `px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
          isClaimed
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60 dark:hover:bg-emerald-900/60'
            : isReady
              ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 dark:hover:bg-amber-900/60'
              : isTarget
                ? 'bg-indigo-50 text-indigo-900 border-indigo-300 ring-2 ring-amber-400 font-bold hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60 dark:hover:bg-indigo-900/60'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700/60'
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
    deckModeBtn.className = 'deck-mode-btn px-2.5 py-0.5 rounded-md font-bold transition-colors bg-white text-slate-900 shadow-2xs cursor-pointer dark:bg-slate-700 dark:text-slate-100';
    gridModeBtn.className = 'grid-mode-btn px-2.5 py-0.5 rounded-md font-medium transition-colors text-slate-600 hover:text-slate-900 cursor-pointer dark:text-slate-400 dark:hover:text-slate-100';
    updateDeckView();
  });
  gridModeBtn.addEventListener('click', () => {
    isStackMode = false;
    gridModeBtn.className = 'grid-mode-btn px-2.5 py-0.5 rounded-md font-bold transition-colors bg-white text-slate-900 shadow-2xs cursor-pointer dark:bg-slate-700 dark:text-slate-100';
    deckModeBtn.className = 'deck-mode-btn px-2.5 py-0.5 rounded-md font-medium transition-colors text-slate-600 hover:text-slate-900 cursor-pointer dark:text-slate-400 dark:hover:text-slate-100';
    updateDeckView();
  });

  updateDeckView();
  body.append(chestsSec);

  // --- SECTION 4: 6-ROUND SCHEDULE & QUESTS ---
  const roundsSec = document.createElement('div');
  roundsSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';
  roundsSec.innerHTML = `
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🗓️ 6-Round Battle Schedule & Quests</h3>
      <span class="text-xs text-slate-500 dark:text-slate-400">Click round to view point-earning quests</span>
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
      isLive ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/60 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50'
    }`;
    if (isLive) rCard.open = true;

    const summary = document.createElement('summary');
    summary.className = 'flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-100/60 dark:hover:bg-slate-700/40 list-none';

    summary.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="size-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
          isLive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
        }">${r.index}</span>
        <div class="min-w-0">
          <div class="font-bold text-slate-900 dark:text-slate-100 truncate">${themeName}</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">Reward: ${r.score || roundConfig.battlePoints || 1} Battle Point${(r.score || roundConfig.battlePoints || 1) > 1 ? 's' : ''} • ${quests.length} Quests</div>
        </div>
      </div>
      <div class="text-right shrink-0 ml-2">
        ${
          isLive
            ? `<div class="font-black text-emerald-800 dark:text-emerald-400 tabular-nums">${resourceData.formatAmount(r.points || 0)} vs ${resourceData.formatAmount(r.enemyPoints || 0)}</div>
               <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400"><span class="size-1.5 rounded-full bg-emerald-500 animate-ping"></span>In Progress</span>`
            : isDone
              ? `<div class="font-bold text-slate-700 dark:text-slate-300">${resourceData.formatAmount(r.points || 0)} vs ${resourceData.formatAmount(r.enemyPoints || 0)}</div>
                 <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Finished</span>`
              : '<span class="rounded bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">Upcoming</span>'
        }
      </div>
    `;

    const questBody = document.createElement('div');
    questBody.className = 'p-3 border-t border-slate-200/80 bg-white/70 space-y-2 dark:border-slate-700/80 dark:bg-slate-800/70';
    questBody.innerHTML = `
      <div class="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
        <span>🎯 Quests to Earn Points:</span>
        <span class="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Day ${r.index}</span>
      </div>
    `;

    const qList = document.createElement('div');
    qList.className = 'grid grid-cols-1 sm:grid-cols-2 gap-1.5';
    for (const q of quests) {
      const stock = globalThis.hwaHelperPopupData?.getChallengeResourceStock?.(activeCache, q.label) ?? null;
      const cleanLabel = q.label.replace(/\s*\(\d+[\d,]*\)$/, '');
      const displayLabel = stock != null ? `${cleanLabel} (${stock.toLocaleString()})` : cleanLabel;
      const qItem = document.createElement('div');
      qItem.className = 'flex items-center justify-between rounded bg-white border border-slate-200/80 px-2 py-1 text-[11px] dark:bg-slate-800/90 dark:border-slate-700';
      qItem.innerHTML = `
        <span class="text-slate-800 dark:text-slate-200 font-medium truncate mr-1.5" title="${displayLabel}">${displayLabel}</span>
        <span class="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.2 font-bold tabular-nums shrink-0 border border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60">+${q.points.toLocaleString()} pts</span>
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
  reqSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';
  const curUsers = info.currentNumActiveUsers ?? 28;
  const minUsers = info.numActiveUsers ?? 5;
  const weeklyAct = info.weeklyUserActivity ?? 2450;
  const personalSat = info.personalRequirementsIsSatisfied ?? true;
  const guildSat = info.guildRequirementsIsSatisfied ?? true;

  reqSec.innerHTML = `
    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">👥 Guild Participation & Requirements</h3>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
        <div class="text-slate-500 dark:text-slate-400 text-[11px]">Active Members</div>
        <div class="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">${curUsers} / ${minUsers} req</div>
        <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Satisfied</span>
      </div>
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
        <div class="text-slate-500 dark:text-slate-400 text-[11px]">Weekly Activity</div>
        <div class="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">${weeklyAct.toLocaleString()}</div>
        <span class="text-[10px] text-slate-400 dark:text-slate-500">Total guild score</span>
      </div>
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
        <div class="text-slate-500 dark:text-slate-400 text-[11px]">Personal Status</div>
        <div class="font-bold text-sm mt-0.5 ${personalSat ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}">${personalSat ? 'Eligible' : 'Pending'}</div>
        <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">${personalSat ? '✓ Qualified' : 'Action needed'}</span>
      </div>
      <div class="rounded-lg bg-slate-50 p-2.5 border border-slate-100 dark:bg-slate-800/70 dark:border-slate-700/60">
        <div class="text-slate-500 dark:text-slate-400 text-[11px]">Guild Status</div>
        <div class="font-bold text-sm mt-0.5 ${guildSat ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}">${guildSat ? 'Eligible' : 'Pending'}</div>
        <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">${guildSat ? '✓ Qualified' : 'Action needed'}</span>
      </div>
    </div>
  `;
  body.append(reqSec);

  // --- SECTION 6: DAILY CHALLENGES ---
  const challenges = Array.isArray(info.challenges) ? info.challenges : [];
  if (challenges.length > 0) {
    const chSec = document.createElement('div');
    chSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';

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
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🎯 Daily Challenges (${challenges.length})</h3>
        <span class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60">Total: ${totalChallengePts.toLocaleString()} pts</span>
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
      item.className = 'flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs dark:border-slate-700/60 dark:bg-slate-800/70';
      item.innerHTML = `
        <span class="font-medium text-slate-800 dark:text-slate-200 truncate mr-2" title="${displayName}">${displayName}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="rounded bg-white px-2 py-0.5 font-bold text-slate-900 border border-slate-200 tabular-nums dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">${progress.toLocaleString()}</span>
          <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            convertedPts > 0
              ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60'
              : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800/70 dark:text-slate-400 dark:border-slate-700'
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

let dungeonModalReturnFocus = null;
function renderDungeonCombatLogSection(data, container) {
  const log = data?.dailyCombatLog || { flawlessCount: 0, totalBattles: 0, casualtyBattles: [] };
  const total = log.totalBattles || 0;
  const flawless = log.flawlessCount || 0;
  const casualties = Array.isArray(log.casualtyBattles) ? log.casualtyBattles : [];

  const logSec = document.createElement('div');
  logSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';

  logSec.innerHTML = `
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-bold text-slate-900 dark:text-slate-100">⚔️ Daily Combat Log</span>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          Total: ${total}
        </span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60">
          ✨ ${flawless} Flawless Wins (0 casualties)
        </span>
        ${casualties.length > 0 ? `
          <span class="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/60">
            ⚠️ ${casualties.length} with Casualties
          </span>
        ` : ''}
      </div>
    </div>
  `;

  if (casualties.length > 0) {
    const list = document.createElement('div');
    list.className = 'space-y-2.5 pt-1';

    const title = document.createElement('div');
    title.className = 'text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5';
    title.innerHTML = `<span>⚠️ Highlighted Battles with Titan Casualties (${casualties.length})</span>`;
    list.append(title);

    for (const b of casualties) {
      const card = document.createElement('div');
      card.className = 'rounded-xl border-2 border-rose-300 bg-rose-50/70 p-3.5 space-y-2.5 shadow-xs dark:border-rose-800/80 dark:bg-rose-950/40';

      const timeStr = b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : '';
      const floorStr = b.floorNumber ? `Floor ${b.floorNumber}` : 'Dungeon Battle';
      const outcomeBadge = b.win
        ? '<span class="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold border border-amber-300 dark:border-amber-700">Victory (with Casualties)</span>'
        : '<span class="rounded-full bg-rose-600 text-white px-2 py-0.5 text-[10px] font-bold">Defeat</span>';

      card.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-rose-800 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">${floorStr}</span>
            ${outcomeBadge}
          </div>
          ${timeStr ? `<span class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">${timeStr}</span>` : ''}
        </div>
      `;

      // Highlight the fallen titans prominently
      const fallenBox = document.createElement('div');
      fallenBox.className = 'rounded-lg border border-rose-200 bg-white/90 p-2.5 space-y-1.5 dark:border-rose-900/60 dark:bg-slate-900/80';
      const fallenCount = Array.isArray(b.casualties) ? b.casualties.length : 0;
      fallenBox.innerHTML = `
        <div class="text-[11px] font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
          <span>💀 Fallen Titans (${fallenCount}):</span>
        </div>
      `;
      const fallenTitansList = document.createElement('div');
      fallenTitansList.className = 'flex flex-wrap items-center gap-2';

      for (const cas of (b.casualties || [])) {
        const idStr = String(cas?.id ?? cas);
        const meta = globalThis.hwaHelperTitanMetadata?.[idStr];
        const name = meta?.name || `Titan ${idStr}`;
        const elem = meta?.element || '';

        const tag = document.createElement('span');
        tag.className = 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-100/70 px-2 py-1 text-xs font-semibold text-rose-900 shadow-2xs dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-200';
        tag.innerHTML = `
          <img src="assets/titans/${idStr}.png" class="size-5 rounded-full object-cover shrink-0 border border-rose-300 dark:border-rose-700">
          <span>${name}</span>
          ${elem ? `<span class="text-[10px] text-rose-700/80 dark:text-rose-400 font-normal">(${elem})</span>` : ''}
          <span class="rounded bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200 px-1 py-0.2 text-[9px] font-bold uppercase">Dead</span>
        `;
        tag.querySelector('img')?.addEventListener('error', (e) => { e.currentTarget.hidden = true; });
        fallenTitansList.append(tag);
      }
      fallenBox.append(fallenTitansList);
      card.append(fallenBox);

      // Deployed lineup
      if (Array.isArray(b.deployed) && b.deployed.length > 0) {
        const teamBox = document.createElement('div');
        teamBox.className = 'flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400';
        const teamLabel = document.createElement('span');
        teamLabel.className = 'font-semibold text-[10px] uppercase tracking-wider mr-1';
        teamLabel.textContent = 'Deployed:';
        teamBox.append(teamLabel);
        for (const depId of b.deployed) {
          const tId = String(depId);
          const meta = globalThis.hwaHelperTitanMetadata?.[tId];
          const name = meta?.name || `Titan ${tId}`;
          const isCasualty = (b.casualties || []).some((c) => String(c?.id ?? c) === tId);
          const tTag = document.createElement('span');
          tTag.className = `inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${isCasualty ? 'line-through text-rose-700 font-bold bg-rose-100/60 dark:bg-rose-950/40 dark:text-rose-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`;
          tTag.textContent = name;
          teamBox.append(tTag);
        }
        card.append(teamBox);
      }

      list.append(card);
    }
    logSec.append(list);
  } else if (flawless > 0) {
    const flawlessBox = document.createElement('div');
    flawlessBox.className = 'rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 flex items-center gap-2';
    flawlessBox.innerHTML = `
      <span class="text-base shrink-0">🛡️</span>
      <span>All <strong>${flawless}</strong> dungeon battles recorded today were flawless victories with zero titan casualties!</span>
    `;
    logSec.append(flawlessBox);
  } else {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500 text-center';
    emptyBox.textContent = 'No dungeon battles recorded today yet. Battle in dungeon to track combat logs and titan casualties.';
    logSec.append(emptyBox);
  }

  container.append(logSec);
}

function openDungeonModal(dungeonStatus, returnFocusTarget = null) {
  const modal = document.querySelector('#dungeon-modal');
  const body = document.querySelector('#dungeon-modal-body');
  if (!modal || !body) return;

  dungeonModalReturnFocus = returnFocusTarget;
  const data = dungeonStatus || {};
  const floorNumber = data.floorNumber || (data.maxFloorPassed ? data.maxFloorPassed + 1 : 1);
  const floorBadge = document.querySelector('#dungeon-floor-badge');
  if (floorBadge) floorBadge.textContent = `Floor ${floorNumber}${data.floorType ? ` · ${data.floorType}` : ''}`;

  body.replaceChildren();

  // --- ACTIVE BATTLE OR LAST BATTLE OUTCOME ---
  if (data.activeBattle) {
    const battleSec = document.createElement('div');
    battleSec.className = 'rounded-xl border border-blue-400 bg-blue-50/90 p-4 space-y-2.5 dark:border-blue-600 dark:bg-blue-950/50 shadow-sm';
    const activeDoorIdx = Number(data.activeBattle.teamNum ?? 0) + 1;
    const heroList = Array.isArray(data.activeBattle.heroes) ? data.activeBattle.heroes : [];
    battleSec.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="relative flex size-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full size-3 bg-blue-600"></span>
          </span>
          <span class="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-100">⚔️ Battle In Progress</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-blue-600 text-white px-2.5 py-0.5 text-xs font-bold shadow-xs">
            Door ${activeDoorIdx}
          </span>
          <button id="dungeon-clear-active-battle-btn" type="button" class="cursor-pointer inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:hover:bg-rose-900 transition-colors shadow-2xs" title="Clear stuck battle and refresh dungeon from game">
            Reset Battle
          </button>
        </div>
      </div>
      <div class="text-xs text-blue-800 dark:text-blue-200">
        Actively fighting on Floor ${floorNumber} · Door ${activeDoorIdx} with ${heroList.length} titans deployed.
      </div>
    `;
    if (heroList.length > 0) {
      const activeTitansBox = document.createElement('div');
      activeTitansBox.className = 'flex flex-wrap items-center gap-1.5 pt-2 border-t border-blue-200/80 dark:border-blue-800/60';
      for (const hid of heroList) {
        const titanId = String(hid);
        const meta = globalThis.hwaHelperTitanMetadata?.[titanId];
        const name = meta?.name || `Titan ${titanId}`;
        const unitTag = document.createElement('span');
        unitTag.className = 'inline-flex items-center gap-1.5 rounded-lg bg-white/95 border border-blue-200 px-2 py-0.5 text-[11px] text-slate-800 shadow-2xs dark:bg-slate-900 dark:border-blue-800 dark:text-slate-200';
        unitTag.innerHTML = `<img src="assets/titans/${titanId}.png" class="size-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"><span>${name}</span>`;
        unitTag.querySelector('img')?.addEventListener('error', (event) => { event.currentTarget.hidden = true; });
        activeTitansBox.append(unitTag);
      }
      battleSec.append(activeTitansBox);
    }
    const clearBtn = battleSec.querySelector('#dungeon-clear-active-battle-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        clearBtn.disabled = true;
        clearBtn.textContent = 'Resetting...';
        if (typeof currentCache !== 'undefined' && currentCache?.dungeonStatus?.data) {
          currentCache.dungeonStatus.data.activeBattle = null;
          if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
            await chrome.storage.local.set({ [CACHE_KEY]: currentCache });
          }
        }
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls: [{ name: 'dungeonGetInfo', args: {} }] });
        }
        setTimeout(() => {
          openDungeonModal(currentCache?.dungeonStatus?.data, dungeonModalReturnFocus);
        }, 300);
      });
    }
    body.append(battleSec);
  } else if (data.lastBattleResult) {
    const resSec = document.createElement('div');
    const win = data.lastBattleResult.win !== false;
    resSec.className = `rounded-xl border p-3 flex items-center justify-between text-xs shadow-2xs ${
      win
        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
        : 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
    }`;
    const stars = data.lastBattleResult.stars ? '★'.repeat(Math.min(3, data.lastBattleResult.stars)) : '';
    resSec.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="font-bold">${win ? '🏆 Victory' : '❌ Defeat'}</span>
        ${stars ? `<span class="text-amber-500 font-bold tracking-widest">${stars}</span>` : ''}
        <span class="text-[11px] text-slate-500 dark:text-slate-400">Previous battle outcome</span>
      </div>
      <div class="text-[11px] font-medium text-slate-600 dark:text-slate-300">Floor ${floorNumber}</div>
    `;
    body.append(resSec);
  }

  // --- SECTION 1: OVERVIEW STATS ---
  const todayTitanite = (() => {
    if (Number.isFinite(data.todayTitanite)) return data.todayTitanite;
    if (Number.isFinite(data.dailyCombatLog?.todayTitanite)) return data.dailyCombatLog.todayTitanite;
    const quests = (typeof currentCache !== 'undefined' ? currentCache?.questGetAll?.data : null);
    if (quests) {
      const q = (Array.isArray(quests) ? quests.find((item) => [10031, 10032, 10108].includes(Number(item?.id))) : null) ||
                quests[10031] || quests[10032] || quests[10108];
      if (q && Number.isFinite(Number(q.progress))) return Number(q.progress);
    }
    const dailyQuests = (typeof currentCache !== 'undefined' ? currentCache?.['getDailyQuests:quest']?.data?.events : null);
    if (dailyQuests) {
      const q = (Array.isArray(dailyQuests) ? dailyQuests.find((item) => [10031, 10032, 10108].includes(Number(item?.id))) : null) ||
                dailyQuests[10031] || dailyQuests[10032] || dailyQuests[10108];
      if (q && Number.isFinite(Number(q.progress))) return Number(q.progress);
    }
    return 0;
  })();

  const overviewSec = document.createElement('div');
  overviewSec.className = 'grid grid-cols-2 sm:grid-cols-4 gap-2.5';
  const stats = [
    { label: 'Current Floor', val: `Floor ${floorNumber}`, sub: 'In progress' },
    { label: 'Personal Titanite', val: `${todayTitanite.toLocaleString()}`, sub: 'Earned today' },
    { label: 'Checkpoint', val: `Floor ${data.respawnFloor || 0}`, sub: 'Respawn point' },
    { label: 'Guild Activity', val: `${(data.dungeonActivity ?? 0).toLocaleString()} pts`, sub: 'Dungeon score' }
  ];
  for (const s of stats) {
    const tile = document.createElement('div');
    tile.className = 'rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-800/70';
    tile.innerHTML = `
      <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">${s.label}</div>
      <div class="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums my-0.5">${s.val}</div>
      <div class="text-[10px] text-slate-400 dark:text-slate-500">${s.sub}</div>
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
  elemSec.className = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/60';
  elemSec.innerHTML = `
    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">Element Affinities</h3>
    <div class="flex items-center gap-4 flex-wrap text-sm">
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Prime Element:</span>
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60">🌟 ${prime}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Non-Prime Elements:</span>
        <span class="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:border dark:border-slate-600">${nonprime}</span>
      </div>
    </div>
  `;
  body.append(elemSec);

  // --- SECTION 3: DAILY COMBAT LOG & TITAN CASUALTY TRACKING ---
  renderDungeonCombatLogSection(data, body);

  // --- SECTION 4: CURRENT FLOOR DOORS ---
  const doors = Array.isArray(data.currentFloorDoors) ? data.currentFloorDoors : [];
  if (doors.length > 0) {
    const doorsSec = document.createElement('div');
    doorsSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';

    const autoBtn = document.querySelector('#dungeon-auto-btn');
    if (autoBtn) autoBtn.hidden = true;

    doorsSec.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🚪 Floor ${floorNumber} Doors</h3>
        <span class="text-xs text-slate-500 dark:text-slate-400">${doors.length} battle choices</span>
      </div>
    `;

    const doorsGrid = document.createElement('div');
    doorsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3';

    doors.forEach((door, idx) => {
      const isAttacking = Boolean(data.activeBattle && data.activeBattle.teamNum === idx);
      const cardBorder = isAttacking
        ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-400 dark:border-blue-600 dark:bg-blue-950/40'
        : 'border-slate-200 bg-slate-50/50 dark:border-slate-700/70 dark:bg-slate-800/70';

      const doorCard = document.createElement('div');
      doorCard.className = `rounded-xl border ${cardBorder} p-3.5 space-y-2.5`;

      const attackerType = door.attackerType ? door.attackerType.charAt(0).toUpperCase() + door.attackerType.slice(1) : 'Any';
      const defenderType = door.defenderType ? door.defenderType.charAt(0).toUpperCase() + door.defenderType.slice(1) : 'Unknown';
      const powerStr = door.power ? Number(door.power).toLocaleString() : '—';
      const statusBadge = isAttacking
        ? '<span class="rounded-full bg-blue-600 text-white px-2 py-0.5 text-[10px] font-bold animate-pulse">⚔️ In Combat</span>'
        : '';

      doorCard.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="rounded-md bg-slate-800 dark:bg-blue-900/60 dark:border dark:border-blue-700/50 px-2 py-0.5 text-[11px] font-bold text-white">Door ${idx + 1}</span>
            ${statusBadge}
          </div>
          <span class="text-xs font-bold text-slate-700 dark:text-slate-200">⚔️ Power: ${powerStr}</span>
        </div>
        <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <div>Attacker: <strong class="text-slate-900 dark:text-slate-100">${attackerType} Titans</strong></div>
          <div>Defender: <strong class="text-slate-900 dark:text-slate-100">${defenderType}</strong></div>
        </div>
      `;

      if (Array.isArray(door.team) && door.team.length > 0) {
        const teamBox = document.createElement('div');
        teamBox.className = 'flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700/60';
        for (const unit of door.team) {
          const titanId = String(unit.id);
          const meta = globalThis.hwaHelperTitanMetadata?.[titanId];
          const name = meta?.name || `Titan ${titanId}`;
          const starStr = unit.star >= 6 ? '★6' : (unit.star ? '★'.repeat(unit.star) : '');
          const unitTag = document.createElement('span');
          unitTag.className = 'inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 shadow-2xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200';
          const avatarImg = `<img src="assets/titans/${titanId}.png" class="size-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700">`;
          unitTag.innerHTML = `${avatarImg}<span>${name}</span> <span class="text-slate-400 dark:text-slate-500 font-normal">(Lv.${unit.level || '?'}${starStr ? ' ' + starStr : ''})</span>`;
          unitTag.querySelector('img')?.addEventListener('error', (event) => { event.currentTarget.hidden = true; });
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
    emptyDoors.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500';
    emptyDoors.textContent = 'Floor doors will update when a new dungeon floor is unlocked in game.';
    body.append(emptyDoors);
  }

  // --- SECTION 5: TITANS HEALTH & ENERGY STATUS ---
  const titansState = data.states?.titans || {};
  const titanEntries = Object.entries(titansState);
  if (titanEntries.length > 0) {
    const titansSec = document.createElement('div');
    titansSec.className = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60';
    titansSec.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🛡️ Titan Health & Energy</h3>
        <span class="text-xs text-slate-500 dark:text-slate-400">${titanEntries.length} deployed titans</span>
      </div>
    `;

    const titansList = document.createElement('div');
    titansList.className = 'grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 gap-2';

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
      row.className = `rounded-xl border p-2.5 ${isDead ? 'border-rose-200 bg-rose-50/40 opacity-70 dark:border-rose-900/60 dark:bg-rose-950/30' : 'border-slate-200 bg-slate-50/50 dark:border-slate-700/70 dark:bg-slate-800/70'}`;

      const avatarImg = `<img src="assets/titans/${tId}.png" class="size-7 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700">`;
      row.innerHTML = `
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 min-w-0">
            ${avatarImg}
            <div class="min-w-0">
              <div class="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">${name}</div>
              ${elem ? `<span class="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.2 text-[9px] font-semibold text-slate-600 dark:text-slate-300">${elem}</span>` : ''}
            </div>
          </div>
          <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isDead ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/60' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60'}">
            ${isDead ? 'Fallen' : 'Alive'}
          </span>
        </div>
        <div class="space-y-1">
          <div>
            <div class="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 mb-0.5">
              <span>HP</span>
              <span class="tabular-nums font-semibold text-slate-700 dark:text-slate-300">${hp.toLocaleString()} / ${maxHp.toLocaleString()} (${hpPct}%)</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div class="${isDead ? 'bg-rose-500' : 'bg-emerald-500'} h-1.5 rounded-full" style="width: ${hpPct}%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Energy</span>
              <span class="tabular-nums font-semibold text-slate-700 dark:text-slate-300">${energy.toLocaleString()} / 1,000 (${energyPct}%)</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div class="bg-amber-400 h-1.5 rounded-full" style="width: ${energyPct}%"></div>
            </div>
          </div>
        </div>
      `;
      row.querySelector('img')?.addEventListener('error', (event) => { event.currentTarget.hidden = true; });

      titansList.append(row);
    }

    titansSec.append(titansList);
    body.append(titansSec);
  } else {
    const emptyTitans = document.createElement('div');
    emptyTitans.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500';
    emptyTitans.textContent = 'Deployed titan health and energy will update during dungeon battles.';
    body.append(emptyTitans);
  }

  modal.hidden = false;
  document.querySelector('#dungeon-modal-close')?.focus?.();
}

function updateDashboardGameStatus(actionsEl = document.querySelector('#dashboard-actions'), alertEl = document.querySelector('#dashboard-game-status-alert')) {
  const targetActions = actionsEl || document.querySelector('#dashboard-actions');
  const targetAlert = alertEl || document.querySelector('#dashboard-game-status-alert');

  const processStatus = (data) => {
    const hasGameTab = Boolean(data?.hasGameTab);
    const engineStatus = data?.gameEngineStatus || null;
    const currentExtVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '';

    const isHooked = Boolean(engineStatus && (engineStatus.ready || (engineStatus.hasCanvas && engineStatus.hasRpcHeaders)));
    const isVersionChanged = Boolean(
      engineStatus?.extensionVersion &&
      currentExtVersion &&
      engineStatus.extensionVersion !== currentExtVersion
    );
    const isRefreshRequired = Boolean(
      engineStatus?.refreshRequired === true ||
      engineStatus?.needsRefresh === true ||
      engineStatus?.reason === 'refresh-required' ||
      engineStatus?.reason === 'extension-updated' ||
      (engineStatus?.rpcUrlAvailable && !engineStatus?.hasRpcHeaders)
    );

    // 1. Dashboard Alert Banner:
    if (targetAlert) {
      if (!hasGameTab) {
        targetAlert.className = 'dashboard-game-alert flex items-start sm:items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200 shadow-2xs transition-all';
        targetAlert.innerHTML = '<span class="text-lg select-none shrink-0 leading-none">⚠️</span><div class="flex-1 text-xs leading-relaxed"><strong class="font-semibold block sm:inline text-amber-950 dark:text-amber-100 mb-0.5 sm:mb-0 sm:mr-1">No Game Window Detected:</strong>Hero Wars: Alliance is not currently open in any browser tab. Open the game in a tab to enable live tracking and automated features.</div>';
        targetAlert.hidden = false;
      } else if (!isHooked || isVersionChanged || isRefreshRequired) {
        let reason = 'Game window is open but engine hooks are not yet connected.';
        if (isVersionChanged) {
          reason = `Extension updated to v${currentExtVersion} (game tab has v${engineStatus.extensionVersion}). Please refresh browser.`;
        } else if (isRefreshRequired) {
          reason = 'Game engine requested a refresh to reconnect RPC bridge and hooks.';
        }
        targetAlert.className = 'dashboard-game-alert flex items-start sm:items-center gap-3 rounded-xl border border-sky-300 bg-sky-50 p-3.5 text-sky-900 dark:border-sky-700/50 dark:bg-sky-950/40 dark:text-sky-200 shadow-2xs transition-all';
        targetAlert.innerHTML = `<span class="text-lg select-none shrink-0 leading-none">🔄</span><div class="flex-1 text-xs leading-relaxed"><strong class="font-semibold block sm:inline text-sky-950 dark:text-sky-100 mb-0.5 sm:mb-0 sm:mr-1">Refresh Recommended:</strong>${reason}</div>`;
        targetAlert.hidden = false;
      } else {
        targetAlert.hidden = true;
        targetAlert.className = 'hidden';
      }
    }

    // 2. Refresh Browser Button in actions (common row with raid, gather, monster):
    if (targetActions) {
      let refreshBtn = targetActions.querySelector('#btn-refresh-browser');
      const needsRefreshBtn = hasGameTab && (!isHooked || isVersionChanged || isRefreshRequired);

      if (needsRefreshBtn) {
        if (!refreshBtn) {
          refreshBtn = document.createElement('button');
          refreshBtn.id = 'btn-refresh-browser';
          refreshBtn.type = 'button';
          refreshBtn.className = 'cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-xs inline-flex items-center gap-1.5';
          refreshBtn.title = 'Refresh the active game tab';
          refreshBtn.setAttribute('aria-label', 'Refresh browser');
          refreshBtn.innerHTML = '<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg><span>Refresh browser</span>';
          refreshBtn.addEventListener('click', () => {
            refreshBtn.disabled = true;
            const span = refreshBtn.querySelector('span');
            if (span) span.textContent = 'Refreshing...';
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage({ kind: 'reload-game-tab' }, () => {
                const reset = () => {
                  refreshBtn.disabled = false;
                  if (span) span.textContent = 'Refresh browser';
                  updateDashboardGameStatus(targetActions, targetAlert);
                };
                if (typeof setTimeout !== 'undefined') setTimeout(reset, 1200);
                else reset();
              });
            }
          });
          targetActions.append(refreshBtn);
        } else {
          refreshBtn.hidden = false;
        }
      } else if (refreshBtn) {
        refreshBtn.remove();
      }
    }
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      chrome.runtime.sendMessage({ kind: 'get-game-tab-status' }, (response) => {
        if (response && response.ok) {
          processStatus(response);
        } else {
          checkFallbackTabStatus(processStatus);
        }
      });
    } catch (_) {
      checkFallbackTabStatus(processStatus);
    }
  } else {
    checkFallbackTabStatus(processStatus);
  }
}

function checkFallbackTabStatus(callback) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    const queryPatterns = ['https://*.hero-wars-alliance.com/*', 'https://hero-wars-alliance.com/*'];
    chrome.tabs.query({ url: queryPatterns }, (tabs) => {
      const hasGame = Array.isArray(tabs) && tabs.length > 0;
      if (chrome.storage?.local?.get) {
        chrome.storage.local.get('gameEngineStatus', (stored) => {
          callback({
            hasGameTab: hasGame,
            gameEngineStatus: stored?.gameEngineStatus || null
          });
        });
      } else {
        callback({ hasGameTab: hasGame, gameEngineStatus: null });
      }
    });
  } else if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    chrome.storage.local.get('gameEngineStatus', (stored) => {
      callback({
        hasGameTab: Boolean(stored?.gameEngineStatus?.hasCanvas || stored?.gameEngineStatus?.ready),
        gameEngineStatus: stored?.gameEngineStatus || null
      });
    });
  } else {
    callback({ hasGameTab: false, gameEngineStatus: null });
  }
}

globalThis.updateDashboardGameStatus = updateDashboardGameStatus;
globalThis.checkFallbackTabStatus = checkFallbackTabStatus;
globalThis.getExpandedTowerFloor = () => expandedTowerFloor;
globalThis.setExpandedTowerFloor = (f) => { expandedTowerFloor = f; };

function renderDashboard(cache) {
  const model = globalThis.hwaHelperDashboardData.dailyDashboard(cache);
  const groups = [
    { title: 'Activities', rows: model.activities },
    { title: 'Daily Quests', rows: model.quests },
    { title: 'Free Gifts', rows: model.gifts }
  ];
  const pending = groups.flatMap((group) => group.rows).filter((item) => item.state === 'pending').length;
  status.textContent = `${pending} activities or rewards to check · Based on game data observed today`;

  const container = document.createElement('div');
  container.className = 'space-y-4 p-4';

  const gameTabAlert = document.createElement('div');
  gameTabAlert.id = 'dashboard-game-status-alert';
  gameTabAlert.className = 'hidden';
  container.append(gameTabAlert);

  const intro = document.createElement('div');
  intro.className = 'rounded-xl bg-slate-900 p-4 text-white';
  const heading = document.createElement('h2');
  heading.className = 'text-lg font-bold';
  heading.textContent = 'Daily Dashboard';
  const subtitle = document.createElement('p');
  subtitle.className = 'mt-1 text-xs text-slate-300';
  subtitle.textContent = 'Live game snapshots update as you play. Unknown items need a fresh game snapshot.';
  const actions = document.createElement('div');
  actions.id = 'dashboard-actions';
  actions.className = 'mt-3 flex flex-wrap gap-2';

  const currentRaidQueue = typeof raidQueueState !== 'undefined' ? raidQueueState : null;
  const raidQueueRunning = currentRaidQueue && !['stopped', 'complete'].includes(currentRaidQueue.phase);
  const remainingRaidCount = raidQueueRunning ?
    (currentRaidQueue.bossQueue?.remain_raid_count ??
     Math.max(0, (currentRaidQueue.options?.count || 0) - (globalThis.hwaHelperRaidQueue?.confirmedWins?.(currentRaidQueue) ?? 0))) : 0;

  const currentMonsterQueue = typeof monsterQueueState !== 'undefined' ? monsterQueueState : null;
  const monsterQueueRunning = currentMonsterQueue && !['stopped', 'complete'].includes(currentMonsterQueue.phase);
  const remainingMonsterCount = monsterQueueRunning ?
    Math.max(0, (currentMonsterQueue.options?.count || 0) - (globalThis.hwaHelperMonsterQueue?.confirmedWins?.(currentMonsterQueue) ?? currentMonsterQueue.completed ?? 0)) : 0;

  const dialogButton = (id, label, dialogId, color, open, badgeCount = 0) => {
    const control = document.createElement('button');
    control.id = id; control.type = 'button'; control.textContent = label;
    control.className = `relative cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white ${color}`;
    control.setAttribute('aria-haspopup', 'dialog');
    control.setAttribute('aria-controls', dialogId);
    if (badgeCount > 0) {
      const badge = document.createElement('span');
      badge.id = `${id}-badge`;
      badge.dataset.queueCount = String(badgeCount);
      badge.className = 'absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold leading-none text-white shadow-xs ring-2 ring-slate-900 animate-pulse pointer-events-none';
      badge.textContent = String(badgeCount);
      badge.title = `${badgeCount} queued remaining`;
      badge.setAttribute('aria-label', `${badgeCount} queued remaining`);
      control.append(badge);
    }
    control.addEventListener('click', () => {
      open(); document.querySelector(`#${dialogId}`).showModal();
    });
    actions.append(control);
  };
  dialogButton('open-raid-dialog', 'Raid', 'raid-dialog', 'bg-blue-600 hover:bg-blue-500',
    () => renderExperimental(currentCache, true), remainingRaidCount);
  dialogButton('open-gather-dialog', 'Gathering', 'gather-dialog', 'bg-teal-600 hover:bg-teal-500',
    () => renderExperimental(currentCache));
  dialogButton('open-monster-dialog', 'Monster', 'monster-dialog', 'bg-orange-600 hover:bg-orange-500',
    () => renderMonster(currentCache), remainingMonsterCount);
  intro.append(heading, subtitle, actions);
  container.append(intro);

  if (typeof updateDashboardGameStatus === 'function') {
    updateDashboardGameStatus(actions, gameTabAlert);
  }

  // --- TROOPS OVERVIEW SECTION ---
  renderDashboardTroops(cache, container);

  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'space-y-2';
    const title = document.createElement('h3');
    title.className = 'text-sm font-bold text-slate-800 dark:text-slate-200';
    title.textContent = group.title;
    section.append(title);
    const cardGrid = document.createElement('div');
    cardGrid.className = 'grid grid-cols-1 min-[480px]:grid-cols-2 gap-2.5';
    for (const item of group.rows) {
      const isQuest = group.title === 'Daily Quests' || item.id === 'daily-quests' || item.id === 'event-daily-quests';
      const isTower = item.id === 'tower';
      const isDungeon = item.id === 'dungeon';
      const isInteractive = isQuest || isTower || isDungeon;
      const card = document.createElement('div');
      card.className = `flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/80 transition-all ${
        isInteractive
          ? 'cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 dark:hover:border-violet-500/60 dark:hover:bg-slate-800 shadow-2xs hover:shadow-xs'
          : 'hover:border-slate-300 dark:hover:border-slate-700'
      }`;
      if (isInteractive) {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        if (isQuest) {
          card.setAttribute('aria-haspopup', 'dialog');
          card.setAttribute('aria-controls', 'quest-detail-dialog');
          card.title = 'Click to view quest details';
        } else if (isTower) {
          card.setAttribute('aria-haspopup', 'dialog');
          card.setAttribute('aria-controls', 'tower-modal');
          card.title = 'Click to open Tower automation';
        } else if (isDungeon) {
          card.setAttribute('aria-haspopup', 'dialog');
          card.setAttribute('aria-controls', 'dungeon-modal');
          card.title = 'Click to open Guild Dungeon';
        }

        const openHandler = () => {
          if (isQuest) {
            openQuestDetailDialog(item.id, typeof currentCache !== 'undefined' ? currentCache : cache);
          } else if (isTower) {
            const towerModal = document.querySelector('#tower-modal');
            const closeBtn = document.querySelector('#tower-modal-close');
            if (towerModal) {
              renderTowerModal(typeof currentCache !== 'undefined' ? currentCache : cache);
              towerModal.hidden = false;
              closeBtn?.focus();
            }
          } else if (isDungeon) {
            openDungeonModal((typeof currentCache !== 'undefined' ? currentCache : cache)?.dungeonStatus?.data, card);
          }
        };
        card.addEventListener('click', openHandler);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openHandler();
          }
        });
      }

      const icon = document.createElement('span');
      icon.className = 'text-xl shrink-0';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon;
      const content = document.createElement('div');
      content.className = 'min-w-0 flex-1';
      const name = document.createElement('div');
      name.className = 'font-semibold text-slate-900 dark:text-slate-100 truncate text-xs sm:text-sm flex items-center justify-between gap-1';
      name.textContent = item.title;
      if (isInteractive) {
        const indicator = document.createElement('span');
        indicator.className = 'text-[10px] text-violet-500 dark:text-violet-400 font-normal shrink-0';
        indicator.textContent = isQuest ? 'Details ›' : 'Open ›';
        name.append(indicator);
      }
      const detail = document.createElement('div');
      detail.className = 'text-xs text-slate-500 dark:text-slate-400 truncate';
      detail.textContent = item.detail;
      content.append(name, detail);
      const badge = document.createElement('span');
      badge.className = `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        item.state === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-700/50' :
        item.state === 'done' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50' :
        'bg-slate-100 text-slate-600 dark:bg-slate-700/80 dark:text-slate-300 dark:border dark:border-slate-600'}`;
      badge.textContent = item.state === 'pending' ? 'To do' : item.state === 'done' ? 'Done' : item.state === 'info' ? 'Check' : 'Unknown';
      card.append(icon, content, badge);
      cardGrid.append(card);
    }
    section.append(cardGrid);
    container.append(section);
  }
  view.append(container);
}

function renderDashboardTroops(cache, container, now = Date.now()) {
  const section = document.createElement('div');
  section.id = 'dashboard-troops-section';
  section.className = 'space-y-2';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between';
  header.innerHTML = `
    <div class="flex items-center gap-1.5">
      <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
        <span>🪖</span> Troops
      </h3>
      <span class="text-xs text-slate-400 dark:text-slate-500 font-normal">· Forces & Hospital</span>
    </div>
  `;

  const headerActions = document.createElement('div');
  headerActions.className = 'flex items-center gap-2';

  const refreshBtn = document.createElement('button');
  refreshBtn.id = 'dashboard-troops-refresh-btn';
  refreshBtn.type = 'button';
  refreshBtn.title = 'Refresh troops, hospital, and training status';
  refreshBtn.className = 'cursor-pointer text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors';
  refreshBtn.innerHTML = '<span class="text-sm">↻</span> <span class="hidden sm:inline">Refresh</span>';
  refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true;
    const spinner = refreshBtn.querySelector('span');
    if (spinner) spinner.classList.add('inline-block', 'animate-spin');
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        kind: 'refresh-rpc',
        calls: [
          { name: 'getUnitSummary', feature: 'unit' },
          { name: 'getTrainings', feature: 'unit' },
          { name: 'getHealing', feature: 'unit' }
        ]
      }, () => {
        setTimeout(() => {
          refreshBtn.disabled = false;
          if (spinner) spinner.classList.remove('inline-block', 'animate-spin');
        }, 600);
      });
    }
  });

  // Extract troop stats
  const unitSummary = cache?.['getUnitSummary:unit']?.data || cache?.getUnitSummary?.data;
  const healing = cache?.['getHealing:unit']?.data || cache?.getHealing?.data;
  const trainings = cache?.['getTrainings:unit']?.data || cache?.getTrainings?.data;

  // Header Heal Action
  const totalInjured = (healing?.injuredUnits || []).reduce((sum, u) => sum + (Number(u?.count) || 0), 0);
  const isHealingActive = Boolean(
    healing?.healing &&
    Number.isFinite(healing.healing.startDate) &&
    Number.isFinite(healing.healing.duration) &&
    (healing.healing.startDate + healing.healing.duration > now)
  );
  const isHealingReady = Boolean(
    healing?.healing &&
    Number.isFinite(healing.healing.startDate) &&
    Number.isFinite(healing.healing.duration) &&
    (healing.healing.startDate + healing.healing.duration <= now)
  );

  if (isHealingReady) {
    const syncHealBtn = document.createElement('button');
    syncHealBtn.id = 'dashboard-troops-heal-sync-btn';
    syncHealBtn.type = 'button';
    syncHealBtn.className = 'cursor-pointer inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-xs font-semibold shadow-2xs transition-colors';
    syncHealBtn.innerHTML = '<span>✓</span> <span>Sync Healed</span>';
    syncHealBtn.addEventListener('click', () => {
      syncHealBtn.disabled = true;
      const healKey = cache?.['getHealing:unit'] ? 'getHealing:unit' : (cache?.getHealing ? 'getHealing' : 'getHealing:unit');
      if (cache?.[healKey]?.data) {
        cache[healKey].data = { ...cache[healKey].data, healing: null };
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
        chrome.storage.local.set({ rpcCache: cache }).catch(() => {});
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          kind: 'refresh-rpc',
          calls: [
            { name: 'getUnitSummary', feature: 'unit' },
            { name: 'getHealing', feature: 'unit' }
          ]
        });
      }
      container.innerHTML = '';
      renderDashboardTroops(cache, container, Date.now());
    });
    headerActions.append(syncHealBtn);
  } else if (totalInjured > 0 && !isHealingActive) {
    const healAllBtn = document.createElement('button');
    healAllBtn.id = 'dashboard-troops-heal-all-btn';
    healAllBtn.type = 'button';
    healAllBtn.className = 'cursor-pointer inline-flex items-center gap-1 rounded bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 text-xs font-semibold shadow-2xs transition-colors';
    healAllBtn.innerHTML = `<span>🏥</span> <span>Heal All (${totalInjured.toLocaleString()})</span>`;
    healAllBtn.addEventListener('click', () => {
      healAllBtn.disabled = true;
      const unitsToHeal = (healing?.injuredUnits || [])
        .filter((u) => Number(u?.count) > 0)
        .map((u) => ({ unitId: Number(u.unitId), count: Number(u.count) }));
      const countSum = unitsToHeal.reduce((s, u) => s + u.count, 0);
      const duration = Math.max(60000, countSum * 8000);
      const startDate = Date.now();
      const healKey = cache?.['getHealing:unit'] ? 'getHealing:unit' : (cache?.getHealing ? 'getHealing' : 'getHealing:unit');
      if (cache?.[healKey]?.data) {
        cache[healKey].data = {
          ...cache[healKey].data,
          healing: { startDate, duration, units: unitsToHeal }
        };
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
        chrome.storage.local.set({ rpcCache: cache }).catch(() => {});
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          kind: 'refresh-rpc',
          calls: [
            {
              name: 'startHealing',
              args: { startDate, duration, units: unitsToHeal },
              feature: 'unit'
            }
          ]
        });
      }
      container.innerHTML = '';
      renderDashboardTroops(cache, container, Date.now());
    });
    headerActions.append(healAllBtn);
  }

  headerActions.append(refreshBtn);
  header.append(headerActions);
  section.append(header);

  const troopDefs = [
    { type: 0, label: 'Marksmen', icon: '🏹', badgeCls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    { type: 1, label: 'Spearmen', icon: '🔱', badgeCls: 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
    { type: 2, label: 'Infantry', icon: '🛡️', badgeCls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' }
  ];

  function getTroopType(unitId) {
    const id = Number(unitId);
    if (id >= 1 && id <= 9) return { type: 0, level: id };
    if (id >= 11 && id <= 19) return { type: 1, level: id - 10 };
    if (id >= 21 && id <= 29) return { type: 2, level: id - 20 };
    return null;
  }

  const troopStats = troopDefs.map((def) => ({
    ...def,
    readyByLevel: new Map(),
    readyCount: 0,
    hospitalCount: 0,
    healingActiveCount: 0,
    healingEndsAt: null,
    trainingCount: 0,
    trainingEndsAt: null,
    maxTroops: 0
  }));

  // 1. Available troops
  for (const item of unitSummary?.available || []) {
    const info = getTroopType(item?.unitId);
    const count = Number(item?.count) || 0;
    if (info && count > 0) {
      troopStats[info.type].readyByLevel.set(info.level, (troopStats[info.type].readyByLevel.get(info.level) || 0) + count);
      troopStats[info.type].readyCount += count;
    }
  }

  // 2. Troops in squads
  for (const sq of unitSummary?.squads || []) {
    for (const u of sq?.units || []) {
      const info = getTroopType(u?.id);
      const count = Number(u?.state?.survived) || 0;
      if (info && count > 0) {
        troopStats[info.type].readyByLevel.set(info.level, (troopStats[info.type].readyByLevel.get(info.level) || 0) + count);
        troopStats[info.type].readyCount += count;
      }
    }
  }

  // 3. Hospital / Injured units
  for (const item of healing?.injuredUnits || []) {
    const info = getTroopType(item?.unitId);
    const count = Number(item?.count) || 0;
    if (info && count > 0) {
      troopStats[info.type].hospitalCount += count;
    }
  }

  // 4. Healing active & timer
  if (Array.isArray(healing?.healing?.units) && Number.isFinite(healing.healing.startDate) && Number.isFinite(healing.healing.duration)) {
    const endsAt = healing.healing.startDate + healing.healing.duration;
    for (const item of healing.healing.units) {
      const info = getTroopType(item?.unitId);
      const count = Number(item?.count) || 0;
      if (info && count > 0) {
        troopStats[info.type].healingActiveCount += count;
        troopStats[info.type].healingEndsAt = endsAt;
        if (troopStats[info.type].hospitalCount < count) {
          troopStats[info.type].hospitalCount = count;
        }
      }
    }
  }

  // 5. Training queues & timer
  for (const q of trainings?.trainingQueues || []) {
    const info = getTroopType(q?.unitId);
    const count = Number(q?.unitCount) || 0;
    if (info && count > 0) {
      troopStats[info.type].trainingCount += count;
      if (Number.isFinite(q.startDate) && Number.isFinite(q.duration)) {
        const endsAt = q.startDate + q.duration;
        if (!troopStats[info.type].trainingEndsAt || endsAt < troopStats[info.type].trainingEndsAt) {
          troopStats[info.type].trainingEndsAt = endsAt;
        }
      }
    }
  }

  function formatDuration(sec) {
    if (sec <= 0) return 'Ready';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 md:grid-cols-3 gap-2.5';

  for (const t of troopStats) {
    t.maxTroops = t.readyCount + t.hospitalCount + t.trainingCount;

    const levelsSorted = [...t.readyByLevel.entries()].sort((a, b) => a[0] - b[0]);
    const levelStr = levelsSorted.length > 0
      ? levelsSorted.map(([lvl, cnt]) => `Lv.${lvl}: ${cnt.toLocaleString()}`).join(' · ')
      : '0';

    const healingSec = t.healingEndsAt ? Math.max(0, Math.ceil((t.healingEndsAt - now) / 1000)) : null;
    const healingTimerText = healingSec !== null && healingSec > 0 ? formatDuration(healingSec) : (healingSec !== null && healingSec <= 0 ? 'Ready' : null);
    const healingTooltip = t.healingEndsAt
      ? `Healing: ${t.healingActiveCount.toLocaleString()} units · Ends in ${formatDuration(healingSec)} (${new Date(t.healingEndsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : (t.hospitalCount > 0 ? `Injured in hospital: ${t.hospitalCount.toLocaleString()} (idle)` : 'No injured units');

    const trainingSec = t.trainingEndsAt ? Math.max(0, Math.ceil((t.trainingEndsAt - now) / 1000)) : null;
    const trainingTimerText = trainingSec !== null && trainingSec > 0 ? formatDuration(trainingSec) : (trainingSec !== null && trainingSec <= 0 ? 'Ready' : null);
    const trainingTooltip = t.trainingEndsAt
      ? `Training: ${t.trainingCount.toLocaleString()} units · Ends in ${formatDuration(trainingSec)} (${new Date(t.trainingEndsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : (t.trainingCount > 0 ? `Training: ${t.trainingCount.toLocaleString()} units` : 'No active training');

    const max = t.maxTroops;
    const readyPct = max > 0 ? (t.readyCount / max) * 100 : 0;
    const hospitalPct = max > 0 ? (t.hospitalCount / max) * 100 : 0;
    const trainingPct = max > 0 ? (t.trainingCount / max) * 100 : 0;

    const card = document.createElement('div');
    card.className = 'rounded-xl border border-slate-200 bg-white p-3 space-y-2 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs';

    const queuesForType = (trainings?.trainingQueues || []).filter((q) => {
      const info = getTroopType(q?.unitId);
      return info && info.type === t.type;
    });
    const completedQueue = queuesForType.find((q) => Number.isFinite(q.startDate) && Number.isFinite(q.duration) && (q.startDate + q.duration <= now));
    const activeQueue = queuesForType.find((q) => Number.isFinite(q.startDate) && Number.isFinite(q.duration) && (q.startDate + q.duration > now));

    card.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
          <span class="text-sm">${t.icon}</span>
          <span>${t.label}</span>
        </div>
        <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          Max: <strong class="text-slate-900 dark:text-white tabular-nums">${max.toLocaleString()}</strong>
        </div>
      </div>

      <!-- Segmented Visual Bar -->
      <div class="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex dark:bg-slate-700/60 ring-1 ring-slate-200/50 dark:ring-slate-800" title="Ready: ${t.readyCount.toLocaleString()} · Hospital: ${t.hospitalCount.toLocaleString()} · Training: ${t.trainingCount.toLocaleString()} · Max: ${max.toLocaleString()}">
        ${readyPct > 0 ? `<div style="width: ${readyPct.toFixed(1)}%" class="h-full bg-emerald-500 transition-all duration-300" title="Ready: ${t.readyCount.toLocaleString()} (${readyPct.toFixed(1)}%) · ${levelStr}"></div>` : ''}
        ${hospitalPct > 0 ? `<div style="width: ${hospitalPct.toFixed(1)}%" class="h-full bg-rose-500 transition-all duration-300" title="${healingTooltip}"></div>` : ''}
        ${trainingPct > 0 ? `<div style="width: ${trainingPct.toFixed(1)}%" class="h-full bg-indigo-500 transition-all duration-300" title="${trainingTooltip}"></div>` : ''}
        ${max === 0 ? `<div class="h-full w-full bg-slate-200 dark:bg-slate-700" title="No troops recorded"></div>` : ''}
      </div>

      <!-- Detailed Breakdown & Timers -->
      <div class="space-y-1 text-[11px]">
        <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span class="flex items-center gap-1 truncate" title="${levelStr}">
            <span class="size-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Ready:</span>
            <strong class="text-slate-900 dark:text-white tabular-nums">${t.readyCount.toLocaleString()}</strong>
          </span>
          <span class="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]" title="${levelStr}">${levelStr}</span>
        </div>

        <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span class="flex items-center gap-1" title="${healingTooltip}">
            <span class="size-1.5 rounded-full bg-rose-500 shrink-0"></span>
            <span>Hospital:</span>
            <strong class="${t.hospitalCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'} tabular-nums">${t.hospitalCount.toLocaleString()}</strong>
          </span>
          ${healingTimerText ? `<span class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60 cursor-help" title="${healingTooltip}">⏳ ${healingTimerText}</span>` : ''}
        </div>

        <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
          <span class="flex items-center gap-1" title="${trainingTooltip}">
            <span class="size-1.5 rounded-full bg-indigo-500 shrink-0"></span>
            <span>Training:</span>
            <strong class="${t.trainingCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'} tabular-nums">${t.trainingCount.toLocaleString()}</strong>
          </span>
          ${trainingTimerText ? `<span class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900/60 cursor-help" title="${trainingTooltip}">⏳ ${trainingTimerText}</span>` : ''}
        </div>
      </div>
    `;

    const actionRow = document.createElement('div');
    actionRow.className = 'pt-1.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs';
    const statusSpan = document.createElement('span');
    statusSpan.className = 'text-[11px] font-medium text-slate-500 dark:text-slate-400';
    statusSpan.innerHTML = completedQueue
      ? '<span class="text-emerald-600 dark:text-emerald-400 font-semibold">Training finished</span>'
      : (activeQueue ? '<span class="text-indigo-600 dark:text-indigo-400 font-medium">In training</span>' : 'Idle');
    actionRow.append(statusSpan);

    const actionHost = document.createElement('div');
    actionHost.className = 'troop-card-action';
    actionRow.append(actionHost);
    card.append(actionRow);
    if (completedQueue && actionHost) {
      const collectBtn = document.createElement('button');
      collectBtn.type = 'button';
      collectBtn.className = 'cursor-pointer inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors';
      collectBtn.innerHTML = '<span>✓</span> <span>Ready / Collect</span>';
      collectBtn.addEventListener('click', () => {
        collectBtn.disabled = true;
        const qUnitId = Number(completedQueue.unitId);
        const qCount = Number(completedQueue.unitCount) || 0;
        const trainKey = cache?.['getTrainings:unit'] ? 'getTrainings:unit' : (cache?.getTrainings ? 'getTrainings' : 'getTrainings:unit');
        if (cache?.[trainKey]?.data?.trainingQueues) {
          cache[trainKey].data.trainingQueues = cache[trainKey].data.trainingQueues.filter((q) => q !== completedQueue);
        }
        const sumKey = cache?.['getUnitSummary:unit'] ? 'getUnitSummary:unit' : (cache?.getUnitSummary ? 'getUnitSummary' : 'getUnitSummary:unit');
        if (cache?.[sumKey]?.data?.available) {
          const avail = cache[sumKey].data.available;
          const match = avail.find((item) => Number(item.unitId) === qUnitId);
          if (match) {
            match.count = (Number(match.count) || 0) + qCount;
          } else {
            avail.push({ unitId: qUnitId, count: qCount });
          }
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
          chrome.storage.local.set({ rpcCache: cache }).catch(() => {});
        }
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            kind: 'refresh-rpc',
            calls: [
              { name: 'completeTraining', args: { unitId: qUnitId }, feature: 'unit' },
              { name: 'getUnitSummary', feature: 'unit' },
              { name: 'getTrainings', feature: 'unit' }
            ]
          });
        }
        container.innerHTML = '';
        renderDashboardTroops(cache, container, Date.now());
      });
      actionHost.append(collectBtn);
    } else if (!activeQueue && actionHost) {
      const trainBtn = document.createElement('button');
      trainBtn.type = 'button';
      trainBtn.className = 'cursor-pointer inline-flex items-center gap-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 text-[11px] font-semibold shadow-2xs transition-colors';
      trainBtn.innerHTML = '<span>⚔️</span> <span>Train (26)</span>';
      trainBtn.addEventListener('click', () => {
        trainBtn.disabled = true;
        const defaultTier = 7;
        const highestTier = levelsSorted.length > 0 ? levelsSorted[levelsSorted.length - 1][0] : defaultTier;
        const targetUnitId = t.type === 0 ? highestTier : (t.type === 1 ? 10 + highestTier : 20 + highestTier);
        const count = 26;
        const duration = 1204892;
        const startDate = Date.now();
        const trainKey = cache?.['getTrainings:unit'] ? 'getTrainings:unit' : (cache?.getTrainings ? 'getTrainings' : 'getTrainings:unit');
        if (cache?.[trainKey]?.data) {
          const queues = [...(cache[trainKey].data.trainingQueues || [])];
          queues.push({ unitId: targetUnitId, unitCount: count, startDate, duration });
          cache[trainKey].data.trainingQueues = queues;
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
          chrome.storage.local.set({ rpcCache: cache }).catch(() => {});
        }
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            kind: 'refresh-rpc',
            calls: [
              {
                name: 'startTraining',
                args: { unitId: targetUnitId, count, startDate, duration },
                feature: 'unit'
              },
              { name: 'getTrainings', feature: 'unit' }
            ]
          });
        }
        container.innerHTML = '';
        renderDashboardTroops(cache, container, Date.now());
      });
      actionHost.append(trainBtn);
    } else if (actionHost) {
      const inProgressBadge = document.createElement('span');
      inProgressBadge.className = 'text-[10px] text-slate-400 dark:text-slate-500';
      inProgressBadge.textContent = trainingTimerText ? `Ends in ${trainingTimerText}` : 'Training';
      actionHost.append(inProgressBadge);
    }

    grid.append(card);
  }

  section.append(grid);
  container.append(section);
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
    const isStaleVersusDay = cache.clanVersusStatus?.updatedAt &&
      new Date(cache.clanVersusStatus.updatedAt).toDateString() !== new Date().toDateString();
    const personalScore = isStaleVersusDay ? 0 : (vsStatus.score ?? rewards.userRoundPoints ?? 0);
    const claimedCount = isStaleVersusDay ? 0 : (vsStatus.chestNumbers || []).length;

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
        card.className = 'rounded-xl border border-blue-300 bg-blue-50/50 p-4 shadow-sm hover:border-blue-400 transition-colors cursor-pointer dark:border-blue-800/60 dark:bg-blue-950/30 dark:hover:border-blue-700/80';
        card.addEventListener('click', () => openDungeonModal(dungeonStatus, card));

        const topRow = document.createElement('div');
        topRow.className = 'flex items-center justify-between gap-2 flex-wrap mb-2.5';
        topRow.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span class="font-bold text-slate-900 dark:text-slate-100 text-sm">Titan Dungeon</span>
            <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800/50">Floor ${floor}</span>
          </div>
          <span class="text-xs font-semibold text-blue-800 dark:text-blue-300">Prime Element: ${prime}</span>
        `;

        const detailsBox = document.createElement('div');
        detailsBox.className = 'flex items-center justify-between rounded-lg bg-white border border-blue-100 p-3 text-xs mb-2.5 dark:bg-slate-800/80 dark:border-blue-900/50';
        detailsBox.innerHTML = `
          <div class="min-w-0">
            <div class="text-slate-500 dark:text-slate-400">Progress</div>
            <div class="text-blue-900 dark:text-blue-300 font-bold text-sm">Cleared ${dungeonStatus.maxFloorPassed || 0} Floors</div>
          </div>
          <div class="text-center">
            <div class="text-slate-500 dark:text-slate-400">Checkpoint</div>
            <div class="text-slate-800 dark:text-slate-200 font-bold text-sm">Floor ${respawn}</div>
          </div>
          <div class="text-right">
            <div class="text-slate-500 dark:text-slate-400">Guild Activity</div>
            <div class="text-emerald-700 dark:text-emerald-400 font-bold text-sm">${activity.toLocaleString()} pts</div>
          </div>
        `;

        const footerRow = document.createElement('div');
        footerRow.className = 'flex items-center justify-between gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400';
        footerRow.innerHTML = `
          <div class="text-xs text-slate-500 dark:text-slate-400">
            Click to view floor doors & titan health status
          </div>
          <button type="button" class="cursor-pointer font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 inline-flex items-center gap-1">
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
  const questData = globalThis.hwaHelperQuestData;
  const questEvents = questData?.visibleMetadata(cache);
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

  for (const event of questData?.visibleEvents(cache) || []) {
    const title = questData.title(event);
    const open = event.groups.reduce((sum, group) => sum + group.quests.filter((quest) =>
      quest.state === 'inProgress').length, 0);
    const daily = event.groups.filter((group) => group.repeatType === 'daily' &&
      group.quests.some((quest) => quest.state === 'inProgress')).length;
    eventCards.push({ id: `specialQuest:${event.id}`, type: 'special_event',
      title: `✨ ${title}`, searchStr: `special quest ${title}`.toLowerCase(),
      render: () => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs';
        const heading = document.createElement('div');
        heading.className = 'font-bold text-slate-900 text-sm';
        heading.textContent = `✨ ${title}`;
        const detail = document.createElement('div');
        detail.className = 'mt-1 text-xs text-slate-600';
        detail.textContent = `${open} open milestones · ${daily} daily groups · Ends ${new Date(event.end).toLocaleString()}`;
        card.append(heading, detail);
        return card;
      } });
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

let expandedTowerFloor = null;

function towerRewardText(reward) {
  if (!reward || typeof reward !== 'object') return '—';
  const parts = [];
  for (const [kind, value] of Object.entries(reward)) {
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
      const label = { gold: 'Gold', starmoney: 'Emeralds', experience: 'XP', stamina: 'Energy', drafts_chip: 'Draft Chips' }[kind] || kind;
      parts.push(`${Number(value).toLocaleString()} ${label}`);
    } else if (value && typeof value === 'object') {
      for (const [id, amount] of Object.entries(value)) {
        const label = globalThis.hwaHelperNameMap?.item?.(kind, id) || `${kind} #${id}`;
        parts.push(`${Number(amount).toLocaleString()} × ${label}`);
      }
    }
  }
  return parts.join(', ') || '—';
}

function combineTowerRewards(...rewards) {
  const merged = {};
  for (const r of rewards) {
    if (!r || typeof r !== 'object') continue;
    for (const [kind, value] of Object.entries(r)) {
      if (typeof value === 'number' || (typeof value === 'string' && Number.isFinite(Number(value)))) {
        merged[kind] = (Number(merged[kind]) || 0) + Number(value);
      } else if (value && typeof value === 'object') {
        if (!merged[kind]) merged[kind] = {};
        for (const [id, amount] of Object.entries(value)) {
          merged[kind][id] = (Number(merged[kind][id]) || 0) + Number(amount);
        }
      }
    }
  }
  return merged;
}

function renderTowerModal(cache = currentCache) {
  const body = document.querySelector('#tower-modal-body');
  const badge = document.querySelector('#tower-modal-badge');
  if (!body || !badge) return;
  const session = cache?.towerSession?.data || {};
  const status = cache?.towerStatus?.data || {};
  const complete = Boolean(session.completed || status.isCleared || status.state === 'win');
  const floor = session.floorNumber || (complete ? 0 : status.floorNumber) || 0;
  badge.textContent = complete ? 'Completed' : floor ? `Floor ${floor}` : 'Waiting for data';
  badge.className = complete
    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
    : 'rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800';
  body.replaceChildren();

  const catalog = globalThis.hwaHelperTowerBuffs || {};
  const buffCatalogIds = Object.keys(catalog).map(Number).sort((a, b) => a - b);
  const defaultBuffOrder = globalThis.hwaHelperTowerAutomation?.DEFAULT_BUFF_PRIORITY || buffCatalogIds;
  const savedBuffOrder = towerAutomationSettings?.buffPriority || [];
  const buffOrder = [...new Set([...savedBuffOrder, ...defaultBuffOrder, ...buffCatalogIds])].filter((id) => catalog[id]);

  function section(title) {
    const card = document.createElement('section');
    card.className = 'space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
    const heading = document.createElement('h3');
    heading.className = 'text-sm font-bold text-slate-900 dark:text-slate-100';
    heading.textContent = title;
    card.append(heading);
    body.append(card);
    return card;
  }
  function line(parent, value, emphasis = false) {
    const row = document.createElement('p');
    row.className = emphasis ? 'text-sm font-semibold text-slate-800 dark:text-slate-200' : 'text-xs leading-5 text-slate-600 dark:text-slate-400';
    row.textContent = value;
    parent.append(row);
  }
  function heroList(ids) {
    return (ids || []).map((id) => globalThis.hwaHelperNameMap?.hero?.(id) || `Hero #${id}`).join(', ');
  }
  function buffText(id) {
    const buff = globalThis.hwaHelperTowerBuffs?.[id];
    return buff ? `${buff.name} (#${id}) — ${buff.description}` : `Buff #${id}`;
  }
  function renderBuffPriority() {
    const card = section('Buff priority');
    line(card, 'Drag a buff to set its priority. The first offered buff in this order is selected. Combat routes also prioritize doors leading to the highest buff in this list.');
    const groups = [
      { label: 'Physical', ids: [8, 14, 26, 30], classes: 'border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200' },
      { label: 'Magic', ids: [9, 15, 27, 33, 45], classes: 'border-indigo-300 bg-indigo-100 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200' },
      { label: 'Physical + Magic', ids: [41], classes: 'border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-200' },
      { label: 'Critical', ids: [2, 7, 13, 28, 29], classes: 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200' },
      { label: 'Vampirism', ids: [11, 16], classes: 'border-pink-300 bg-pink-100 text-pink-950 dark:border-pink-800 dark:bg-pink-950/60 dark:text-pink-200' },
      { label: 'Control', ids: [3, 5, 18, 31, 32], classes: 'border-cyan-300 bg-cyan-100 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200' },
      { label: 'Health', ids: [17, 34, 35, 37], classes: 'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' },
      { label: 'Energy', ids: [6, 25, 38, 39, 46], classes: 'border-yellow-300 bg-yellow-100 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200' },
      { label: 'Defense', ids: [10, 12, 36, 42, 43], classes: 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200' },
      { label: 'Damage', ids: [1, 4, 40], classes: 'border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-200' },
      { label: 'Utility', ids: [44], classes: 'border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200' }
    ];
    const effectIcons = {
      1: '💥', 2: '🎯', 3: '✴', 4: '💥', 5: '✴', 7: '🎯', 11: '🩸', 13: '🎯',
      16: '🩸', 18: '🔇', 26: '💥', 27: '💥', 28: '🎯', 29: '🎯', 30: '💥',
      31: '👁', 32: '🔇', 33: '💥', 40: '💥', 41: '💥', 42: '💥', 45: '💥'
    };
    const legend = document.createElement('div');
    legend.className = 'mb-2 flex flex-wrap gap-1.5';
    legend.setAttribute('aria-label', 'Tower buff color legend');
    for (const group of groups) {
      const key = document.createElement('span');
      key.className = `rounded-full border px-2 py-0.5 text-[10px] font-medium ${group.classes}`;
      key.textContent = group.label;
      legend.append(key);
    }
    card.append(legend);
    const list = document.createElement('div');
    list.className = 'flex flex-wrap gap-2';
    list.setAttribute('aria-label', 'Tower buff priority, highest first');
    const move = (from, to) => {
      if (!buffOrder.includes(from) || !buffOrder.includes(to) || from === to) return;
      const targetIndex = buffOrder.indexOf(to);
      buffOrder.splice(buffOrder.indexOf(from), 1);
      buffOrder.splice(targetIndex, 0, from);
      towerAutomationSettings = {
        ...(towerAutomationSettings || {}),
        accountId: cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id ?? null,
        buffPriority: buffOrder
      };
      chrome.storage?.local?.set?.({ towerAutomationSettings }).catch(() => {});
      renderTowerModal(cache);
    };
    for (const id of buffOrder) {
      const pill = document.createElement('button');
      pill.type = 'button'; pill.draggable = true;
      pill.dataset.buffId = String(id);
      const group = groups.find((item) => item.ids.includes(id));
      pill.className = `cursor-grab rounded-full border px-3 py-1 text-xs font-medium active:cursor-grabbing ${
        group?.classes || 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200'}`;
      pill.textContent = `${String(id).padStart(2, '0')}. ${catalog[id].name}`;
      if (effectIcons[id]) {
        const icon = document.createElement('span');
        icon.className = 'ml-1';
        icon.textContent = effectIcons[id];
        icon.setAttribute('aria-hidden', 'true');
        pill.append(icon);
      }
      pill.title = `${group?.label || 'Other'} · ${catalog[id].description}`;
      pill.setAttribute('aria-label', `Buff ${id}: ${catalog[id].name}, ${group?.label || 'Other'}, priority ${buffOrder.indexOf(id) + 1}. Use arrow keys to reorder.`);
      pill.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', String(id)));
      pill.addEventListener('dragover', (event) => event.preventDefault());
      pill.addEventListener('drop', (event) => {
        event.preventDefault();
        move(Number(event.dataTransfer?.getData('text/plain')), id);
      });
      pill.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const target = buffOrder[buffOrder.indexOf(id) + (event.key === 'ArrowLeft' ? -1 : 1)];
        if (target != null) move(id, target);
      });
      list.append(pill);
    }
    card.append(list);
  }
  function renderAutomation() {
    const card = section('Automatic Tower');
    const running = towerRunState && !['stopped', 'complete'].includes(towerRunState.phase);

    // Get candidate heroes from cache
    const heroEntries = Object.entries(cache?.heroGetAll?.data || {}).map(([id, h]) => ({
      id: Number(id),
      name: globalThis.hwaHelperNameMap?.hero?.(id) || `Hero #${id}`,
      power: Number(h.power) || 0,
      level: Number(h.level) || 1
    })).sort((a, b) => b.power - a.power);

    const savedTeam = cache?.teamGetAll?.data?.magicTower;
    let selectedHeroes = Array.isArray(towerAutomationSettings?.heroes) && towerAutomationSettings.heroes.length === 5 && towerAutomationSettings.heroes.every(Number.isInteger)
      ? [...towerAutomationSettings.heroes]
      : (Array.isArray(savedTeam) && savedTeam.length === 5 && savedTeam.every(Number.isInteger)
        ? [...savedTeam]
        : heroEntries.slice(0, 5).map((h) => h.id));

    function saveSelectedTeam(teamIds) {
      towerAutomationSettings = {
        ...(towerAutomationSettings || {}),
        accountId: cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id ?? null,
        heroes: teamIds
      };
      chrome.storage?.local?.set?.({ towerAutomationSettings }).catch(() => {});
    }

    // Team selection container
    const teamBox = document.createElement('div');
    teamBox.className = 'space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/50';

    const teamHeader = document.createElement('div');
    teamHeader.className = 'flex items-center justify-between gap-2';
    teamHeader.innerHTML = '<span class="text-xs font-bold text-slate-800 dark:text-slate-200">Magic Tower Team (5 Heroes)</span>';

    if (heroEntries.length >= 5) {
      const autoFillBtn = document.createElement('button');
      autoFillBtn.type = 'button';
      autoFillBtn.className = 'text-2xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 cursor-pointer';
      autoFillBtn.textContent = '⚡ Auto-fill Top 5 Power';
      autoFillBtn.addEventListener('click', () => {
        selectedHeroes = heroEntries.slice(0, 5).map((h) => h.id);
        saveSelectedTeam(selectedHeroes);
        renderTowerModal(cache);
      });
      teamHeader.append(autoFillBtn);
    }
    teamBox.append(teamHeader);

    if (heroEntries.length > 0) {
      const selectsGrid = document.createElement('div');
      selectsGrid.className = 'grid grid-cols-1 sm:grid-cols-5 gap-2';
      for (let i = 0; i < 5; i++) {
        const select = document.createElement('select');
        select.className = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-violet-500';
        select.disabled = running;
        for (const h of heroEntries) {
          const opt = document.createElement('option');
          opt.value = String(h.id);
          opt.textContent = `${h.name} (${h.power ? h.power.toLocaleString('en-US') : `Lv.${h.level}`})`;
          if (selectedHeroes[i] === h.id) opt.selected = true;
          select.append(opt);
        }
        if (!selectedHeroes[i] && heroEntries[i]) {
          selectedHeroes[i] = heroEntries[i].id;
        }
        select.addEventListener('change', (e) => {
          selectedHeroes[i] = Number(e.target.value);
          saveSelectedTeam(selectedHeroes);
        });
        selectsGrid.append(select);
      }
      teamBox.append(selectsGrid);
    } else {
      const inputWrap = document.createElement('div');
      inputWrap.className = 'flex items-center gap-2';
      const input = document.createElement('input');
      input.type = 'text';
      input.disabled = running;
      input.placeholder = 'e.g. 79, 72, 16, 54, 60';
      input.value = selectedHeroes.join(', ');
      input.className = 'flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
      input.addEventListener('change', () => {
        const parsed = input.value.split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
        if (parsed.length === 5) {
          selectedHeroes = parsed;
          saveSelectedTeam(selectedHeroes);
        }
      });
      inputWrap.append(input);
      teamBox.append(inputWrap);
    }

    const buffNote = document.createElement('div');
    buffNote.className = 'text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1';
    buffNote.innerHTML = '<span>🚪</span><span>Battle choices automatically prioritize doors leading to buffs following the priority order below.</span>';
    teamBox.append(buffNote);

    card.append(teamBox);

    const actionButton = (label, handler, disabled = false) => {
      const control = document.createElement('button');
      control.type = 'button'; control.textContent = label; control.disabled = disabled;
      control.className = 'cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700 transition-colors shadow-xs';
      control.addEventListener('click', handler);
      card.append(control);
    };

    if (towerRunState) line(card, `Status: ${towerRunState.phase}${towerRunState.floor ?
      ` · floor ${towerRunState.floor}, room ${towerRunState.room}` : ''}${towerRunState.reason ?
      ` · ${towerRunState.reason}` : ''}`, true);
    if (towerAutomationMessage) line(card, towerAutomationMessage);

    if (running) {
      actionButton('Stop Tower automation', async () => {
        const response = await chrome.runtime.sendMessage({ kind: 'tower-run-stop' });
        towerAutomationMessage = response?.ok ? 'Tower automation stopped.' : response?.error || 'Could not stop Tower automation.';
        render();
      });
    } else {
      actionButton('Start Tower automation', async () => {
        const response = await chrome.runtime.sendMessage({
          kind: 'tower-run-start',
          heroes: selectedHeroes,
          buffPriority: buffOrder
        });
        towerAutomationMessage = response?.ok ? 'Tower automation started. Running automatically...' :
          response?.error || 'Could not start Tower automation.';
        render();
      }, !popupRpcEnabled || complete || selectedHeroes.length !== 5);
    }

    line(card, 'Fully automatic: automatically executes battles, selects the optimal door towards priority buffs, collects free chests, and activates buffs.');
  }
  if (!floor && !complete) {
    line(section('Tower status'), 'No Tower data captured yet. Open the Tower in the game to sync.');
    renderAutomation();
    renderBuffPriority();
    return;
  }
  const summary = section('Progress');
  line(summary, complete ? `Tower completed at floor ${floor || 'unknown'}.` : `Current floor: ${floor} · room ${session.roomNumber ?? 'unknown'}.`, true);
  if (session.team?.length) line(summary, `Team: ${heroList(session.team)}`);
  if (complete && session.completion) {
    const result = session.completion;
    line(summary, `Total clears: ${result.totalClears ?? '—'} · streak: ${result.streak ?? '—'}`);
    if (result.reward?.battleWins) line(summary, `Battle rewards: ${towerRewardText(result.reward.battleWins)}`);
    if (result.reward?.chests) line(summary, `Chest rewards: ${towerRewardText(result.reward.chests)}`);
  }

  if (!complete) {
    const current = section('Current choices');
    const rooms = Object.values(session.rooms || {}).sort((a, b) => Number(a.roomNumber) - Number(b.roomNumber));
    if (!rooms.length) line(current, 'Current room options have not been captured.');

    const planner = globalThis.hwaHelperTowerAutomation;
    const recommendedRoom = (session.roomNumber === 0 && planner?.chooseBattleRoom)
      ? planner.chooseBattleRoom(session.rooms || {}, buffOrder, session.history || [], session.floorNumber)
      : null;

    for (const room of rooms) {
      const number = room.roomNumber;
      const marker = Number(number) === Number(session.roomNumber) ? ' (current)' : '';
      if (room.type === 'buffs') {
        line(current, `Room ${number}${marker} · Buff choices`, true);
        for (const id of room.buffs || []) line(current, buffText(id));
        if (!room.buffs?.length) line(current, 'Unknown');
      } else if (room.type === 'chests') {
        line(current, `Room ${number}${marker} · Chests`, true);
        for (const [choice, cost] of Object.entries(room.openCosts || {})) {
          const opened = room.openChests?.[choice] != null;
          line(current, `Chest ${choice}: ${cost ? towerRewardText(cost) : 'free'}${opened ? ' · opened' : ''}`);
        }
        if (room.rewards?.length) {
          line(current, `Possible rewards (positions not confirmed): ${room.rewards.map((x) => towerRewardText(x.reward)).join(' / ')}`);
        }
      } else if (room.type === 'hero_battle' || room.type === 'boss_battle') {
        const units = room.defenders?.units || [];
        const isRecommended = recommendedRoom && Number(recommendedRoom.roomNumber) === Number(number);
        line(current, `Room ${number}${marker}${isRecommended ? ' · ⭐ Recommended (Best Buff Path)' : ''} · ${room.type === 'boss_battle' ? 'Boss' : 'Battle'}: ${heroList(units.map((x) => x.id)) || 'opponents unknown'}`, true);
        const nextRoom = session.rooms?.[Number(number) + 1];
        if (nextRoom?.type === 'buffs' && Array.isArray(nextRoom.buffs) && nextRoom.buffs.length) {
          line(current, `Leads to Buffs: ${nextRoom.buffs.map((bId) => catalog[bId]?.name ? `${catalog[bId].name} (#${bId})` : `#${bId}`).join(', ')}`);
        }
        if (room.reward) line(current, `Win reward: ${towerRewardText(room.reward)}`);
      } else {
        line(current, `Room ${number}${marker} · ${room.type || 'unknown'}`);
      }
    }
  }

  const history = section('Route and decisions');
  const entries = session.history || [];
  if (!entries.length) {
    line(history, 'No Tower actions recorded in this session.');
  } else {
    // Group events by floor for accordion progress view
    const floorGroups = new Map();
    const ungrouped = [];
    for (const event of entries) {
      const f = Number(event.floor);
      if (Number.isInteger(f) && f > 0) {
        if (!floorGroups.has(f)) {
          floorGroups.set(f, {
            floor: f,
            battle: null,
            buff: null,
            chest: null,
            events: []
          });
        }
        const group = floorGroups.get(f);
        group.events.push(event);
        if (event.action === 'endBattle') group.battle = event;
        else if (event.action === 'activateBuff') group.buff = event;
        else if (event.action === 'openChest') group.chest = event;
      } else {
        ungrouped.push(event);
      }
    }

    const accordionWrap = document.createElement('div');
    accordionWrap.className = 'space-y-2 mt-2';
    accordionWrap.setAttribute('data-tower-accordion', 'true');

    // Sort floors ascending (1, 2, 3...)
    const sortedFloors = Array.from(floorGroups.values()).sort((a, b) => a.floor - b.floor);

    for (const group of sortedFloors) {
      const f = group.floor;
      const isExpanded = expandedTowerFloor === f;

      // 1. Battle summary
      let battleSummary = 'Not fought';
      if (group.battle) {
        const roomNum = group.battle.room != null ? `Room ${group.battle.room}` : 'Room';
        const result = group.battle.win ? 'Victory' : 'Defeat';
        battleSummary = `${roomNum} (${result})`;
      }

      // 2. Buff summary
      let buffSummary = 'No buff';
      if (group.buff) {
        const buffObj = catalog[group.buff.buffId];
        buffSummary = buffObj?.name || `Buff #${group.buff.buffId}`;
      }

      // 3. Combined rewards summary
      const combinedReward = combineTowerRewards(group.battle?.reward, group.chest?.reward);
      const rewardSummary = Object.keys(combinedReward).length > 0 ? towerRewardText(combinedReward) : '—';

      // Card wrapper for this floor
      const itemCard = document.createElement('div');
      itemCard.className = `rounded-xl border transition-all overflow-hidden ${
        isExpanded
          ? 'border-violet-300 bg-violet-50/20 dark:border-violet-800 dark:bg-violet-950/20 shadow-xs'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700'
      }`;
      itemCard.setAttribute('data-tower-floor', String(f));

      // Compact Clickable Header Button
      const headerBtn = document.createElement('button');
      headerBtn.type = 'button';
      headerBtn.className = 'w-full flex items-center justify-between p-3 text-left transition-colors cursor-pointer gap-2 select-none';
      headerBtn.setAttribute('aria-expanded', String(isExpanded));
      headerBtn.setAttribute('aria-controls', `tower-floor-detail-${f}`);

      headerBtn.innerHTML = `
        <div class="flex items-center gap-2.5 flex-wrap flex-1 min-w-0 text-xs">
          <span class="rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-950/80 dark:text-violet-300 dark:border dark:border-violet-800/60 shrink-0">
            Floor ${f}
          </span>
          <span class="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200 shrink-0">
            <span>⚔️</span>
            <span>${battleSummary}</span>
          </span>
          <span class="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 truncate max-w-[180px] shrink-0" title="${buffSummary}">
            <span>✨</span>
            <span class="truncate">${buffSummary}</span>
          </span>
          <span class="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium truncate flex-1 min-w-[120px]" title="${rewardSummary}">
            <span>🎁</span>
            <span class="truncate">${rewardSummary}</span>
          </span>
        </div>
        <div class="shrink-0 flex items-center text-slate-400 dark:text-slate-500 pl-1">
          <svg class="size-4 transform transition-transform ${isExpanded ? 'rotate-180 text-violet-600 dark:text-violet-400' : ''}" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
          </svg>
        </div>
      `;

      // Accordion toggle: single floor active at any time
      headerBtn.addEventListener('click', () => {
        expandedTowerFloor = expandedTowerFloor === f ? null : f;
        renderTowerModal(cache);
      });

      itemCard.append(headerBtn);

      // Detail Panel (visible only when expanded)
      const detailPanel = document.createElement('div');
      detailPanel.id = `tower-floor-detail-${f}`;
      detailPanel.className = `border-t border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2 bg-slate-50/70 dark:bg-slate-950/40 text-xs ${
        isExpanded ? '' : 'hidden'
      }`;

      for (const event of group.events) {
        if (event.action === 'endBattle') {
          line(detailPanel, `Floor ${event.floor}, room ${event.room}: ${event.win ? 'Victory' : 'Defeat'}${event.stars != null ? ` · ${event.stars} stars` : ''}${event.enemyIds?.length ? ` vs ${heroList(event.enemyIds)}` : ''} · ${towerRewardText(event.reward)}`);
        } else if (event.action === 'activateBuff') {
          line(detailPanel, `Floor ${event.floor}, room ${event.room}: selected ${buffText(event.buffId)}`);
          if (event.options?.length) line(detailPanel, `Offered buffs: ${event.options.map(buffText).join(' / ')}`);
        } else if (event.action === 'openChest') {
          line(detailPanel, `Floor ${event.floor}, room ${event.room}: opened chest ${event.number} · ${towerRewardText(event.reward)}`);
          const offered = Object.entries(event.options || {}).map(([number, cost]) =>
            `#${number} ${cost ? towerRewardText(cost) : 'free'}`);
          if (offered.length) line(detailPanel, `Offered chests: ${offered.join(' / ')}`);
          if (event.possibleRewards?.length) line(detailPanel,
            `Possible rewards (positions not confirmed): ${event.possibleRewards.map(towerRewardText).join(' / ')}`);
        }
      }

      itemCard.append(detailPanel);
      accordionWrap.append(itemCard);
    }

    history.append(accordionWrap);

    if (ungrouped.length > 0) {
      for (const event of ungrouped) {
        if (event.action === 'endBattle') {
          line(history, `Floor ${event.floor || '?'}, room ${event.room}: ${event.win ? 'Victory' : 'Defeat'}${event.stars != null ? ` · ${event.stars} stars` : ''}${event.enemyIds?.length ? ` vs ${heroList(event.enemyIds)}` : ''} · ${towerRewardText(event.reward)}`);
        } else if (event.action === 'activateBuff') {
          line(history, `Floor ${event.floor || '?'}, room ${event.room}: selected ${buffText(event.buffId)}`);
          if (event.options?.length) line(history, `Offered buffs: ${event.options.map(buffText).join(' / ')}`);
        } else if (event.action === 'openChest') {
          line(history, `Floor ${event.floor || '?'}, room ${event.room}: opened chest ${event.number} · ${towerRewardText(event.reward)}`);
        }
      }
    }
  }
  renderAutomation();
  renderBuffPriority();
}

function setupFabDial() {
  const dial = document.querySelector('#fab-dial');
  const trigger = document.querySelector('#fab-trigger');
  const actions = document.querySelector('#fab-actions');
  const backdrop = document.querySelector('#fab-backdrop');
  if (!dial || !trigger || !actions || !backdrop) return;

  function setOpen(open, restoreFocus = false) {
    dial.dataset.open = String(open);
    backdrop.dataset.open = String(open);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'Close shortcuts' : 'Open shortcuts');
    actions.setAttribute('aria-hidden', String(!open));
    actions.inert = !open;
    for (const action of actions.querySelectorAll('button')) action.tabIndex = open ? 0 : -1;
    if (!open && restoreFocus) trigger.focus();
  }

  setOpen(false);
  trigger.addEventListener('click', () => setOpen(dial.dataset.open !== 'true'));
  backdrop.addEventListener('click', () => setOpen(false, true));
  for (const action of actions.querySelectorAll('button')) {
    action.addEventListener('click', () => setOpen(false));
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dial.dataset.open === 'true') setOpen(false, true);
  });
}

function setupTowerModal() {
  const modal = document.querySelector('#tower-modal');
  const trigger = document.querySelector('#tower-fab');
  const close = document.querySelector('#tower-modal-close');
  if (!modal || !trigger) return;
  const dismiss = () => { modal.hidden = true; (document.querySelector('#fab-trigger') || trigger).focus(); };
  trigger.addEventListener('click', () => {
    renderTowerModal(currentCache);
    modal.hidden = false;
    close?.focus();
  });
  close?.addEventListener('click', dismiss);
  modal.addEventListener('click', (event) => { if (event.target === modal) dismiss(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) dismiss();
  });
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
  const trigger = document.querySelector('#dungeon-fab');
  const closeBtn = document.querySelector('#dungeon-modal-close');
  const refreshBtn = document.querySelector('#dungeon-refresh-btn');
  if (!modal) return;

  function closeModal() {
    modal.hidden = true;
    dungeonModalReturnFocus?.focus?.();
    dungeonModalReturnFocus = null;
  }

  trigger?.addEventListener('click', () =>
    openDungeonModal(currentCache?.dungeonStatus?.data, document.querySelector('#fab-trigger') || trigger));
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  if (refreshBtn) {
    const defaultRefreshHtml = refreshBtn.innerHTML;
    refreshBtn.addEventListener('click', () => {
      if (refreshBtn.disabled) return;
      if (!popupRpcEnabled) {
        refreshBtn.innerHTML = `
          <span class="text-amber-500">⚠️</span>
          <span class="dungeon-refresh-label text-amber-600 dark:text-amber-400">RPC Disabled</span>
        `;
        refreshBtn.title = 'Enable popup RPC calls in Settings to refresh dungeon data.';
        setTimeout(() => {
          refreshBtn.innerHTML = defaultRefreshHtml;
          refreshBtn.title = 'Refresh dungeon data from game (dungeonGetInfo)';
        }, 2500);
        return;
      }

      refreshBtn.disabled = true;
      refreshBtn.innerHTML = `
        <svg class="size-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span class="dungeon-refresh-label text-blue-600 dark:text-blue-400">Refreshing...</span>
      `;

      const calls = [
        { name: 'dungeonGetInfo', args: {}, ident: 'dungeonRefresh' },
        { name: 'teamGetAll', args: {} },
        { name: 'titanGetAll', args: {} }
      ];
      const trackId = 'trk_dungeon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const requestedAt = Date.now();

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls, trackId, requestedAt }, (response) => {
          const hasError = Boolean(chrome.runtime.lastError || !response?.ok);
          if (hasError) {
            refreshBtn.innerHTML = `
              <span class="text-rose-500">✕</span>
              <span class="dungeon-refresh-label text-rose-600 dark:text-rose-400">Failed</span>
            `;
            refreshBtn.title = response?.error || 'No active Hero Wars tab found or refresh failed.';
            setTimeout(() => {
              refreshBtn.disabled = false;
              refreshBtn.innerHTML = defaultRefreshHtml;
              refreshBtn.title = 'Refresh dungeon data from game (dungeonGetInfo)';
            }, 2500);
          } else {
            refreshBtn.innerHTML = `
              <span class="text-emerald-500">✓</span>
              <span class="dungeon-refresh-label text-emerald-600 dark:text-emerald-400">${response.queued ? 'Queued' : 'Refreshed'}</span>
            `;
            refreshBtn.title = response.queued
              ? 'Dungeon refresh queued; waiting for native game RPC carrier.'
              : 'Dungeon data refreshed from game.';
            setTimeout(() => {
              refreshBtn.disabled = false;
              refreshBtn.innerHTML = defaultRefreshHtml;
              refreshBtn.title = 'Refresh dungeon data from game (dungeonGetInfo)';
              if (!modal.hidden && typeof currentCache !== 'undefined') {
                openDungeonModal(currentCache?.dungeonStatus?.data, dungeonModalReturnFocus);
              }
            }, 1500);
          }
        });
      } else {
        setTimeout(() => {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = defaultRefreshHtml;
        }, 1000);
      }
    });
  }
  const autoBtn = document.querySelector('#dungeon-auto-btn');
  if (autoBtn) {
    autoBtn.hidden = true;
    const defaultAutoHtml = autoBtn.innerHTML;
    autoBtn.addEventListener('click', async () => {
      if (autoBtn.disabled) return;
      if (!popupRpcEnabled) {
        autoBtn.innerHTML = `
          <span class="text-amber-300">⚠️</span>
          <span class="dungeon-auto-label text-amber-200">RPC Disabled</span>
        `;
        setTimeout(() => {
          autoBtn.innerHTML = defaultAutoHtml;
        }, 2000);
        return;
      }

      const currentRunState = (typeof dungeonRunState !== 'undefined' ? dungeonRunState : null);
      const isRunning = currentRunState && !['stopped', 'complete'].includes(currentRunState.phase);
      if (isRunning) {
        autoBtn.disabled = true;
        const resp = await new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ kind: 'dungeon-run-stop' }, resolve);
          } else {
            resolve({ ok: true });
          }
        });
        autoBtn.disabled = false;
        dungeonAutomationMessage = resp?.ok ? 'Dungeon auto attack stopped.' : (resp?.error || 'Failed to stop.');
        openDungeonModal(currentCache?.dungeonStatus?.data, dungeonModalReturnFocus);
      } else {
        autoBtn.disabled = true;
        autoBtn.innerHTML = `
          <svg class="size-3.5 animate-spin text-white shrink-0" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          <span class="dungeon-auto-label">Starting...</span>
        `;
        const autoSettings = { executionMode: 'canvas' };
        const startMsg = { kind: 'dungeon-run-start', settings: autoSettings };
        const resp = await new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage(startMsg, resolve);
          } else {
            resolve({ ok: true });
          }
        });
        autoBtn.disabled = false;
        if (!resp?.ok) {
          dungeonAutomationMessage = resp?.error || 'Could not start dungeon automation.';
          autoBtn.innerHTML = `
            <span class="text-rose-200">✕</span>
            <span class="dungeon-auto-label">${resp?.error ? 'Failed' : 'Unavailable'}</span>
          `;
          setTimeout(() => {
            openDungeonModal(currentCache?.dungeonStatus?.data, dungeonModalReturnFocus);
          }, 2000);
        } else {
          dungeonAutomationMessage = 'Dungeon auto attack started.';
          openDungeonModal(currentCache?.dungeonStatus?.data, dungeonModalReturnFocus);
        }
      }
    });
  }
}

function openDraftModal(cache) {
  const modal = document.querySelector('#draft-modal');
  const body = document.querySelector('#draft-modal-body');
  if (!modal || !body) return;
  const activeCache = cache || currentCache || {};
  const draft = activeCache.legendDraftStatus?.data || {};
  const stageId = Number.isInteger(draft.stageId) ? draft.stageId : 0;

  const stageBadge = document.querySelector('#draft-modal-stage-badge');
  if (stageBadge) {
    stageBadge.textContent = globalThis.hwaHelperPopupData?.draftStageDescription?.(stageId) || 'Draft Active';
  }

  renderDraft(activeCache, body);
  modal.hidden = false;
}

function setupDraftModal() {
  const modal = document.querySelector('#draft-modal');
  const closeBtn = document.querySelector('#draft-modal-close');
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
      'accountStatus', 'buildingStatus', 'marchStatus', 'soloMobMap',
      'experimentalMapContext', 'experimentalRallySearch', 'experimentalSoloSearch', 'experimentalRallyHistory',
      'experimentalActionStatus', 'experimentalLastSquad', 'wheelFortuneStatus',
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
  const fabBadgeEl = document.querySelector?.('#fab-unread-badge');
  const chatCountEl = document.querySelector?.('#guild-chat-count');
  const rawMessages = cache?.guildChat?.data?.messages || [];
  const refSec = cache?.guildChat?.updatedAt ? Math.floor(Date.parse(cache.guildChat.updatedAt) / 1000) : 0;
  const cutoffSec = refSec > 0 ? refSec - (3 * 24 * 60 * 60) : 0;
  const messages = cutoffSec > 0 ? rawMessages.filter((m) => !m.ctime || Number(m.ctime) >= cutoffSec) : rawMessages;
  const unreadCount = globalThis.hwaHelperPopupData?.getUnreadChatCount
    ? globalThis.hwaHelperPopupData.getUnreadChatCount(messages, lastReadTime, refSec)
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
  if (fabBadgeEl) {
    fabBadgeEl.hidden = unreadCount <= 0;
    fabBadgeEl.textContent = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : '';
    fabBadgeEl.title = unreadCount > 0 ? `${unreadCount} unread guild message${unreadCount === 1 ? '' : 's'}` : '';
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
let pendingGuildChatMessages = [];

function renderGuildChat(cache, keepScroll = false, previousReadTime = 0) {
  const visibleLimit = (typeof chatVisibleCount !== 'undefined') ? chatVisibleCount : (renderGuildChat.visibleCount || 15);
  renderGuildChat.visibleCount = visibleLimit;
  const chatData = cache?.guildChat?.data;
  const refSec = cache?.guildChat?.updatedAt ? Math.floor(Date.parse(cache.guildChat.updatedAt) / 1000) : 0;
  const cutoffSec = refSec > 0 ? refSec - (3 * 24 * 60 * 60) : 0;
  const rawMessages = (Array.isArray(chatData?.messages) ? chatData.messages : [])
    .filter((m) => cutoffSec <= 0 || !m.ctime || Number(m.ctime) >= cutoffSec);
  const users = { ...(chatData?.users || {}) };

  const myId = String(cache?.accountStatus?.data?.id || 'me');
  const myName = cache?.accountStatus?.data?.name || 'You';
  if (!users[myId]) {
    users[myId] = { id: myId, name: myName };
  }

  // Deduplicate and filter pending messages that are already confirmed by server in rawMessages
  if (Array.isArray(pendingGuildChatMessages) && pendingGuildChatMessages.length > 0) {
    pendingGuildChatMessages = pendingGuildChatMessages.filter((p) => {
      const match = rawMessages.some((rm) =>
        rm.data?.text === p.data?.text &&
        (String(rm.userId) === String(p.userId) || p.userId === 'me') &&
        (!rm.ctime || !p.ctime || Math.abs(Number(rm.ctime || 0) - Number(p.ctime || 0)) < 86400)
      );
      return !match;
    });
  }

  const combinedMessages = [...rawMessages, ...(Array.isArray(pendingGuildChatMessages) ? pendingGuildChatMessages : [])];

  // Sort messages chronologically ascending (oldest at top, newest at bottom) for standard chat UI dialog flow
  const sortedMessages = [...combinedMessages].sort((a, b) => Number(a.ctime || 0) - Number(b.ctime || 0));

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
  const fabBadgeEl = document.querySelector?.('#fab-unread-badge');

  if (chatCountEl) chatCountEl.textContent = String(rawMessages.length);
  if (chatBadgeEl) {
    chatBadgeEl.hidden = true;
    chatBadgeEl.textContent = '';
    chatBadgeEl.title = '';
    chatBadgeEl.removeAttribute?.('title');
  }
  if (fabBadgeEl) {
    fabBadgeEl.hidden = true;
    fabBadgeEl.textContent = '';
    fabBadgeEl.title = '';
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
    body.className = 'mt-1 text-xs text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap select-text pl-6.5 flex items-start gap-1.5';

    if (m.isPending) {
      const spinner = document.createElement('span');
      spinner.className = 'chat-spinner inline-block size-3 shrink-0 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin mt-0.5';
      spinner.title = 'Sending...';
      spinner.setAttribute('data-chat-spinner', m.tempId || 'pending');
      body.append(spinner);
    } else if (m.status === 'failed') {
      const errorIcon = document.createElement('span');
      errorIcon.className = 'chat-error text-red-500 text-xs shrink-0 cursor-help';
      errorIcon.title = m.error || 'Failed to send';
      errorIcon.textContent = '⚠️';
      body.append(errorIcon);
    }

    const textSpan = document.createElement('span');
    textSpan.className = m.isPending ? 'text-slate-500 dark:text-slate-400 italic' : '';
    textSpan.textContent = m.data?.text || '—';
    body.append(textSpan);

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

function sendGuildChatMessage(text, cache = typeof currentCache !== 'undefined' ? currentCache : {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  const myId = String(cache?.accountStatus?.data?.id || 'me');
  const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const refTime = cache?.guildChat?.updatedAt ? Math.floor(Date.parse(cache.guildChat.updatedAt) / 1000) : 0;
  const nowSec = refTime > 0 ? refTime : Math.floor(Date.now() / 1000);

  const pendingMsg = {
    id: tempId,
    tempId,
    userId: myId,
    ctime: String(nowSec),
    chatType: 'clan',
    messageType: 'text',
    data: { text: trimmed },
    isPending: true,
    status: 'pending'
  };

  if (!Array.isArray(pendingGuildChatMessages)) pendingGuildChatMessages = [];
  pendingGuildChatMessages.push(pendingMsg);

  if (typeof renderGuildChat === 'function') {
    renderGuildChat(cache, false);
  }

  const calls = [
    { name: 'chatSendText', args: { chatType: 'clan', text: trimmed } },
    { name: 'chatGetAll', args: { chatType: 'clan' } }
  ];

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const p = chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, (response) => {
        const targetCache = typeof currentCache !== 'undefined' ? currentCache : cache;
        if (response && response.ok) {
          pendingMsg.isPending = false;
          pendingMsg.status = 'success';
          const spinner = document.querySelector?.(`[data-chat-spinner="${pendingMsg.tempId}"]`);
          spinner?.remove?.();
          if (typeof renderGuildChat === 'function' && targetCache) {
            renderGuildChat(targetCache, true);
          }
        } else {
          pendingMsg.isPending = false;
          pendingMsg.status = 'failed';
          pendingMsg.error = response?.error || 'Failed to send';
          if (typeof renderGuildChat === 'function' && targetCache) {
            renderGuildChat(targetCache, true);
          }
        }
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }

  return pendingMsg;
}

function setupGuildChatInput() {
  const form = document.querySelector?.('#guild-chat-form');
  const input = document.querySelector?.('#guild-chat-input');
  if (!form || !input || form.dataset?.listenerAttached) return;

  if (form.dataset) form.dataset.listenerAttached = 'true';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value?.trim?.() || '';
    if (!text) return;
    input.value = '';
    sendGuildChatMessage(text);
  });
}

globalThis.sendGuildChatMessage = sendGuildChatMessage;
globalThis.setupGuildChatInput = setupGuildChatInput;
globalThis.pendingGuildChatMessages = pendingGuildChatMessages;

function renderRpcQueue(count, mode = currentRpcPolicy?.mode) {
  const badge = document.querySelector('#rpc-queue-badge');
  const label = document.querySelector('#rpc-queue-count');
  if (label && count !== undefined) label.textContent = String(Number.isInteger(count) && count >= 0 ? count : 0);
  if (badge) {
    badge.hidden = mode !== 'piggyback';
  }
}

function renderGameVersion(gameVersion) {
  const gvEl = document.querySelector('#game-header-version');
  if (!gvEl) return;
  if (!gameVersion) {
    gvEl.hidden = true;
    gvEl.textContent = '';
    return;
  }
  const cleanVer = String(gameVersion).trim();
  const displayVer = cleanVer.startsWith('v.') || cleanVer.startsWith('v') ? cleanVer : `v.${cleanVer}`;
  gvEl.textContent = `(Game ${displayVer})`;
  gvEl.title = `Game client version: ${cleanVer}`;
  gvEl.hidden = false;
}

function renderDraftAlert(cache) {
  const button = document.querySelector('#draft-alert');
  if (!button) return;
  const draft = cache.legendDraftStatus?.data;
  const active = globalThis.hwaHelperPopupData.isDraftActive(draft?.stageId);
  button.hidden = !active;
  for (const dot of button.querySelectorAll('.hwa-mail-dot, .hwa-mail-dot-ping')) dot.hidden = !active;
  setResourceTooltip(button, `Legend Draft · ${globalThis.hwaHelperPopupData.draftStageDescription(draft?.stageId)}${active && draft?.stageFinishTs ? ` · ${globalThis.hwaHelperPopupData.formatCountdown(draft.stageFinishTs)}` : ''}`);
}

function renderCustomTeams(cache) {
  const accountId = cache.accountStatus?.data?.id;
  const heroes = cache.heroGetAll?.data || {};
  const section = document.createElement('section');
  section.className = 'm-3 rounded-xl border border-slate-200 bg-white p-4 space-y-3';
  const title = document.createElement('h2'); title.textContent = 'Custom raid / farm teams';
  section.append(title);
  view.prepend(section);
  const save = async (change) => {
    const stored = await chrome.storage.local.get('customTeams');
    const accounts = stored.customTeams || {};
    accounts[String(accountId)] = change(accounts[String(accountId)] || []);
    await chrome.storage.local.set({ customTeams: accounts });
    await render();
  };
  const editor = (team = {}) => {
    const form = document.createElement('form');
    form.className = 'space-y-2 rounded-lg border border-slate-200 p-3';
    const name = document.createElement('input');
    name.placeholder = 'Team name'; name.value = team.name || ''; name.required = true; name.maxLength = 80;
    name.className = 'block w-full rounded border p-2 text-sm';
    form.append(name);
    const troopLabel = document.createElement('label');
    troopLabel.className = 'block text-xs text-slate-600';
    troopLabel.textContent = 'Maximum troops (total for this team; blank = automatic)';
    const maxTroops = document.createElement('input');
    maxTroops.type = 'number'; maxTroops.min = '1'; maxTroops.step = '1';
    maxTroops.max = String(Number.MAX_SAFE_INTEGER);
    maxTroops.value = team.maxTroops == null ? '' : String(team.maxTroops);
    maxTroops.placeholder = 'Automatic';
    maxTroops.className = 'block w-full rounded border p-2 text-sm';
    troopLabel.append(maxTroops); form.append(troopLabel);
    const selected = new Set(team.heroIds || []);
    const choices = document.createElement('div'); choices.className = 'grid grid-cols-3 gap-2 max-h-64 overflow-auto';
    for (const [id, hero] of Object.entries(heroes).sort((a, b) => (b[1].power || 0) - (a[1].power || 0))) {
      const label = document.createElement('label'); label.className = 'text-xs flex gap-1 items-center';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(Number(id));
      input.addEventListener('change', () => {
        if (input.checked && selected.size >= 5) { input.checked = false; return; }
        if (input.checked) selected.add(Number(id)); else selected.delete(Number(id));
        submit.textContent = `Save team (${selected.size}/5)`;
      });
      label.append(input, document.createTextNode(globalThis.hwaHelperNameMap.hero(id) || `#${id}`)); choices.append(label);
    }
    form.append(choices);
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = `Save team (${selected.size}/5)`;
    submit.className = 'rounded bg-blue-600 px-3 py-2 text-xs text-white';
    form.append(submit);
    const status = document.createElement('p'); status.className = 'text-xs text-red-600'; form.append(status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = globalThis.hwaHelperExperimentalData.normalizeCustomTeam({
        id: team.id || crypto.randomUUID(), name: name.value, heroIds: [...selected],
        maxTroops: maxTroops.value === '' ? undefined : Number(maxTroops.value) }, heroes);
      if (!value) { status.textContent = 'Enter a team name, select exactly five heroes, and enter a positive whole troop count or leave it blank.'; return; }
      submit.disabled = true;
      try { await save((teams) => [...teams.filter((item) => item.id !== value.id), value]); }
      catch { submit.disabled = false; status.textContent = 'Could not save team. Try again.'; }
    });
    return form;
  };
  for (const team of render.customTeams || []) {
    const row = document.createElement('div'); row.className = 'space-y-2 border-b pb-2';
    const label = document.createElement('div');
    label.textContent = `${team.name}: ${team.heroIds.map((id) => globalThis.hwaHelperNameMap.hero(id) || `#${id}`).join(' · ')}`;
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.className = 'mr-3 text-xs text-blue-600';
    edit.addEventListener('click', () => { row.replaceChildren(editor(team)); });
    const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.className = 'text-xs text-red-600';
    remove.addEventListener('click', async () => { await save((teams) => teams.filter((item) => item.id !== team.id)); });
    const capacity = document.createElement('div'); capacity.className = 'text-xs text-slate-500';
    const data = globalThis.hwaHelperExperimentalData;
    const autoCap = data?.capacityModel ? data.capacityModel(team.heroIds, heroes, cache.troopCapacityEvidence?.data,
      troopCapacitySettings, accountId).total : null;
    capacity.textContent = `Maximum troops: ${team.maxTroops == null ? (autoCap ? `Automatic (${formatNumber(autoCap)})` : 'Automatic') : formatNumber(team.maxTroops)}`;
    row.append(label, capacity, edit, remove); section.append(row);
  }
  if (accountId != null) {
    const add = document.createElement('button'); add.textContent = 'Add custom team'; add.className = 'text-sm text-blue-600';
    add.addEventListener('click', () => { add.replaceWith(editor()); });
    section.append(add);
  }
}

function syncExperimentalPending(cache) {
  if (experimentalPending && (!popupRpcEnabled ||
      (experimentalPending.queued && (currentRpcPolicy.mode === 'direct' || !currentRpcPolicy.monitor)))) {
    experimentalPending = null;
    experimentalMessage = 'Pending RPC cancelled by Settings.';
  }
  const actionStatus = cache.experimentalActionStatus;
  if (experimentalPending && actionStatus?.data?.name === experimentalPending.name &&
      Date.parse(actionStatus.updatedAt) >= experimentalPending.sentAt) {
    experimentalMessage = actionStatus.data.ok ? `${experimentalPending.name} completed.` :
      `${experimentalPending.name} failed: ${actionStatus.data.error || 'Game rejected the request.'}`;
    experimentalPending = null;
  } else if (experimentalPending && Date.now() - experimentalPending.sentAt > (experimentalPending.queued ? 120000 : 30000)) {
    experimentalMessage = `${experimentalPending.name}: no game result received before the request timeout.`;
    experimentalPending = null;
  }
}

function renderMonster(cache) {
  const host = document.querySelector('#monster-dialog-body');
  host.replaceChildren();
  syncExperimentalPending(cache);
  const data = globalThis.hwaHelperExperimentalData;
  const heroes = cache.heroGetAll?.data || {};
  const available = data.availableHeroIds(heroes, cache['getUnitSummary:unit']?.data,
    cache.marchStatus?.data?.marches);
  const teams = data.teamOptions(cache.teamGetAll?.data, heroes, render.customTeams || [], available);
  if (!teams.some((team) => team.id === monsterSelection.teamId)) {
    monsterSelection.teamId = teams.find((team) => team.heroIds.length === 5)?.id || teams[0]?.id || '';
  }
  const team = teams.find((item) => item.id === monsterSelection.teamId);
  const running = monsterQueueState && !['stopped', 'complete'].includes(monsterQueueState.phase);

  // Update title bar status and header icon for Monster dialog
  const monsterIcon = document.querySelector('#monster-dialog-icon');
  const monsterTitleStatus = document.querySelector('#monster-dialog-status');
  if (monsterTitleStatus && monsterTitleStatus !== host) {
    monsterTitleStatus.replaceChildren();
    const now = Date.now();
    const activeAttacks = (cache.marchStatus?.data?.marches || []).filter((march) =>
      !march.rally && !march.mineId && (march.kind === 'attack' || march.stage === 'moveToTargetInSolo' || (march.stage === 'returnToOutpost' && march.previousKind === 'attack') || (march.kind === 'return' && !march.mineId && !march.rally)) &&
      !(globalThis.hwaHelperPopupData?.isMarchExpired ? globalThis.hwaHelperPopupData.isMarchExpired(march, now) : (Number.isFinite(march.endsAt) && now >= march.endsAt)));

    let currentStageIcon = '👾';

    if (activeAttacks.length > 0) {
      const march = activeAttacks[0];
      const isReturning = march.kind === 'return' || march.stage === 'returnToOutpost';
      const isFighting = !isReturning && Number.isFinite(march.targetArrivalAt) && now >= march.targetArrivalAt;
      const stateLabel = isReturning ? (march.result ? `Returning (${march.result})` : 'Returning') :
        isFighting ? 'Fighting' : 'Marching';
      currentStageIcon = isReturning ? '↩️' : (isFighting ? '💥' : '🏃‍♂️');
      const until = isReturning ? (march.endsAt || march.returnAt) : (march.targetArrivalAt || march.endsAt);
      const lvl = data.soloMonsterLevel(march.mobConfigId);
      const targetLabel = lvl ? `Lv.${lvl} Monster` : (march.mobConfigId ? `Monster #${march.mobConfigId}` : 'Monster');

      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60';
      const badgeIcon = document.createElement('span');
      badgeIcon.textContent = currentStageIcon;
      const dot = document.createElement('span');
      dot.className = 'size-1.5 rounded-full bg-amber-500 animate-pulse';
      const text = document.createElement('span');
      text.textContent = `${targetLabel}: ${stateLabel}`;
      badge.append(badgeIcon, dot, text);
      if (until && until > now) {
        const cd = document.createElement('span');
        cd.dataset.experimentalUntil = String(until);
        cd.textContent = ` · ${Math.max(0, Math.ceil((until - now) / 1000))}s`;
        badge.append(cd);
      }
      monsterTitleStatus.append(badge);
    } else if (running) {
      currentStageIcon = '⏱️';
    }

    if (monsterIcon) {
      monsterIcon.textContent = currentStageIcon;
    }

    if (running) {
      const queueBadge = document.createElement('span');
      queueBadge.className = 'inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-900 border border-orange-300 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800/60';
      const qIcon = document.createElement('span');
      qIcon.textContent = '⏱️';
      const dot = document.createElement('span');
      dot.className = 'size-1.5 rounded-full bg-orange-500 animate-pulse';
      const text = document.createElement('span');
      const wins = globalThis.hwaHelperMonsterQueue?.confirmedWins?.(monsterQueueState) ?? 0;
      const total = monsterQueueState.options?.count || 0;
      text.textContent = `Queue: ${monsterQueueState.phase} (${wins}/${total} won)`;
      queueBadge.append(qIcon, dot, text);
      monsterTitleStatus.append(queueBadge);
    }
  }

  const section = document.createElement('section');
  section.className = 'm-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 dark:border-slate-800 dark:bg-slate-900';
  host.append(section);
  const heading = document.createElement('h3');
  heading.className = 'font-semibold text-slate-900 dark:text-slate-100'; heading.textContent = 'Attack setup'; section.append(heading);
  const field = (parent, label, control) => {
    const wrap = document.createElement('label');
    wrap.className = 'block min-w-0 text-xs font-medium text-slate-600 dark:text-slate-400';
    wrap.textContent = label;
    control.className = 'mt-1 block h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
    wrap.append(control); parent.append(wrap); return wrap;
  };
  const button = (parent, label, action, disabled = false) => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
    el.className = 'inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40';
    el.disabled = disabled; el.addEventListener('click', action); parent.append(el); return el;
  };
  const note = (text) => { const p = document.createElement('p'); p.className = 'text-xs text-slate-600 dark:text-slate-400';
    p.textContent = text; section.append(p); };

  const teamSelect = document.createElement('select');
  for (const item of teams) {
    const option = document.createElement('option'); option.value = item.id;
    option.textContent = `${item.label} (${item.heroIds.length}/5)`; teamSelect.append(option);
  }
  teamSelect.value = monsterSelection.teamId;
  teamSelect.addEventListener('change', () => {
    monsterSelection.teamId = teamSelect.value; saveMonsterPreferences(); render();
  });
  const lineupLabel = (team?.heroIds || []).map((id) => globalThis.hwaHelperNameMap.hero(id) || `#${id}`).join(' · ') || 'No complete team observed';
  field(section, `Lineup (${lineupLabel})`, teamSelect);

  const cap = data.capacityModel(team?.heroIds, heroes, cache.troopCapacityEvidence?.data,
    troopCapacitySettings, cache.accountStatus?.data?.id).total;
  const maxTroops = data.teamTroopCapacity(cap, team?.maxTroops);
  const units = data.allocateTroops(cache['getUnitSummary:unit']?.data, maxTroops);

  const troopHeader = document.createElement('div');
  troopHeader.className = 'flex items-center gap-2 text-xs leading-5 text-slate-600 dark:text-slate-400';
  const troopLabel = document.createElement('span');
  troopLabel.textContent = `Troops: ${formatNumber(units.reduce((sum, unit) => sum + unit.count, 0))} / ${formatNumber(maxTroops || 0)} · World Energy: 10 per attack`;
  troopLabel.title = team?.maxTroops != null ? 'Custom maximum' : 'Estimated capacity';
  troopHeader.append(troopLabel);
  const refreshTroops = button(troopHeader, '↻', () => chrome.runtime.sendMessage({ kind: 'refresh-rpc',
    calls: [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }] }), !popupRpcEnabled);
  refreshTroops.className = 'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-sm leading-5 text-slate-500 hover:bg-slate-100 hover:text-orange-600 disabled:opacity-40';
  refreshTroops.title = 'Refresh available troops';
  refreshTroops.setAttribute('aria-label', 'Refresh available troops');
  section.append(troopHeader);

  const troopSummary = document.createElement('div');
  troopSummary.className = 'grid grid-cols-3 gap-2';
  for (let type = 0; type < 3; type++) {
    const typeUnits = units.filter((unit) => data.unitInfo(unit.unitId)?.type === type);
    const block = document.createElement('div');
    block.className = 'rounded-lg bg-slate-50 p-2 text-xs text-slate-700 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700/80';
    const label = document.createElement('div'); label.className = 'font-semibold';
    label.textContent = `${data.unitInfo(type * 10 + 1)?.label || `Type ${type}`}: ${formatNumber(typeUnits.reduce((sum, unit) => sum + unit.count, 0))}`;
    const tiers = document.createElement('div'); tiers.className = 'mt-1 text-slate-500 dark:text-slate-400 text-3xs';
    tiers.textContent = typeUnits.map((unit) => `Lv${data.unitInfo(unit.unitId)?.level ?? unit.unitId}: ${formatNumber(unit.count)}`).join(' · ') || '0';
    block.append(label, tiers);
    troopSummary.append(block);
  }
  section.append(troopSummary);

  const monsterRow = document.createElement('div');
  monsterRow.className = 'grid grid-cols-2 items-end gap-3';
  section.append(monsterRow);

  const context = cache.experimentalMapContext?.data || {};
  const center = context.center || context.outposts?.[cache.accountStatus?.data?.id];
  const searchDisabled = !popupRpcEnabled || !!experimentalPending || !context.mapId || !center;

  const levelField = document.createElement('label');
  levelField.className = 'block min-w-0 text-xs font-medium text-slate-600 dark:text-slate-400';
  levelField.textContent = 'Monster level';
  const levelWrap = document.createElement('div');
  levelWrap.className = 'mt-1 flex h-10 items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800';
  const level = document.createElement('select');
  level.className = 'h-full w-full min-w-0 border-0 bg-transparent px-2 text-sm text-slate-900 focus:outline-none dark:text-slate-100';
  for (let value = 1; value <= 30; value++) {
    const option = document.createElement('option'); option.value = String(value);
    option.textContent = `Level ${value}`; level.append(option);
  }
  level.value = String(monsterSelection.level);
  level.addEventListener('change', () => {
    monsterSelection.level = Number(level.value); monsterSelection.targetMobId = '';
    saveMonsterPreferences(); render();
  });
  const findBtn = document.createElement('button');
  findBtn.type = 'button';
  findBtn.textContent = 'Find monsters';
  findBtn.disabled = searchDisabled;
  findBtn.className = 'inline-flex h-full shrink-0 cursor-pointer items-center justify-center border-l border-slate-300 bg-orange-600 px-3 text-sm font-semibold leading-5 text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700';
  findBtn.addEventListener('click', () => experimentalRpc([{ name: 'searchMob', feature: 'mob', args: {
    mapId: context.mapId, center, mobType: 'solo',
    mobConfigIds: data.soloMonsterConfigIds(monsterSelection.level)
  } }], 'Searching monsters...'));
  levelWrap.append(level, findBtn);
  levelField.append(levelWrap);
  monsterRow.append(levelField);

  const found = cache.experimentalSoloSearch?.data;
  const configs = data.soloMonsterConfigIds(monsterSelection.level);
  const matching = found?.mapId === context.mapId && Array.isArray(found.mobConfigIds) &&
    found.mobConfigIds.length === configs.length && found.mobConfigIds.every((id, i) => id === configs[i]);
  const targets = matching ? found.mobs || [] : [];
  const targetSelect = document.createElement('select');
  for (const [index, target] of targets.entries()) {
    const option = document.createElement('option'); option.value = target.mobId;
    option.textContent = `Monster ${index + 1} · (${target.coordinates?.x ?? '?'}, ${target.coordinates?.y ?? '?'})`;
    targetSelect.append(option);
  }
  if (!targets.some((target) => target.mobId === monsterSelection.targetMobId)) {
    monsterSelection.targetMobId = targets[0]?.mobId || '';
  }
  targetSelect.value = monsterSelection.targetMobId;
  targetSelect.addEventListener('change', () => { monsterSelection.targetMobId = targetSelect.value; });
  field(monsterRow, `Target (${matching ? `${targets.length} found` : 'Search this level first'})`, targetSelect);

  const count = document.createElement('input'); count.type = 'number'; count.min = '2'; count.max = '100'; count.step = '1';
  count.value = String(monsterSelection.count);
  count.addEventListener('input', () => { monsterSelection.count = Number(count.value); saveMonsterPreferences(); });
  field(section, 'Number of attacks', count);

  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-3 flex-wrap';
  section.append(actions);

  const cannotStart = !popupRpcEnabled || running || !!experimentalPending || !monsterSelection.targetMobId ||
    team?.heroIds?.length !== 5 || !data.buildSquad(team.heroIds, units);
  const start = async (attackCount) => {
    const response = await chrome.runtime.sendMessage({ kind: 'monster-queue-start', options: {
      mapId: context.mapId, center, level: monsterSelection.level,
      firstMobId: monsterSelection.targetMobId, heroIds: team.heroIds,
      teamId: team.id, maxTroops: team.maxTroops, count: attackCount
    } }).catch((error) => ({ error: String(error) }));
    monsterMessage = response?.ok ? (response.queued ? 'Attack queued for the next game RPC.' :
      'Attack sent. Waiting for confirmation.') : response?.error || 'Could not start monster attack.';
    render();
  };
  button(actions, 'Attack once', () => start(1), cannotStart);
  if (!running) {
    button(actions, 'Start queue', () => {
      const value = Number(count.value);
      if (!Number.isInteger(value) || value < 2 || value > 100) {
        monsterMessage = 'Queue needs 2–100 attacks. Use Attack once for one monster.'; render(); return;
      }
      monsterSelection.count = value; saveMonsterPreferences(); start(value);
    }, cannotStart);
  } else {
    const stopQueueBtn = button(actions, 'Stop queue', async () => {
      await chrome.runtime.sendMessage({ kind: 'monster-queue-stop' }); render();
    }, false);
    stopQueueBtn.className = 'inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 px-4 text-sm font-semibold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-40';
  }

  if (monsterQueueState) {
    note(`${running ? 'Queue' : 'Previous queue'}: ${monsterQueueState.phase} · ${data.soloMonsterLevel(monsterQueueState.current?.mobConfigId) ?
      `level ${data.soloMonsterLevel(monsterQueueState.current.mobConfigId)} · ` : ''}${globalThis.hwaHelperMonsterQueue.confirmedWins(monsterQueueState)} won / ${monsterQueueState.options?.count || 0} requested${monsterQueueState.reason ? ` · ${monsterQueueState.reason}` : ''}`);
    if (running) {
      note('Cancelling the queue clears pending attacks; an attack already sent continues in game.');
    }
  }
  const reports = cache.soloAttackResults?.data || [];
  if (reports.length) {
    const title = document.createElement('h3'); title.className = 'text-xs font-semibold text-slate-800 dark:text-slate-200';
    title.textContent = 'Recent attack results'; section.append(title);
    for (const item of reports.slice(0, 5)) note(`${data.soloMonsterLevel(item.mobConfigId) ?
      `Level ${data.soloMonsterLevel(item.mobConfigId)}` : 'Monster'} · ${item.result} · ${new Date(item.createdAt).toLocaleString()}`);
  }
  if (monsterMessage) note(monsterMessage);
  if (experimentalMessage) note(experimentalMessage);
  if (!popupRpcEnabled) note('Enable Allow popup RPC calls in Settings to attack monsters.');
  if (!context.mapId) note('Open the world map in game to capture its map ID.');
}

function renderExperimental(cache, raidOnly = false) {
  const host = document.querySelector(raidOnly ? '#raid-dialog-body' : '#gather-dialog-body');
  host.replaceChildren();
  const data = globalThis.hwaHelperExperimentalData;
  syncExperimentalPending(cache);
  const heroes = cache.heroGetAll?.data || {};
  const available = data.availableHeroIds(heroes, cache['getUnitSummary:unit']?.data, cache.marchStatus?.data?.marches);
  const teams = data.teamOptions(cache.teamGetAll?.data, heroes, render.customTeams || [], available);
  const context = { ...cache.experimentalMineSearch?.data,
    ...cache.experimentalRallySearch?.data,
    ...cache.experimentalMapContext?.data };
  const mapCenter = context.center || context.outposts?.[cache.accountStatus?.data?.id];
  if (!experimentalSelection.units && cache.experimentalLastSquad?.data?.units?.length) {
    experimentalSelection.units = cache.experimentalLastSquad.data.units
      .map((unit) => `${unit.unitId}:${unit.count}`).join(', ');
  }
  const card = (title) => {
    const section = document.createElement('section');
    section.className = 'm-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3';
    const heading = document.createElement('h2');
    heading.className = 'font-semibold text-slate-900';
    heading.textContent = title;
    section.append(heading);
    host.append(section);
    return section;
  };
  const field = (section, label, element) => {
    const wrap = document.createElement('label');
    wrap.className = 'block text-xs font-medium text-slate-600';
    wrap.textContent = label;
    element.className = 'mt-1 block h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm leading-5 text-slate-900';
    wrap.append(element);
    section.append(wrap);
    return element;
  };
  const note = (section, text) => {
    const p = document.createElement('p');
    p.className = 'text-xs text-slate-500';
    p.textContent = text;
    section.append(p);
  };
  const button = (section, text, onClick, disabled) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-40';
    el.textContent = text;
    el.disabled = disabled;
    el.addEventListener('click', onClick);
    section.append(el);
    return el;
  };
  const makeTeamSelect = (section, key) => {
    const select = document.createElement('select');
    for (const team of teams) {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = `${team.label} (${team.heroIds.length}/5)`;
      select.append(option);
    }
    if (!teams.some((team) => team.id === experimentalSelection[key])) {
      experimentalSelection[key] = teams.find((team) => team.heroIds.length === 5)?.id || teams[0]?.id || '';
    }
    select.value = experimentalSelection[key];
    select.addEventListener('change', () => {
      experimentalSelection[key] = select.value;
      if (key === 'rallyTeam') saveRaidPreferences();
      render();
    });
    const lineupLabel = teams.find((team) => team.id === experimentalSelection[key])?.heroIds
      .map((id) => globalThis.hwaHelperNameMap.hero(id) || `#${id}`).join(' · ') || 'No complete team observed';
    field(section, `Lineup (${lineupLabel})`, select);
    const selected = teams.find((team) => team.id === experimentalSelection[key]);
    return selected;
  };
  const makeUnitsInput = (section, label = 'Troops (unit ID:count)') => {
    const input = document.createElement('input'); input.type = 'text';
    input.placeholder = '7:500, 17:500, 27:500';
    input.value = experimentalSelection.units;
    input.addEventListener('input', () => { experimentalSelection.units = input.value; });
    field(section, label, input);
  };
  const selectedSquad = (team) => {
    const units = experimentalSelection.units.split(',').map((part) => {
      const match = part.trim().match(/^(\d+):(\d+)$/);
      return match ? { unitId: Number(match[1]), count: Number(match[2]) } : null;
    });
    return units.every(Boolean) ? data.buildSquad(team?.heroIds || [], units) : null;
  };
  if (raidOnly) {
  const rally = card('Raid setup');
  const bossRow = document.createElement('div');
  bossRow.className = 'grid grid-cols-2 items-end gap-3';
  const settingsRow = document.createElement('div');
  settingsRow.className = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] items-end gap-3';
  const rallyTeam = makeTeamSelect(rally, 'rallyTeam');
  const model = data.capacityModel(rallyTeam?.heroIds, heroes, cache.troopCapacityEvidence?.data,
    troopCapacitySettings, cache.accountStatus?.data?.id);
  const rallyCapacity = data.teamTroopCapacity(model.total, rallyTeam?.maxTroops);
  const optimized = data.allocateTroops(cache['getUnitSummary:unit']?.data, rallyCapacity);
  const rallySquad = data.buildSquad(rallyTeam?.heroIds || [], optimized);
  const troopHeader = document.createElement('div');
  troopHeader.className = 'flex items-center gap-2 text-xs leading-5 text-slate-600';
  const troopLabel = document.createElement('span');
  troopLabel.textContent = `Troops: ${optimized.reduce((sum, unit) => sum + unit.count, 0)} / ${rallyCapacity ?? 0}`;
  troopLabel.title = rallyTeam?.maxTroops != null ? 'Custom maximum' : model.observed ? 'Observed lineup' : 'Estimated capacity';
  troopHeader.append(troopLabel); rally.append(troopHeader);
  const refreshTroops = button(troopHeader, '↻', () => chrome.runtime.sendMessage({ kind: 'refresh-rpc',
    calls: [{ name: 'heroGetAll' }, { name: 'getUnitSummary', feature: 'unit' }] }), !popupRpcEnabled);
  refreshTroops.className = 'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-sm leading-5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40';
  refreshTroops.title = 'Refresh available troops';
  refreshTroops.setAttribute('aria-label', 'Refresh available troops');
  const troopSummary = document.createElement('div');
  troopSummary.className = 'grid grid-cols-3 gap-2';
  for (let type = 0; type < 3; type++) {
    const units = optimized.filter((unit) => data.unitInfo(unit.unitId)?.type === type);
    const block = document.createElement('div');
    block.className = 'rounded-lg bg-slate-50 p-2 text-xs text-slate-700';
    const label = document.createElement('div'); label.className = 'font-semibold';
    label.textContent = `${data.unitInfo(type * 10 + 1).label}: ${units.reduce((sum, unit) => sum + unit.count, 0)}`;
    const tiers = document.createElement('div'); tiers.className = 'mt-1 text-slate-500';
    tiers.textContent = units.map((unit) => `Lv${data.unitInfo(unit.unitId).level}: ${unit.count}`).join(' · ') || '0';
    block.append(label, tiers); troopSummary.append(block);
  }
  rally.append(troopSummary);


  const level = document.createElement('select');
  for (let n = 1; n <= 30; n++) {
    const option = document.createElement('option'); option.value = String(n); option.textContent = `Boss level ${n}`; level.append(option);
  }
  level.value = String(experimentalSelection.bossLevel);
  level.addEventListener('change', () => { experimentalSelection.bossLevel = Number(level.value); render(); });
  rally.append(bossRow);
  const bossGroup = document.createElement('div');
  bossGroup.className = 'min-w-0';
  const bossLabel = document.createElement('label');
  bossLabel.className = 'block text-xs font-medium text-slate-600';
  bossLabel.textContent = 'Boss level'; bossLabel.htmlFor = 'raid-boss-level';
  const bossControl = document.createElement('div');
  bossControl.className = 'mt-1 flex h-10 min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white';
  level.id = 'raid-boss-level';
  level.className = 'h-full min-w-0 flex-1 border-0 bg-white px-2 text-sm leading-5 text-slate-900 outline-none';
  bossControl.append(level); bossGroup.append(bossLabel, bossControl); bossRow.append(bossGroup);
  const wait = document.createElement('select');
  for (const seconds of data.rallyWaitOptions) {
    const option = document.createElement('option'); option.value = String(seconds);
    option.textContent = `${seconds / 60} minute(s)`; wait.append(option);
  }
  wait.value = String(experimentalSelection.waitSeconds);
  wait.addEventListener('change', () => { experimentalSelection.waitSeconds = Number(wait.value); saveRaidPreferences(); });
  rally.append(settingsRow);
  field(settingsRow, 'Rally wait', wait);
  const memberField = document.createElement('div');
  const memberLabel = document.createElement('label');
  memberLabel.className = 'block text-xs font-medium text-slate-600';
  memberLabel.htmlFor = 'raid-min-members';
  memberLabel.textContent = 'Minimum members';
  const memberControl = document.createElement('div');
  memberControl.className = 'mt-1 flex h-10 w-full items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100';
  const cancelLabel = document.createElement('label');
  cancelLabel.className = 'inline-flex shrink-0 cursor-pointer items-center gap-2 border-r border-slate-300 bg-slate-50 px-3 text-xs font-medium text-slate-700';
  const autoCancel = document.createElement('input');
  autoCancel.type = 'checkbox';
  autoCancel.checked = experimentalSelection.autoCancel;
  autoCancel.className = 'size-4 accent-blue-600';
  autoCancel.addEventListener('change', () => {
    experimentalSelection.autoCancel = autoCancel.checked;
    memberInput.disabled = !autoCancel.checked;
    saveRaidPreferences();
  });
  const cancelText = document.createElement('span');
  cancelText.textContent = 'Auto-cancel';
  cancelLabel.append(autoCancel, cancelText);
  const memberInput = document.createElement('input');
  memberInput.id = 'raid-min-members';
  memberInput.type = 'number'; memberInput.min = '1'; memberInput.max = '6'; memberInput.step = '1';
  memberInput.value = String(experimentalSelection.minMembers);
  memberInput.disabled = !autoCancel.checked;
  memberInput.className = 'min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-400';
  memberInput.addEventListener('change', () => {
    experimentalSelection.minMembers = Number(memberInput.value);
    saveRaidPreferences();
  });
  memberControl.append(cancelLabel, memberInput);
  memberField.append(memberLabel, memberControl);
  settingsRow.append(memberField);
  const raidCountInput = document.createElement('input');
  raidCountInput.type = 'number'; raidCountInput.min = '2'; raidCountInput.max = '100'; raidCountInput.step = '1';
  raidCountInput.value = String(experimentalSelection.raidCount);
  raidCountInput.addEventListener('input', () => {
    experimentalSelection.raidCount = Number(raidCountInput.value);
    saveRaidPreferences();
  });
  field(settingsRow, 'Number of raids', raidCountInput);
  note(rally, 'When enabled, auto-cancel checks members during the final 10 seconds before departure. Missing fresh member data or too few members triggers one cancellation attempt. Keep the game tab open.');

  note(rally, context.mapId ? `Map ready · ${context.mapId}` : 'Open the world map in game once to capture its map ID.');
  const searchResult = cache.experimentalRallySearch?.data;
  const matchingSearch = searchResult?.mobConfigIds?.includes(data.bossConfigId(experimentalSelection.bossLevel));
  const targets = matchingSearch ? searchResult.mobs : [];

  const findBoss = button(bossControl, 'Find', async () => {
    const configId = data.bossConfigId(experimentalSelection.bossLevel);
    experimentalSelection.searchedBossLevel = experimentalSelection.bossLevel;
    await saveRaidPreferences();
    await experimentalRpc([{ name: 'searchMob', feature: 'mob', args: {
      mapId: context.mapId, center: mapCenter,
      mobType: 'rally', mobConfigIds: [configId]
    } }], 'Searching boss...');
  }, !popupRpcEnabled || !!experimentalPending || !context?.mapId || !mapCenter);
  const targetSelect = document.createElement('select');
  targets.forEach((target, index) => {
    const option = document.createElement('option'); option.value = target.mobId;
    option.textContent = `Boss ${index + 1} · (${target.coordinates?.x ?? '?'}, ${target.coordinates?.y ?? '?'})`;
    targetSelect.append(option);
  });
  targetSelect.value = targets.some((target) => target.mobId === experimentalSelection.targetMobId) ?
    experimentalSelection.targetMobId : targets[0]?.mobId || '';
  targetSelect.addEventListener('change', () => { experimentalSelection.targetMobId = targetSelect.value; });
  findBoss.className = 'inline-flex h-full shrink-0 cursor-pointer items-center justify-center border-l border-slate-300 bg-blue-600 px-3 text-sm font-semibold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-40';
  field(bossRow, `Target (${matchingSearch ? `${targets.length} boss target(s) found for this level.` : 'Search this level first'})`, targetSelect);
  const queueRunning = raidQueueState && !['stopped', 'complete'].includes(raidQueueState.phase);
  const startRaid = async (count, single = false) => {
    const response = await chrome.runtime.sendMessage({ kind: 'raid-queue-start', options: {
      mapId: context.mapId, center: mapCenter, firstMobId: targetSelect.value,
      level: experimentalSelection.bossLevel, heroIds: rallyTeam.heroIds, teamId: rallyTeam.id, maxTroops: rallyTeam.maxTroops,
      waitSeconds: experimentalSelection.waitSeconds, minMembers: experimentalSelection.minMembers,
      autoCancel: experimentalSelection.autoCancel, count
    } }).catch((error) => ({ error: String(error) }));
    experimentalMessage = response?.ok ?
      (single ? (response.queued ? 'Rally creation queued for the next game RPC.' : 'Rally creation sent. Waiting for game confirmation.') :
        (response.queued ? 'First raid queued. Later raids wait for a confirmed win and return.' :
          'First raid sent. Later raids wait for a confirmed win and return.')) :
      response?.error || 'Could not start rally.';
    render();
  };
  const activeRallies = (cache.marchStatus?.data?.marches || []).filter((march) => march.rally &&
    !(globalThis.hwaHelperPopupData?.isMarchExpired ? globalThis.hwaHelperPopupData.isMarchExpired(march, Date.now()) : (Number.isFinite(march.endsAt) && Date.now() >= march.endsAt)));

  const raidIcon = document.querySelector('#raid-dialog-icon');
  const raidTitleStatus = document.querySelector('#raid-dialog-status');
  if (raidTitleStatus) {
    raidTitleStatus.replaceChildren();
    let currentRaidStageIcon = '⚔️';
    if (activeRallies.length > 0) {
      const march = activeRallies[0];
      const phase = data.rallyPhase(march);
      if (phase.phase === 'Waiting') {
        currentRaidStageIcon = '⏳';
      } else if (phase.phase === 'Traveling to boss') {
        currentRaidStageIcon = '🏹';
      } else if (phase.phase === 'Battle / awaiting result') {
        currentRaidStageIcon = '💥';
      } else if (phase.phase === 'Returning' || phase.phase === 'Battle complete') {
        currentRaidStageIcon = '↩️';
      } else {
        currentRaidStageIcon = '⚔️';
      }

      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-900 border border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800/60';
      const badgeIcon = document.createElement('span');
      badgeIcon.textContent = currentRaidStageIcon;
      const dot = document.createElement('span');
      dot.className = 'size-1.5 rounded-full bg-indigo-500 animate-pulse';
      const text = document.createElement('span');
      text.textContent = `${march.rally?.target || 'Rally'}: ${phase.phase}${phase.result ? ` (${phase.result})` : ''}`;
      badge.append(badgeIcon, dot, text);
      if (phase.until) {
        const cd = document.createElement('span');
        cd.dataset.experimentalUntil = String(phase.until);
        cd.textContent = ` · ${Math.max(0, Math.ceil((phase.until - Date.now()) / 1000))}s`;
        badge.append(cd);
      }
      raidTitleStatus.append(badge);
    } else if (queueRunning) {
      currentRaidStageIcon = '⏱️';
    }

    if (raidIcon) {
      raidIcon.textContent = currentRaidStageIcon;
    }

    if (queueRunning) {
      const queueBadge = document.createElement('span');
      queueBadge.className = 'inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800/60';
      const qIcon = document.createElement('span');
      qIcon.textContent = '⏱️';
      const dot = document.createElement('span');
      dot.className = 'size-1.5 rounded-full bg-blue-500 animate-pulse';
      const text = document.createElement('span');
      const pending = raidQueueState?.bossQueue;
      text.textContent = `Queue: ${raidQueueState.phase}${pending?.remain_raid_count != null ? ` (${pending.remain_raid_count} left)` : ''}`;
      queueBadge.append(qIcon, dot, text);
      raidTitleStatus.append(queueBadge);
    }
  }

  const cannotStart = !popupRpcEnabled || !!experimentalPending || queueRunning || !targets.length || !rallySquad;
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-3 flex-wrap';
  rally.append(actions);
  button(actions, 'Start rally', () => startRaid(1, true), cannotStart);
  if (!queueRunning) {
    button(actions, 'Start queue', () => {
      const count = Number(raidCountInput.value);
      if (!Number.isInteger(count) || count < 2 || count > 100) {
        experimentalMessage = 'Raid queue needs 2–100 raids. Use Start rally for one raid.';
        render();
        return;
      }
      experimentalSelection.raidCount = count;
      saveRaidPreferences();
      startRaid(count);
    }, cannotStart);
  } else {
    const stopQueueBtn = button(actions, 'Stop queue', async () => {
      await chrome.runtime.sendMessage({ kind: 'raid-queue-stop' });
      render();
    }, false);
    stopQueueBtn.className = 'inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 px-4 text-sm font-semibold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-40';
  }
  if (raidQueueState) {
    const members = raidQueueState.current?.members;
    const pending = raidQueueState.bossQueue;
    const wins = globalThis.hwaHelperRaidQueue?.confirmedWins?.(raidQueueState) ?? 0;
    note(rally, `Queue: ${raidQueueState.phase} · ${pending?.remain_raid_count ?? 0} raids left · ${pending?.queue.length ?? 0} bosses queued · ${wins} won${members ? ` · members ${members.count}/${members.total}` : ''}${raidQueueState.reason ? ` · ${raidQueueState.reason}` : ''}`);
    if (queueRunning) {
      note(rally, 'Cancelling the queue clears pending bosses; a rally already running continues in game.');
    }
  }
  const history = cache.experimentalRallyHistory?.data || [];
  if (history.length) {
    const heading = document.createElement('h3');
    heading.className = 'text-xs font-semibold text-slate-700';
    heading.textContent = 'Recent rally results';
    rally.append(heading);
    for (const item of history.slice(0, 5)) {
      const p = document.createElement('p');
      p.className = 'text-xs text-slate-600';
      p.textContent = `${globalThis.hwaHelperRallyTargets?.[item.mobConfigId] || 'Boss'} · ${item.result || 'Result pending'} · ${new Date(item.updatedAt).toLocaleString()}${item.returnAt ? ` · return ${new Date(item.returnAt).toLocaleTimeString()}` : ''}`;
      rally.append(p);
    }
  }
  if (experimentalMessage) note(rally, experimentalMessage);
  if (!popupRpcEnabled) note(rally, 'Enable Allow popup RPC calls in Settings to use raid actions.');
  return;
  }
  const gather = card('Gather troops');

  // Row 1: Lineup & Troops
  const teamRow = document.createElement('div');
  teamRow.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3 items-end';
  gather.append(teamRow);
  const gatherTeam = makeTeamSelect(teamRow, 'gatherTeam');
  const troopsLabel = gatherTeam?.maxTroops != null
    ? `Troops (unit ID:count · max ${formatNumber(gatherTeam.maxTroops)})`
    : 'Troops (unit ID:count)';
  makeUnitsInput(teamRow, troopsLabel);
  note(gather, 'The default lineup selects the five available heroes with the lowest recorded power.');

  // Row 2: Search Parameters (Resource + Level + Find button)
  const searchRow = document.createElement('div');
  searchRow.className = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end';
  gather.append(searchRow);

  const typeSelect = document.createElement('select');
  for (const type of ['food', 'wood', 'stone', 'iron']) {
    const option = document.createElement('option'); option.value = type; option.textContent = type; typeSelect.append(option);
  }
  typeSelect.value = experimentalSelection.mineType;
  typeSelect.addEventListener('change', () => { experimentalSelection.mineType = typeSelect.value; render(); });
  field(searchRow, 'Resource', typeSelect);

  const mineLevel = document.createElement('select');
  for (let n = 1; n <= 10; n++) {
    const option = document.createElement('option'); option.value = String(n); option.textContent = `Level ${n}`; mineLevel.append(option);
  }
  mineLevel.value = String(experimentalSelection.mineLevel);
  mineLevel.addEventListener('change', () => { experimentalSelection.mineLevel = Number(mineLevel.value); render(); });
  field(searchRow, 'Mine level', mineLevel);

  const findBtn = button(searchRow, 'Find full mines', () => {
    const call = data.buildMineSearchCall(context.mapId, mapCenter, experimentalSelection.mineType, experimentalSelection.mineLevel);
    if (call) experimentalRpc([call], 'Searching mines...');
  }, !popupRpcEnabled || !!experimentalPending || !context.mapId || !mapCenter);
  findBtn.className = 'inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 px-4 text-sm font-semibold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-40';

  // Row 3: Target Mine Results & Send Team Action
  const mineSearch = cache.experimentalMineSearch?.data;
  const mines = mineSearch?.mineConfigId === data.mineConfigId(experimentalSelection.mineType, experimentalSelection.mineLevel) ? mineSearch.mines : [];
  const mineSelect = document.createElement('select');
  for (const mine of mines) {
    const option = document.createElement('option'); option.value = mine.mineId;
    option.textContent = `(${mine.coordinates?.x ?? '?'}, ${mine.coordinates?.y ?? '?'}) · ${mine.mineId.slice(0, 8)}`;
    mineSelect.append(option);
  }
  if (!mines.some((mine) => mine.mineId === experimentalSelection.mineId)) experimentalSelection.mineId = mines[0]?.mineId || '';
  mineSelect.value = experimentalSelection.mineId;
  mineSelect.addEventListener('change', () => { experimentalSelection.mineId = mineSelect.value; });

  const actionRow = document.createElement('div');
  actionRow.className = 'grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end';
  gather.append(actionRow);
  field(actionRow, `Search results (${mines.length} full found)`, mineSelect);

  const sendBtn = button(actionRow, 'Send gathering team', async () => {
    const latest = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
    if (String(latest.accountStatus?.data?.id) !== String(cache.accountStatus?.data?.id)) {
      experimentalMessage = 'Game account changed. Select the team again.'; render(); return;
    }
    const latestHeroes = latest.heroGetAll?.data || {};
    const availableNow = data.availableHeroIds(latestHeroes, latest['getUnitSummary:unit']?.data,
      latest.marchStatus?.data?.marches);
    const heroIds = gatherTeam?.id === 'weakest' ? data.lowestPowerHeroes(latestHeroes, availableNow) : gatherTeam?.heroIds || [];
    if (heroIds.some((id) => !availableNow.includes(id))) {
      experimentalMessage = 'Selected heroes are already deployed. Select an available team.'; render(); return;
    }
    let squad = selectedSquad({ heroIds });
    if (squad && gatherTeam?.maxTroops != null) {
      squad = data.buildSquad(heroIds, data.allocateTroops({ available: squad.units }, gatherTeam.maxTroops));
    }
    const call = data.buildGatherCall(context?.mapId, experimentalSelection.mineId, squad);
    if (!call) { experimentalMessage = 'Select five heroes, valid troops, a known mine, and capture the map ID.'; render(); return; }
    await experimentalRpc([call], 'Sending gathering team...');
  }, !popupRpcEnabled || !!experimentalPending || !context?.mapId || !experimentalSelection.mineId || gatherTeam?.heroIds.length !== 5);
  sendBtn.className = 'inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 px-4 text-sm font-semibold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-40';

  // Auto-Gathering Automation Section
  const autoGatherSection = document.createElement('div');
  autoGatherSection.className = 'rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 space-y-3 dark:border-teal-900/60 dark:bg-teal-950/20';

  const autoHeader = document.createElement('div');
  autoHeader.className = 'flex items-center justify-between gap-2';

  const autoTitle = document.createElement('div');
  autoTitle.className = 'flex items-center gap-2';
  const autoIcon = document.createElement('span');
  autoIcon.textContent = '🤖';
  const autoLabel = document.createElement('h3');
  autoLabel.className = 'text-xs font-bold uppercase tracking-wide text-teal-900 dark:text-teal-200';
  autoLabel.textContent = 'Auto-Gathering Automation';
  autoTitle.append(autoIcon, autoLabel);

  const autoSettings = typeof currentAutoGatherSettings !== 'undefined'
    ? currentAutoGatherSettings
    : (globalThis.hwaHelperAutoGather?.normalizeAutoGatherSettings?.({}) || { enabled: false, maxMarches: 3, mineLevel: 5, mineType: 'rotate', lastAutoMineType: null });

  const statusBadge = document.createElement('span');
  const isAutoEnabled = autoSettings.enabled === true;
  statusBadge.className = `inline-flex items-center px-2 py-0.5 rounded text-3xs font-bold ${
    isAutoEnabled
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }`;
  statusBadge.textContent = isAutoEnabled ? '🟢 Enabled' : '⚪ Disabled';
  autoHeader.append(autoTitle, statusBadge);
  autoGatherSection.append(autoHeader);

  // Toggle & Thresholds Row
  const autoControlsRow = document.createElement('div');
  autoControlsRow.className = 'grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end';

  // 1. Enable checkbox
  const enableWrap = document.createElement('label');
  enableWrap.className = 'flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer h-9';
  const enableCheckbox = document.createElement('input');
  enableCheckbox.type = 'checkbox';
  enableCheckbox.checked = isAutoEnabled;
  enableCheckbox.className = 'rounded text-teal-600 focus:ring-teal-500';
  enableCheckbox.addEventListener('change', async () => {
    autoSettings.enabled = enableCheckbox.checked;
    if (typeof currentAutoGatherSettings !== 'undefined') currentAutoGatherSettings = autoSettings;
    await chrome.storage?.local?.set?.({ autoGatherSettings: autoSettings });
    render();
  });
  const enableText = document.createElement('span');
  enableText.textContent = 'Enable Auto-Gather';
  enableWrap.append(enableCheckbox, enableText);
  autoControlsRow.append(enableWrap);

  // 2. Max marches threshold (< 3)
  const maxMarchesSelect = document.createElement('select');
  maxMarchesSelect.className = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  for (let n = 1; n <= 5; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `< ${n} active marches`;
    maxMarchesSelect.append(opt);
  }
  maxMarchesSelect.value = String(autoSettings.maxMarches || 3);
  maxMarchesSelect.addEventListener('change', async () => {
    autoSettings.maxMarches = Number(maxMarchesSelect.value);
    if (typeof currentAutoGatherSettings !== 'undefined') currentAutoGatherSettings = autoSettings;
    await chrome.storage?.local?.set?.({ autoGatherSettings: autoSettings });
    render();
  });
  field(autoControlsRow, 'Trigger when', maxMarchesSelect);

  // 3. Resource type (Rotate or specific)
  const autoTypeSelect = document.createElement('select');
  autoTypeSelect.className = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const rotOpt = document.createElement('option');
  rotOpt.value = 'rotate';
  rotOpt.textContent = 'Rotate (Food → Wood → Stone → Iron)';
  autoTypeSelect.append(rotOpt);
  for (const t of ['food', 'wood', 'stone', 'iron']) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    autoTypeSelect.append(opt);
  }
  autoTypeSelect.value = autoSettings.mineType || 'rotate';
  autoTypeSelect.addEventListener('change', async () => {
    autoSettings.mineType = autoTypeSelect.value;
    if (typeof currentAutoGatherSettings !== 'undefined') currentAutoGatherSettings = autoSettings;
    await chrome.storage?.local?.set?.({ autoGatherSettings: autoSettings });
    render();
  });
  field(autoControlsRow, 'Resource type', autoTypeSelect);

  // 4. Mine level
  const autoLevelSelect = document.createElement('select');
  autoLevelSelect.className = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  for (let lvl = 1; lvl <= 10; lvl++) {
    const opt = document.createElement('option');
    opt.value = String(lvl);
    opt.textContent = `Level ${lvl}`;
    autoLevelSelect.append(opt);
  }
  autoLevelSelect.value = String(autoSettings.mineLevel || 5);
  autoLevelSelect.addEventListener('change', async () => {
    autoSettings.mineLevel = Number(autoLevelSelect.value);
    if (typeof currentAutoGatherSettings !== 'undefined') currentAutoGatherSettings = autoSettings;
    await chrome.storage?.local?.set?.({ autoGatherSettings: autoSettings });
    render();
  });
  field(autoControlsRow, 'Target level', autoLevelSelect);

  autoGatherSection.append(autoControlsRow);

  const nextTargetType = globalThis.hwaHelperAutoGather?.resolveNextMineType?.(
    autoSettings.mineType,
    autoSettings.lastAutoMineType
  ) || 'food';
  const helperNote = document.createElement('p');
  helperNote.className = 'text-2xs text-slate-500 dark:text-slate-400';
  if (isAutoEnabled) {
    const rotationInfo = autoSettings.mineType === 'rotate'
      ? `Cycling: Next target is <strong>${nextTargetType.toUpperCase()}</strong>${autoSettings.lastAutoMineType ? ` (last sent: ${autoSettings.lastAutoMineType})` : ''}`
      : `Target: <strong>${autoSettings.mineType.toUpperCase()}</strong>`;
    helperNote.innerHTML = `Dispatches automatically on game load or when marches return to base if active marches &lt; ${autoSettings.maxMarches}. ${rotationInfo}.`;
  } else {
    helperNote.textContent = 'Auto-gathering is currently paused. Check the box above to automatically search and send teams.';
  }
  autoGatherSection.append(helperNote);

  gather.append(autoGatherSection);

  const now = Date.now();
  const allGatherMarches = (cache.marchStatus?.data?.marches || []).filter((march) =>
    (march.mineId || march.previousKind === 'gather' || ['wood', 'stone', 'iron', 'gold', 'food'].includes(march.kind) || ['wood', 'stone', 'iron', 'gold', 'food'].includes(march.previousKind)) &&
    !(globalThis.hwaHelperPopupData?.isMarchExpired ? globalThis.hwaHelperPopupData.isMarchExpired(march, now) : (Number.isFinite(march.endsAt) && now >= march.endsAt)));

  const activeMines = allGatherMarches.filter((march) => march.stage !== 'returnToOutpost' && march.kind !== 'return');
  const returningMines = allGatherMarches.filter((march) => march.stage === 'returnToOutpost' || march.kind === 'return');

  let currentGatherStageIcon = '⛏️';
  if (returningMines.length > 0 && activeMines.length === 0) {
    currentGatherStageIcon = '↩️';
  } else if (activeMines.some((m) => Number.isFinite(m.targetArrivalAt) && now < m.targetArrivalAt)) {
    currentGatherStageIcon = '🚶‍♂️';
  } else if (activeMines.length > 0) {
    currentGatherStageIcon = '⛏️';
  }

  const gatherIcon = document.querySelector('#gather-dialog-icon');
  if (gatherIcon) {
    gatherIcon.textContent = currentGatherStageIcon;
  }

  // Title bar status for Gathering dialog
  const gatherTitleStatus = document.querySelector('#gather-dialog-status');
  if (gatherTitleStatus) {
    gatherTitleStatus.replaceChildren();
    if (activeMines.length > 0 || returningMines.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800/60';
      const iconSpan = document.createElement('span');
      iconSpan.textContent = currentGatherStageIcon;
      const dot = document.createElement('span');
      dot.className = 'size-1.5 rounded-full bg-emerald-500 animate-pulse';
      const text = document.createElement('span');
      const details = [];
      if (activeMines.length > 0) details.push(`${activeMines.length} team(s) gathering`);
      if (returningMines.length > 0) details.push(`${returningMines.length} returning`);
      text.textContent = details.join(', ');
      badge.append(iconSpan, dot, text);
      gatherTitleStatus.append(badge);
    }
  }

  for (const march of activeMines) {
    const row = document.createElement('div'); row.className = 'flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-800/50';
    const label = document.createElement('span'); label.textContent = `${march.kind} · ${march.stage} · ${march.squadId}`;
    row.append(label); gather.append(row);
    button(row, 'Recall', () => experimentalRpc([{ name: 'stopMineGathering', feature: 'mine',
      args: { squadId: march.squadId } }], 'Recalling team...'), !popupRpcEnabled || !!experimentalPending || !march.squadId);
  }
  if (experimentalMessage) note(host, experimentalMessage);
  if (!popupRpcEnabled) note(host, 'Enable Allow popup RPC calls in Settings to use gathering actions.');
}

async function experimentalRpc(calls, message) {
  if (!popupRpcEnabled) { experimentalMessage = 'Enable popup RPC calls in Settings.'; render(); return; }
  if (experimentalPending) return;
  const pending = { name: calls[0].name, sentAt: Date.now() };
  experimentalPending = pending;
  experimentalMessage = message;
  const response = await chrome.runtime.sendMessage({ kind: 'experimental-rpc', calls }).catch((error) => ({ error: String(error) }));
  if (experimentalPending !== pending) return;
  if (response?.ok) {
    pending.queued = response.queued === true;
    experimentalMessage = response.queued ? 'Queued for the next game RPC (up to two minutes).' : 'RPC sent. Waiting for game result...';
    setTimeout(() => { if (experimentalPending?.name === calls[0].name) render(); }, response.queued ? 121000 : 31000);
  }
  else {
    experimentalPending = null;
    experimentalMessage = response?.error || 'Could not reach the game tab.';
  }
  render();
}

let buildingSearchQuery = '';
let researchSearchQuery = '';
let researchFilterTab = 'all';
let nextBuildingFilterQuery = '';
let nextBuildingSortOrder = 'level-desc';
let nextResearchFilterQuery = '';
let nextResearchSortOrder = 'level-desc';
let currentBuildingQueue = { enabled: true, items: [] };
let currentResearchQueue = { enabled: true, items: [] };

function formatRemainingHms(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function saveBuildingQueue() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ buildingQueue: currentBuildingQueue }, () => {
      try {
        const p = chrome.runtime?.sendMessage?.({ kind: 'building-queue-action', action: 'sync' });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    });
  }
}

function saveResearchQueue() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ researchQueue: currentResearchQueue }, () => {
      try {
        const p = chrome.runtime?.sendMessage?.({ kind: 'research-queue-action', action: 'sync' });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    });
  }
}

function renderBuildingDialog(cache) {
  const host = document.querySelector('#building-dialog-body');
  const statusWrap = document.querySelector('#building-dialog-status');
  if (!host) return;
  host.replaceChildren();
  statusWrap?.replaceChildren();

  const now = Date.now();
  const getBuildingName = (id) => globalThis.hwaHelperNameMap?.building?.(id) || (id ? `Building #${id}` : 'Building');
  const rawQueues = cache?.buildingStatus?.data?.queues || [];
  const inProgressQueues = rawQueues.filter((q) =>
    Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now
  );
  const activeQueues = inProgressQueues;
  const finishedQueues = rawQueues.filter((q) =>
    Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs <= now
  );

  // 1. Title bar status
  if (statusWrap) {
    if (activeQueues.length > 0) {
      const q = activeQueues[0];
      const name = getBuildingName(q.buildingId);
      const lvl = q.level ? ` Lv. ${q.level}` : '';
      const rem = (q.startDate + q.durationMs) - now;
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      badge.innerHTML = `<span class="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>Active: <span class="truncate max-w-[140px]">${name}</span>${lvl} · <span data-experimental-until="${q.startDate + q.durationMs}" data-countdown-format="hms">${formatRemainingHms(rem)}</span>`;
      statusWrap.append(badge);
    } else if (finishedQueues.length > 0) {
      const q = finishedQueues[0];
      const name = getBuildingName(q.buildingId);
      const lvl = q.level ? ` Lv. ${q.level}` : '';
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      badge.innerHTML = `<span class="size-1.5 rounded-full bg-emerald-500"></span>Ready to finish: <span class="truncate max-w-[140px]">${name}</span>${lvl}`;
      statusWrap.append(badge);
    } else {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      badge.innerHTML = '<span class="size-1.5 rounded-full bg-emerald-500"></span>Idle';
      statusWrap.append(badge);
    }
  }

  // Section 1: Active Construction Queue
  const queueSection = document.createElement('section');
  queueSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  const queueTitle = document.createElement('h3');
  queueTitle.className = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between gap-2';
  queueTitle.innerHTML = '<span class="flex items-center gap-2"><span>🏗️</span> Active Construction Queue</span>';
  queueSection.append(queueTitle);

  const hasQueues = activeQueues.length > 0 || finishedQueues.length > 0;
  if (hasQueues) {
    const queueList = document.createElement('div');
    queueList.className = 'space-y-3';

    // 1. Finished buildings (ready to finalize)
    for (const f of finishedQueues) {
      const card = document.createElement('div');
      card.className = 'rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30';
      const name = getBuildingName(f.buildingId);

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 flex-wrap';
      const infoDiv = document.createElement('div');
      infoDiv.className = 'flex items-center gap-2 min-w-0';
      infoDiv.innerHTML = `
        <span class="text-xl">🎉</span>
        <div>
          <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">${name} · Complete</div>
          <div class="text-xs text-emerald-700 dark:text-emerald-400">Queue #${f.queueNumber ?? 0} · Target Lv. ${f.level ?? '?'} finished</div>
        </div>
      `;

      const finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-colors';
      finishBtn.innerHTML = '<span>✅</span><span>Finish</span>';
      finishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        finishBtn.disabled = true;
        finishBtn.textContent = 'Finishing...';
        const calls = [
          {
            name: 'completeConstruction',
            feature: 'building',
            args: {
              buildingId: f.buildingId,
              nextLevel: f.level,
              completeDate: Date.now()
            }
          },
          { name: 'getSummary', feature: 'building', args: {} }
        ];
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, () => {
            setTimeout(() => {
              if (typeof renderBuildingDialog === 'function' && typeof currentCache !== 'undefined') {
                renderBuildingDialog(currentCache);
              }
            }, 800);
          });
        }
      });
      row.append(infoDiv, finishBtn);
      card.append(row);
      queueList.append(card);
    }

    // 2. In-progress buildings
    for (const q of activeQueues) {
      const card = document.createElement('div');
      card.className = 'rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20';
      const finishTs = q.startDate + q.durationMs;
      const remMs = finishTs - now;
      const progress = Math.min(100, Math.max(0, ((now - q.startDate) / q.durationMs) * 100));
      const finishDate = new Date(finishTs);

      card.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-lg">🏗️</span>
            <div>
              <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">${getBuildingName(q.buildingId)}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Queue #${q.queueNumber ?? 0} · Building ID: ${q.buildingId}</div>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
              Target Lv. ${q.level ?? '?'}
            </span>
            <div class="text-xs font-mono font-bold text-amber-800 dark:text-amber-300 mt-1">
              <span data-experimental-until="${finishTs}" data-countdown-format="hms">${formatRemainingHms(remMs)}</span> remaining
            </div>
          </div>
        </div>
        <div class="mt-3">
          <div class="flex justify-between text-2xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Progress: ${progress.toFixed(1)}%</span>
            <span>Est. finish: ${finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div data-progress-bar="" data-progress-start="${q.startDate}" data-progress-duration="${q.durationMs}" class="bg-amber-500 h-full rounded-full transition-all" style="width: ${progress.toFixed(1)}%"></div>
          </div>
        </div>
      `;
      queueList.append(card);
    }
    queueSection.append(queueList);
  } else {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400';
    emptyBox.innerHTML = '<span class="text-xl">✅</span><div><div class="font-semibold text-slate-700 dark:text-slate-300">Builder is currently idle</div><div>No construction in progress. Ready for new building upgrades.</div></div>';
    queueSection.append(emptyBox);
  }

  // Automation Queue Subsection (inside queueSection to preserve 3-section layout)
  const autoBox = document.createElement('div');
  autoBox.className = 'mt-3 pt-3 border-t border-slate-100 dark:border-slate-800';

  const autoHeader = document.createElement('div');
  autoHeader.className = 'flex items-center justify-between gap-2 flex-wrap mb-2';
  const autoTitle = document.createElement('div');
  autoTitle.className = 'flex items-center gap-2';
  const queuedCount = currentBuildingQueue.items?.length || 0;
  autoTitle.innerHTML = `<span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><span>⚡</span> Auto-Build Queue</span><span class="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">${queuedCount} queued</span>`;
  autoHeader.append(autoTitle);

  const autoControls = document.createElement('div');
  autoControls.className = 'flex items-center gap-2';

  const autoToggleLabel = document.createElement('label');
  autoToggleLabel.className = 'inline-flex items-center gap-1.5 text-2xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none';
  const autoToggleInput = document.createElement('input');
  autoToggleInput.type = 'checkbox';
  autoToggleInput.checked = currentBuildingQueue.enabled !== false;
  autoToggleInput.className = 'rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-3.5 w-3.5';
  autoToggleInput.addEventListener('change', (e) => {
    currentBuildingQueue.enabled = e.target.checked;
    saveBuildingQueue();
  });
  const autoText = document.createElement('span');
  autoText.textContent = 'Auto-advance';
  autoToggleLabel.append(autoToggleInput, autoText);
  autoControls.append(autoToggleLabel);

  if (queuedCount > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'text-2xs text-rose-500 hover:text-rose-600 dark:text-rose-400 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (globalThis.hwaHelperBuildingQueue?.clearQueue) {
        currentBuildingQueue = globalThis.hwaHelperBuildingQueue.clearQueue(currentBuildingQueue);
      } else {
        currentBuildingQueue.items = [];
      }
      saveBuildingQueue();
      renderBuildingDialog(cache);
    });
    autoControls.append(clearBtn);
  }
  autoHeader.append(autoControls);
  autoBox.append(autoHeader);

  const queueTimeline = globalThis.hwaHelperBuildingQueue?.calculateQueueTimeline
    ? globalThis.hwaHelperBuildingQueue.calculateQueueTimeline(rawQueues, currentBuildingQueue.items, now)
    : { items: currentBuildingQueue.items || [], totalDurationMs: 0, allDoneAt: now };

  if (queueTimeline.items && queueTimeline.items.length > 0) {
    const autoList = document.createElement('div');
    autoList.className = 'space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5';

    queueTimeline.items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs dark:border-slate-700/60 dark:bg-slate-800/60';
      const name = getBuildingName(item.buildingId);
      const estStart = item.estStart ? new Date(item.estStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const estFinish = item.estFinish ? new Date(item.estFinish).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      const left = document.createElement('div');
      left.className = 'min-w-0 flex items-center gap-2 flex-1';
      left.innerHTML = `
        <span class="inline-flex items-center justify-center size-5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-2xs font-bold shrink-0">#${idx + 1}</span>
        <div class="min-w-0">
          <div class="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
            <span>${name}</span>
            <span class="text-2xs font-normal text-slate-400">(ID: ${item.buildingId})</span>
          </div>
          <div class="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-amber-600 dark:text-amber-400">Lv. ${item.currentLevel ?? '?'} ➔ ${item.nextLevel}</span>
            <span>·</span>
            <span>⏱ ${formatRemainingHms(item.durationMs || 1000)}</span>
            ${estFinish ? `<span>·</span><span>Est: ${estStart} ➔ ${estFinish}</span>` : ''}
          </div>
        </div>
      `;
      row.append(left);

      const right = document.createElement('div');
      right.className = 'flex items-center gap-1 shrink-0';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.title = 'Move up';
      upBtn.disabled = idx === 0;
      upBtn.className = idx === 0
        ? 'size-6 rounded flex items-center justify-center text-2xs text-slate-300 dark:text-slate-600 cursor-not-allowed'
        : 'size-6 rounded flex items-center justify-center text-2xs text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer';
      upBtn.innerHTML = '▲';
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (idx > 0) {
          if (globalThis.hwaHelperBuildingQueue?.reorderQueue) {
            currentBuildingQueue = globalThis.hwaHelperBuildingQueue.reorderQueue(currentBuildingQueue, idx, idx - 1);
          } else {
            const removed = currentBuildingQueue.items.splice(idx, 1)[0];
            currentBuildingQueue.items.splice(idx - 1, 0, removed);
          }
          saveBuildingQueue();
          renderBuildingDialog(cache);
        }
      });
      right.append(upBtn);

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.title = 'Move down';
      downBtn.disabled = idx === queueTimeline.items.length - 1;
      downBtn.className = idx === queueTimeline.items.length - 1
        ? 'size-6 rounded flex items-center justify-center text-2xs text-slate-300 dark:text-slate-600 cursor-not-allowed'
        : 'size-6 rounded flex items-center justify-center text-2xs text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer';
      downBtn.innerHTML = '▼';
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (idx < currentBuildingQueue.items.length - 1) {
          if (globalThis.hwaHelperBuildingQueue?.reorderQueue) {
            currentBuildingQueue = globalThis.hwaHelperBuildingQueue.reorderQueue(currentBuildingQueue, idx, idx + 1);
          } else {
            const removed = currentBuildingQueue.items.splice(idx, 1)[0];
            currentBuildingQueue.items.splice(idx + 1, 0, removed);
          }
          saveBuildingQueue();
          renderBuildingDialog(cache);
        }
      });
      right.append(downBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = 'Remove from queue';
      removeBtn.className = 'size-6 rounded flex items-center justify-center text-2xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (globalThis.hwaHelperBuildingQueue?.removeFromQueue) {
          currentBuildingQueue = globalThis.hwaHelperBuildingQueue.removeFromQueue(currentBuildingQueue, idx);
        } else {
          currentBuildingQueue.items.splice(idx, 1);
        }
        saveBuildingQueue();
        renderBuildingDialog(cache);
      });
      right.append(removeBtn);

      row.append(right);
      autoList.append(row);
    });

    autoBox.append(autoList);

    const autoFooter = document.createElement('div');
    autoFooter.className = 'mt-2 text-2xs text-slate-400 dark:text-slate-500 flex justify-between items-center';
    const allDoneStr = queueTimeline.allDoneAt ? new Date(queueTimeline.allDoneAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    autoFooter.innerHTML = `<span>Total time: <span class="font-semibold text-slate-600 dark:text-slate-300">${formatRemainingHms(queueTimeline.totalDurationMs)}</span></span><span>Completion: <span class="font-semibold text-slate-600 dark:text-slate-300">${allDoneStr}</span></span>`;
    autoBox.append(autoFooter);
  } else {
    const queueEmptyP = document.createElement('p');
    queueEmptyP.className = 'text-2xs text-slate-400 italic py-1';
    queueEmptyP.textContent = 'Queue is empty. Click "+ Queue" on candidates below to automate next upgrades.';
    autoBox.append(queueEmptyP);
  }

  queueSection.append(autoBox);
  host.append(queueSection);

  // Extract known city buildings
  const rawBuildings = cache?.buildingStatus?.data?.buildings || [];
  const buildingMap = new Map();
  for (const b of rawBuildings) {
    const bId = Number(b.buildingId ?? b.id);
    if (Number.isFinite(bId)) {
      buildingMap.set(bId, {
        id: bId,
        level: b.level ?? 1,
        initialBuildDate: b.initialBuildDate,
        isBuilt: true,
        isUpgrading: false,
        nextLevel: (b.level ?? 1) + 1
      });
    }
  }

  // Flag upgrading buildings from active queues
  for (const q of activeQueues) {
    const bId = Number(q.buildingId);
    if (buildingMap.has(bId)) {
      const item = buildingMap.get(bId);
      item.isUpgrading = true;
      item.nextLevel = q.level ?? (item.level + 1);
    } else {
      buildingMap.set(bId, {
        id: bId,
        level: (q.level ? q.level - 1 : 1),
        isBuilt: true,
        isUpgrading: true,
        nextLevel: q.level ?? 2
      });
    }
  }

  // Also include known dictionary for unbuilt candidates
  const allDict = globalThis.hwaHelperNameData?.names?.building || {};
  for (const key of Object.keys(allDict)) {
    const bId = Number(key);
    if (!buildingMap.has(bId)) {
      buildingMap.set(bId, {
        id: bId,
        level: 0,
        isBuilt: false,
        isUpgrading: false,
        nextLevel: 1
      });
    }
  }

  const allBuildings = Array.from(buildingMap.values());
  const builtBuildings = allBuildings.filter((b) => b.isBuilt);

  // Calculate simulated levels including active queue and queued automation items
  const simulatedLevels = globalThis.hwaHelperBuildingQueue?.getSimulatedLevels
    ? globalThis.hwaHelperBuildingQueue.getSimulatedLevels(buildingMap, rawQueues, currentBuildingQueue.items)
    : (() => {
        const sim = new Map();
        for (const [id, b] of buildingMap.entries()) sim.set(id, b.level);
        for (const q of rawQueues) {
          if (Number.isFinite(q.buildingId) && Number.isFinite(q.level)) {
            sim.set(Number(q.buildingId), Math.max(sim.get(Number(q.buildingId)) || 0, q.level));
          }
        }
        for (const item of currentBuildingQueue?.items || []) {
          if (Number.isFinite(item.buildingId) && Number.isFinite(item.nextLevel)) {
            sim.set(Number(item.buildingId), Math.max(sim.get(Number(item.buildingId)) || 0, item.nextLevel));
          }
        }
        return sim;
      })();

  const hallOfHeroes = buildingMap.get(20);
  const hallLevel = simulatedLevels.get(20) ?? (Number.isFinite(hallOfHeroes?.level) ? hallOfHeroes.level : Infinity);

  const bHelper = globalThis.hwaHelperBuildingData;
  const resourcesMap = new Map([
    [2, cache['resource:material:2']?.data?.amount ?? 0],
    [3, cache['resource:material:3']?.data?.amount ?? 0],
    [4, cache['resource:material:4']?.data?.amount ?? 0],
    [5, cache['resource:material:5']?.data?.amount ?? 0]
  ]);

  const SYSTEM_LANDMARK_BUILDING_IDS = new Set([44, 160, 161, 166, 167, 168, 169, 176, 177]);

  const nextUpgradable = allBuildings
    .map((b) => {
      const curLvl = simulatedLevels.get(b.id) ?? (b.isBuilt ? b.level : 0);
      const nextLvl = (curLvl > 0 || b.isBuilt) ? (curLvl + 1) : 1;
      const durationMs = bHelper?.calculateEffectiveDurationMs
        ? bHelper.calculateEffectiveDurationMs(b.id, nextLvl)
        : 1000;
      return {
        ...b,
        level: curLvl,
        currentLevel: curLvl,
        nextLevel: nextLvl,
        durationMs
      };
    })
    .filter((b) => {
      if (SYSTEM_LANDMARK_BUILDING_IDS.has(Number(b.id))) return false;
      if (!b.isBuilt || b.level <= 0 || b.isUpgrading) return false;
      if (b.id !== 20 && b.level >= hallLevel) return false;
      if (bHelper?.getBuildingLevelData && bHelper.data?.[b.id] && !bHelper.getBuildingLevelData(b.id, b.nextLevel)) {
        return false;
      }
      if (bHelper?.getMissingRequirements) {
        const missingReqs = bHelper.getMissingRequirements(b.id, b.nextLevel, simulatedLevels);
        if (missingReqs.length > 0) return false;
      }
      return true;
    })
    .sort((a, b) => (b.level - a.level) || (a.id - b.id));

  // Section 2: Next Upgradable Buildings
  const nextSection = document.createElement('section');
  nextSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  const nextTitle = document.createElement('h3');
  nextTitle.className = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between';
  const nextTitleText = document.createElement('span');
  nextTitleText.className = 'flex items-center gap-2';
  nextTitleText.innerHTML = '<span>⚡</span> Next Upgradable Buildings';
  const nextBadge = document.createElement('span');
  nextBadge.id = 'next-building-count-badge';
  nextBadge.className = 'text-2xs font-normal text-slate-400';
  nextBadge.textContent = `${nextUpgradable.length} ready`;
  nextTitle.append(nextTitleText, nextBadge);
  nextSection.append(nextTitle);

  const nextIntro = document.createElement('div');
  nextIntro.className = 'mb-3 flex flex-col gap-2.5';
  const desc = document.createElement('p');
  desc.className = 'text-xs text-slate-500 dark:text-slate-400';
  desc.textContent = activeQueues.length > 0
    ? 'Builder queue is currently occupied. Once complete, the following buildings can be upgraded next:'
    : 'Builder queue is available. The following buildings can be upgraded next:';
  nextIntro.append(desc);

  const nextControls = document.createElement('div');
  nextControls.className = 'flex items-center gap-2 flex-wrap pt-0.5';

  const nextSearchWrap = document.createElement('div');
  nextSearchWrap.className = 'flex-1 min-w-[140px]';
  const nextSearchInput = document.createElement('input');
  nextSearchInput.type = 'search';
  nextSearchInput.id = 'next-building-search-input';
  nextSearchInput.placeholder = 'Filter candidates or ID...';
  nextSearchInput.value = nextBuildingFilterQuery;
  nextSearchInput.className = 'h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500';
  nextSearchWrap.append(nextSearchInput);
  nextControls.append(nextSearchWrap);

  const nextSortWrap = document.createElement('div');
  nextSortWrap.className = 'shrink-0 flex items-center gap-1.5';
  const sortLabel = document.createElement('span');
  sortLabel.className = 'text-2xs text-slate-400';
  sortLabel.textContent = 'Sort:';
  nextSortWrap.append(sortLabel);

  const nextSortSelect = document.createElement('select');
  nextSortSelect.id = 'next-building-sort-select';
  nextSortSelect.className = 'h-7 rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-700 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

  const sortOptions = [
    { value: 'level-desc', label: 'Level: High → Low' },
    { value: 'level-asc', label: 'Level: Low → High' },
    { value: 'time-asc', label: 'Build Time: Shortest → Longest' },
    { value: 'time-desc', label: 'Build Time: Longest → Shortest' },
    { value: 'name-asc', label: 'Name: A → Z' }
  ];
  for (const opt of sortOptions) {
    const optEl = document.createElement('option');
    optEl.value = opt.value;
    optEl.textContent = opt.label;
    if (opt.value === nextBuildingSortOrder) optEl.selected = true;
    nextSortSelect.append(optEl);
  }
  nextSortSelect.value = nextBuildingSortOrder;
  nextSortWrap.append(nextSortSelect);
  nextControls.append(nextSortWrap);
  nextIntro.append(nextControls);
  nextSection.append(nextIntro);

  const nextGrid = document.createElement('div');
  nextGrid.id = 'next-building-grid';
  nextGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1';

  function renderNextBuildingCards() {
    nextGrid.replaceChildren();
    const query = nextBuildingFilterQuery.toLowerCase().trim();
    const filtered = nextUpgradable
      .filter((b) => {
        if (!query) return true;
        const name = getBuildingName(b.id).toLowerCase();
        const idStr = String(b.id);
        return name.includes(query) || idStr.includes(query);
      })
      .sort((a, b) => {
        if (nextBuildingSortOrder === 'time-asc') {
          return (a.durationMs - b.durationMs) || (b.level - a.level) || (a.id - b.id);
        }
        if (nextBuildingSortOrder === 'time-desc') {
          return (b.durationMs - a.durationMs) || (b.level - a.level) || (a.id - b.id);
        }
        if (nextBuildingSortOrder === 'level-asc') {
          return (a.level - b.level) || (a.id - b.id);
        }
        if (nextBuildingSortOrder === 'name-asc') {
          const nameA = getBuildingName(a.id);
          const nameB = getBuildingName(b.id);
          return nameA.localeCompare(nameB) || (a.id - b.id);
        }
        return (b.level - a.level) || (a.id - b.id);
      });

    const badge = nextSection.querySelector('#next-building-count-badge');
    if (badge) {
      badge.textContent = query
        ? `${filtered.length} / ${nextUpgradable.length} ready`
        : `${nextUpgradable.length} ready`;
    }

    if (filtered.length > 0) {
      for (const b of filtered) {
        const card = document.createElement('div');
        card.className = 'flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-xs hover:border-amber-300 hover:bg-amber-50/40 transition-colors dark:border-slate-700/80 dark:bg-slate-800/60 dark:hover:border-amber-800/60';
        const name = getBuildingName(b.id);
        const durationMs = b.durationMs || (bHelper?.calculateEffectiveDurationMs
          ? bHelper.calculateEffectiveDurationMs(b.id, b.nextLevel)
          : 1000);
        const missingCosts = bHelper?.getMissingCosts
          ? bHelper.getMissingCosts(b.id, b.nextLevel, resourcesMap)
          : [];
        const hasEnoughResources = missingCosts.length === 0;

        const estFinishTs = (queueTimeline.allDoneAt || now) + durationMs;
        const estFinishDate = new Date(estFinishTs);

        // Top row: ID pill + full building name (1 line truncate) + Level badge
        const topRow = document.createElement('div');
        topRow.className = 'flex items-center justify-between gap-2 min-w-0';

        const nameGroup = document.createElement('div');
        nameGroup.className = 'flex items-center gap-1.5 min-w-0 flex-1';

        const idPill = document.createElement('span');
        idPill.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0';
        idPill.textContent = `#${b.id}`;

        const nameText = document.createElement('span');
        nameText.className = 'font-bold text-slate-900 dark:text-slate-100 truncate text-xs';
        nameText.textContent = name;
        nameText.title = name;

        nameGroup.append(idPill, nameText);

        const levelBadge = document.createElement('span');
        levelBadge.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 shrink-0';
        levelBadge.textContent = b.isBuilt ? `Lv. ${b.level} ➔ ${b.nextLevel}` : 'Build Lv. 1';

        topRow.append(nameGroup, levelBadge);
        card.append(topRow);

        // Bottom row: Time info on left, action buttons on right
        const bottomRow = document.createElement('div');
        bottomRow.className = 'flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/50';

        const timeInfo = document.createElement('div');
        timeInfo.className = 'flex items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400 min-w-0';
        timeInfo.innerHTML = `
          <span class="inline-flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300" title="Build Duration">
            <span>⏱</span><span>${formatRemainingHms(durationMs)}</span>
          </span>
          <span class="text-slate-300 dark:text-slate-600">·</span>
          <span class="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500" title="Estimated Finish Time">
            <span>🏁</span><span>${estFinishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        `;
        bottomRow.append(timeInfo);

        const actionGroup = document.createElement('div');
        actionGroup.className = 'flex items-center gap-1.5 shrink-0';

        const queueBtn = document.createElement('button');
        queueBtn.type = 'button';
        queueBtn.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600';
        queueBtn.innerHTML = '<span>➕</span><span>Queue</span>';
        queueBtn.title = `Add ${name} Lv. ${b.nextLevel} to auto-build queue`;
        queueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (globalThis.hwaHelperBuildingQueue?.addToQueue) {
            currentBuildingQueue = globalThis.hwaHelperBuildingQueue.addToQueue(currentBuildingQueue, {
              buildingId: b.id,
              currentLevel: b.currentLevel ?? b.level,
              nextLevel: b.nextLevel,
              durationMs
            });
          } else {
            currentBuildingQueue.items = currentBuildingQueue.items || [];
            currentBuildingQueue.items.push({
              buildingId: b.id,
              currentLevel: b.currentLevel ?? b.level,
              nextLevel: b.nextLevel,
              durationMs
            });
          }
          saveBuildingQueue();
          renderBuildingDialog(cache);
        });
        actionGroup.append(queueBtn);

        const isQueueBusy = activeQueues.length > 0;
        const isRpcReady = typeof popupRpcEnabled === 'undefined' || popupRpcEnabled !== false;
        const canUpgrade = !isQueueBusy && isRpcReady && hasEnoughResources;

        if (canUpgrade) {
          const buildBtn = document.createElement('button');
          buildBtn.type = 'button';
          buildBtn.disabled = false;
          buildBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer transition-colors';
          buildBtn.title = `Build ${name} to Lv. ${b.nextLevel}`;
          buildBtn.innerHTML = `<span>🔨</span><span>${b.isBuilt ? 'Upgrade' : 'Build'}</span>`;

          buildBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (buildBtn.disabled) return;
            buildBtn.disabled = true;
            buildBtn.textContent = 'Building...';
            const calls = [];
            for (const f of finishedQueues) {
              calls.push({
                name: 'completeConstruction',
                feature: 'building',
                args: {
                  buildingId: f.buildingId,
                  nextLevel: f.level,
                  completeDate: Date.now()
                }
              });
            }
            calls.push({
              name: 'startConstruction',
              feature: 'building',
              args: {
                buildingId: b.id,
                nextLevel: b.nextLevel,
                startDate: Date.now(),
                durationMs
              }
            });
            calls.push({ name: 'getSummary', feature: 'building', args: {} });
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, (response) => {
                if (!response?.ok) {
                  buildBtn.disabled = false;
                  buildBtn.textContent = response?.error || 'Failed';
                } else {
                  buildBtn.textContent = response.queued ? 'Queued' : 'Started!';
                  setTimeout(() => {
                    if (typeof renderBuildingDialog === 'function' && typeof currentCache !== 'undefined') {
                      renderBuildingDialog(currentCache);
                    }
                  }, 1000);
                }
              });
            }
          });
          actionGroup.append(buildBtn);
        }

        bottomRow.append(actionGroup);
        card.append(bottomRow);
        nextGrid.append(card);
      }
    } else {
      const emptyP = document.createElement('p');
      emptyP.className = 'text-xs text-slate-400 italic py-2 col-span-full';
      emptyP.textContent = query ? 'No matching buildings found.' : 'No upgradable buildings found.';
      nextGrid.append(emptyP);
    }
  }

  nextSearchInput.addEventListener('input', (e) => {
    nextBuildingFilterQuery = e.target.value;
    renderNextBuildingCards();
  });
  nextSortSelect.addEventListener('change', (e) => {
    nextBuildingSortOrder = e.target.value;
    renderNextBuildingCards();
  });

  renderNextBuildingCards();
  nextSection.append(nextGrid);
  host.append(nextSection);

  // Section 3: All City Buildings Directory
  const dirSection = document.createElement('section');
  dirSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  const dirHeader = document.createElement('div');
  dirHeader.className = 'flex items-center justify-between gap-3 flex-wrap mb-3';
  dirHeader.innerHTML = `
    <div>
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <span>🏛️</span> All City Buildings
      </h3>
      <p id="building-count-subtitle" class="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">${builtBuildings.length} built buildings</p>
    </div>
  `;

  const searchWrap = document.createElement('div');
  searchWrap.className = 'w-full sm:w-64';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'building-search-input';
  searchInput.placeholder = 'Search buildings or ID...';
  searchInput.value = buildingSearchQuery;
  searchInput.className = 'h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500';

  searchWrap.append(searchInput);
  dirHeader.append(searchWrap);
  dirSection.append(dirHeader);

  const dirGrid = document.createElement('div');
  dirGrid.id = 'building-grid-list';
  dirGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1';

  function updateBuildingGrid() {
    dirGrid.replaceChildren();
    const query = buildingSearchQuery.toLowerCase();
    const filtered = allBuildings
      .filter((b) => {
        if (!query) return b.isBuilt;
        const name = getBuildingName(b.id).toLowerCase();
        const idStr = String(b.id);
        return name.includes(query) || idStr.includes(query);
      })
      .sort((a, b) => {
        if (a.isUpgrading !== b.isUpgrading) return a.isUpgrading ? -1 : 1;
        if (a.isBuilt !== b.isBuilt) return a.isBuilt ? -1 : 1;
        return (b.level - a.level) || (a.id - b.id);
      });

    const sub = dirSection.querySelector('#building-count-subtitle');
    if (sub) {
      sub.textContent = query
        ? `${filtered.length} matching "${query}" (${builtBuildings.length} built)`
        : `${builtBuildings.length} built buildings`;
    }

    if (filtered.length > 0) {
      for (const b of filtered) {
        const card = document.createElement('div');
        card.className = `flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
          b.isUpgrading
            ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
            : b.isBuilt
              ? 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
              : 'border-dashed border-slate-200 bg-slate-50/40 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40'
        }`;
        const name = getBuildingName(b.id);
        const statusBadge = b.isUpgrading
          ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"><span class="size-1 rounded-full bg-amber-500 animate-pulse"></span>Upgrading</span>'
          : b.isBuilt
            ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Built</span>'
            : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Unbuilt</span>';

        card.innerHTML = `
          <div class="min-w-0">
            <div class="font-semibold ${b.isBuilt ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'} truncate" title="${name}">${name}</div>
            <div class="text-2xs text-slate-400 dark:text-slate-500">ID: ${b.id}${b.initialBuildDate ? ` · Built ${new Date(b.initialBuildDate * 1000).toLocaleDateString()}` : ''}</div>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <div class="font-bold text-xs ${b.isBuilt ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}">
              ${b.isBuilt ? `Lv. ${b.level}` : '—'}
            </div>
            <div>${statusBadge}</div>
          </div>
        `;
        dirGrid.append(card);
      }
    } else {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'col-span-full py-8 text-center text-xs text-slate-400';
      emptyBox.textContent = query
        ? `No buildings matching "${query}"`
        : 'No city buildings recorded yet. Snapshots update as you play.';
      dirGrid.append(emptyBox);
    }
  }

  searchInput.addEventListener('input', (e) => {
    buildingSearchQuery = e.target.value.trim();
    updateBuildingGrid();
  });

  updateBuildingGrid();
  dirSection.append(dirGrid);
  host.append(dirSection);
}

function renderResearchDialog(cache) {
  const host = document.querySelector('#research-dialog-body');
  const statusWrap = document.querySelector('#research-dialog-status');
  if (!host) return;
  host.replaceChildren();
  statusWrap?.replaceChildren();

  const now = Date.now();
  const getResearchName = (id) => globalThis.hwaHelperNameMap?.research?.(id) || (id ? `Research #${id}` : 'Research');
  const requiresSpecialResource = (researchId, level = 1) => {
    const rHelper = globalThis.hwaHelperResearchData;
    if (!rHelper) return false;
    const meta = rHelper.getResearchLevelData?.(researchId, level) || rHelper.data?.[researchId]?.['1'];
    if (!meta || !meta.c) return false;
    return Object.keys(meta.c).some((m) => Number(m) === 12 || Number(m) > 5);
  };
  const rawQueues = cache?.researchStatus?.data?.queues || [];
  const inProgressQueues = rawQueues.filter((q) =>
    Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs > now
  );
  const activeQueues = inProgressQueues;
  const finishedQueues = rawQueues.filter((q) =>
    Number.isFinite(q.startDate) && Number.isFinite(q.durationMs) && q.startDate + q.durationMs <= now
  );

  // 1. Title bar status
  if (statusWrap) {
    if (activeQueues.length > 0) {
      const q = activeQueues[0];
      const name = getResearchName(q.researchId);
      const lvl = q.level ? ` Lv. ${q.level}` : '';
      const rem = (q.startDate + q.durationMs) - now;
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
      badge.innerHTML = `<span class="size-1.5 rounded-full bg-purple-500 animate-pulse"></span>Active: <span class="truncate max-w-[140px]">${name}</span>${lvl} · <span data-experimental-until="${q.startDate + q.durationMs}" data-countdown-format="hms">${formatRemainingHms(rem)}</span>`;
      statusWrap.append(badge);
    } else if (finishedQueues.length > 0) {
      const q = finishedQueues[0];
      const name = getResearchName(q.researchId);
      const lvl = q.level ? ` Lv. ${q.level}` : '';
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      badge.innerHTML = `<span class="size-1.5 rounded-full bg-emerald-500"></span>Ready to finish: <span class="truncate max-w-[140px]">${name}</span>${lvl}`;
      statusWrap.append(badge);
    } else {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      badge.innerHTML = '<span class="size-1.5 rounded-full bg-emerald-500"></span>Idle';
      statusWrap.append(badge);
    }
  }

  // Section 1: Active Research Queue
  const queueSection = document.createElement('section');
  queueSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  const queueTitle = document.createElement('h3');
  queueTitle.className = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between gap-2';
  queueTitle.innerHTML = '<span class="flex items-center gap-2"><span>🔬</span> Active Research Queue</span>';
  queueSection.append(queueTitle);

  const hasQueues = activeQueues.length > 0 || finishedQueues.length > 0;
  if (hasQueues) {
    const queueList = document.createElement('div');
    queueList.className = 'space-y-3';

    // 1. Finished research (ready to finalize)
    for (const f of finishedQueues) {
      const card = document.createElement('div');
      card.className = 'rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30';
      const name = getResearchName(f.researchId);

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 flex-wrap';
      const infoDiv = document.createElement('div');
      infoDiv.className = 'flex items-center gap-2 min-w-0';
      infoDiv.innerHTML = `
        <span class="text-xl">🎉</span>
        <div>
          <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">${name} · Complete</div>
          <div class="text-xs text-emerald-700 dark:text-emerald-400">Queue #${f.queueNumber ?? 0} · Target Lv. ${f.level ?? '?'} finished</div>
        </div>
      `;

      const finishBtn = document.createElement('button');
      finishBtn.type = 'button';
      finishBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-colors';
      finishBtn.innerHTML = '<span>✅</span><span>Finish</span>';
      finishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        finishBtn.disabled = true;
        finishBtn.textContent = 'Finishing...';
        const calls = [
          {
            name: 'completeResearch',
            feature: 'personalResearch',
            args: {
              researchId: f.researchId,
              level: f.level,
              completeDate: Date.now()
            }
          },
          { name: 'getSummary', feature: 'personalResearch', args: {} }
        ];
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, () => {
            setTimeout(() => {
              if (typeof renderResearchDialog === 'function' && typeof currentCache !== 'undefined') {
                renderResearchDialog(currentCache);
              }
            }, 800);
          });
        }
      });
      row.append(infoDiv, finishBtn);
      card.append(row);
      queueList.append(card);
    }

    // 2. In-progress research
    for (const q of activeQueues) {
      const card = document.createElement('div');
      card.className = 'rounded-lg border border-purple-200 bg-purple-50/60 p-3.5 dark:border-purple-900/50 dark:bg-purple-950/20';
      const finishTs = q.startDate + q.durationMs;
      const remMs = finishTs - now;
      const progress = Math.min(100, Math.max(0, ((now - q.startDate) / q.durationMs) * 100));
      const finishDate = new Date(finishTs);

      card.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-lg">🔬</span>
            <div>
              <div class="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                <span>${getResearchName(q.researchId)}</span>
                ${requiresSpecialResource(q.researchId, q.level) ? '<span class="special-resource-icon text-xs select-none cursor-help" title="Requires Honor Marks" aria-label="Requires Honor Marks">🎖️</span>' : ''}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Queue #${q.queueNumber ?? 0} · Research ID: ${q.researchId}</div>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-200 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200">
              Target Lv. ${q.level ?? '?'}
            </span>
            <div class="text-xs font-mono font-bold text-purple-800 dark:text-purple-300 mt-1">
              <span data-experimental-until="${finishTs}" data-countdown-format="hms">${formatRemainingHms(remMs)}</span> remaining
            </div>
          </div>
        </div>
        <div class="mt-3">
          <div class="flex justify-between text-2xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Progress: ${progress.toFixed(1)}%</span>
            <span>Est. finish: ${finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div data-progress-bar="" data-progress-start="${q.startDate}" data-progress-duration="${q.durationMs}" class="bg-purple-500 h-full rounded-full transition-all" style="width: ${progress.toFixed(1)}%"></div>
          </div>
        </div>
      `;
      queueList.append(card);
    }
    queueSection.append(queueList);
  } else {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400';
    emptyBox.innerHTML = '<span class="text-xl">✅</span><div><div class="font-semibold text-slate-700 dark:text-slate-300">Academy is currently idle</div><div>No research in progress. Ready for new technology research.</div></div>';
    queueSection.append(emptyBox);
  }

  // Automation Queue Subsection (inside queueSection to preserve layout)
  const autoBox = document.createElement('div');
  autoBox.className = 'mt-3 pt-3 border-t border-slate-100 dark:border-slate-800';

  const autoHeader = document.createElement('div');
  autoHeader.className = 'flex items-center justify-between gap-2 flex-wrap mb-2';
  const autoTitle = document.createElement('div');
  autoTitle.className = 'flex items-center gap-2';
  const queuedCount = currentResearchQueue.items?.length || 0;
  autoTitle.innerHTML = `<span class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><span>⚡</span> Auto-Research Queue</span><span class="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">${queuedCount} queued</span>`;
  autoHeader.append(autoTitle);

  const autoControls = document.createElement('div');
  autoControls.className = 'flex items-center gap-2';

  const autoToggleLabel = document.createElement('label');
  autoToggleLabel.className = 'inline-flex items-center gap-1.5 text-2xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none';
  const autoToggleInput = document.createElement('input');
  autoToggleInput.type = 'checkbox';
  autoToggleInput.checked = currentResearchQueue.enabled !== false;
  autoToggleInput.className = 'rounded border-slate-300 text-purple-600 focus:ring-purple-400 h-3.5 w-3.5';
  autoToggleInput.addEventListener('change', (e) => {
    currentResearchQueue.enabled = e.target.checked;
    saveResearchQueue();
  });
  const autoText = document.createElement('span');
  autoText.textContent = 'Auto-advance';
  autoToggleLabel.append(autoToggleInput, autoText);
  autoControls.append(autoToggleLabel);

  if (queuedCount > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'text-2xs text-rose-500 hover:text-rose-600 dark:text-rose-400 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (globalThis.hwaHelperResearchQueue?.clearQueue) {
        currentResearchQueue = globalThis.hwaHelperResearchQueue.clearQueue(currentResearchQueue);
      } else {
        currentResearchQueue.items = [];
      }
      saveResearchQueue();
      renderResearchDialog(cache);
    });
    autoControls.append(clearBtn);
  }
  autoHeader.append(autoControls);
  autoBox.append(autoHeader);

  const queueTimeline = globalThis.hwaHelperResearchQueue?.calculateQueueTimeline
    ? globalThis.hwaHelperResearchQueue.calculateQueueTimeline(rawQueues, currentResearchQueue.items, now)
    : { items: currentResearchQueue.items || [], totalDurationMs: 0, allDoneAt: now };

  if (queueTimeline.items && queueTimeline.items.length > 0) {
    const autoList = document.createElement('div');
    autoList.className = 'space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5';

    queueTimeline.items.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs dark:border-slate-700/60 dark:bg-slate-800/60';
      const name = getResearchName(item.researchId);
      const estStart = item.estStart ? new Date(item.estStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const estFinish = item.estFinish ? new Date(item.estFinish).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      const left = document.createElement('div');
      left.className = 'min-w-0 flex items-center gap-2 flex-1';
      left.innerHTML = `
        <span class="inline-flex items-center justify-center size-5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 text-2xs font-bold shrink-0">#${idx + 1}</span>
        <div class="min-w-0">
          <div class="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
            <span>${name}</span>
            ${requiresSpecialResource(item.researchId, item.nextLevel) ? '<span class="special-resource-icon text-xs select-none cursor-help" title="Requires Honor Marks" aria-label="Requires Honor Marks">🎖️</span>' : ''}
            <span class="text-2xs font-normal text-slate-400">(ID: ${item.researchId})</span>
          </div>
          <div class="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-purple-600 dark:text-purple-400">Lv. ${item.currentLevel ?? '?'} ➔ ${item.nextLevel}</span>
            <span>·</span>
            <span>⏱ ${formatRemainingHms(item.durationMs || 1000)}</span>
            ${estFinish ? `<span>·</span><span>Est: ${estStart} ➔ ${estFinish}</span>` : ''}
          </div>
        </div>
      `;
      row.append(left);

      const right = document.createElement('div');
      right.className = 'flex items-center gap-1 shrink-0';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.title = 'Move up';
      upBtn.disabled = idx === 0;
      upBtn.className = idx === 0
        ? 'size-6 rounded flex items-center justify-center text-2xs text-slate-300 dark:text-slate-600 cursor-not-allowed'
        : 'size-6 rounded flex items-center justify-center text-2xs text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer';
      upBtn.innerHTML = '▲';
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (idx > 0) {
          if (globalThis.hwaHelperResearchQueue?.reorderQueue) {
            currentResearchQueue = globalThis.hwaHelperResearchQueue.reorderQueue(currentResearchQueue, idx, idx - 1);
          } else {
            const removed = currentResearchQueue.items.splice(idx, 1)[0];
            currentResearchQueue.items.splice(idx - 1, 0, removed);
          }
          saveResearchQueue();
          renderResearchDialog(cache);
        }
      });
      right.append(upBtn);

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.title = 'Move down';
      downBtn.disabled = idx === queueTimeline.items.length - 1;
      downBtn.className = idx === queueTimeline.items.length - 1
        ? 'size-6 rounded flex items-center justify-center text-2xs text-slate-300 dark:text-slate-600 cursor-not-allowed'
        : 'size-6 rounded flex items-center justify-center text-2xs text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer';
      downBtn.innerHTML = '▼';
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (idx < currentResearchQueue.items.length - 1) {
          if (globalThis.hwaHelperResearchQueue?.reorderQueue) {
            currentResearchQueue = globalThis.hwaHelperResearchQueue.reorderQueue(currentResearchQueue, idx, idx + 1);
          } else {
            const removed = currentResearchQueue.items.splice(idx, 1)[0];
            currentResearchQueue.items.splice(idx + 1, 0, removed);
          }
          saveResearchQueue();
          renderResearchDialog(cache);
        }
      });
      right.append(downBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = 'Remove from queue';
      removeBtn.className = 'size-6 rounded flex items-center justify-center text-2xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (globalThis.hwaHelperResearchQueue?.removeFromQueue) {
          currentResearchQueue = globalThis.hwaHelperResearchQueue.removeFromQueue(currentResearchQueue, idx);
        } else {
          currentResearchQueue.items.splice(idx, 1);
        }
        saveResearchQueue();
        renderResearchDialog(cache);
      });
      right.append(removeBtn);

      row.append(right);
      autoList.append(row);
    });

    autoBox.append(autoList);

    const autoFooter = document.createElement('div');
    autoFooter.className = 'mt-2 text-2xs text-slate-400 dark:text-slate-500 flex justify-between items-center';
    const allDoneStr = queueTimeline.allDoneAt ? new Date(queueTimeline.allDoneAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    autoFooter.innerHTML = `<span>Total time: <span class="font-semibold text-slate-600 dark:text-slate-300">${formatRemainingHms(queueTimeline.totalDurationMs)}</span></span><span>Completion: <span class="font-semibold text-slate-600 dark:text-slate-300">${allDoneStr}</span></span>`;
    autoBox.append(autoFooter);
  } else {
    const queueEmptyP = document.createElement('p');
    queueEmptyP.className = 'text-2xs text-slate-400 italic py-1';
    queueEmptyP.textContent = 'Queue is empty. Click "+ Queue" on candidates below to automate next research.';
    autoBox.append(queueEmptyP);
  }

  queueSection.append(autoBox);
  host.append(queueSection);

  // Extract completed researches
  const rawCompleted = cache?.researchStatus?.data?.completedResearches || [];
  const researchMap = new Map();
  for (const r of rawCompleted) {
    const rId = Number(r.researchId ?? r.id);
    if (Number.isFinite(rId)) {
      researchMap.set(rId, {
        id: rId,
        level: r.level ?? 1,
        isCompleted: true,
        isResearching: false,
        nextLevel: (r.level ?? 1) + 1
      });
    }
  }

  // Flag active research
  for (const q of activeQueues) {
    const rId = Number(q.researchId);
    if (researchMap.has(rId)) {
      const item = researchMap.get(rId);
      item.isResearching = true;
      item.nextLevel = q.level ?? (item.level + 1);
    } else {
      researchMap.set(rId, {
        id: rId,
        level: (q.level ? q.level - 1 : 0),
        isCompleted: false,
        isResearching: true,
        nextLevel: q.level ?? 1
      });
    }
  }

  // Also include known dictionary
  const allDict = globalThis.hwaHelperNameData?.names?.research || {};
  for (const key of Object.keys(allDict)) {
    const rId = Number(key);
    if (!researchMap.has(rId)) {
      researchMap.set(rId, {
        id: rId,
        level: 0,
        isCompleted: false,
        isResearching: false,
        nextLevel: 1
      });
    }
  }
  const rDataDict = globalThis.hwaHelperResearchData?.data || {};
  for (const key of Object.keys(rDataDict)) {
    const rId = Number(key);
    if (!researchMap.has(rId)) {
      researchMap.set(rId, {
        id: rId,
        level: 0,
        isCompleted: false,
        isResearching: false,
        nextLevel: 1
      });
    }
  }

  const allResearches = Array.from(researchMap.values());
  const completedList = allResearches.filter((r) => r.isCompleted);
  const rawBuildings = cache?.buildingStatus?.data?.buildings || [];
  const researchCenter = rawBuildings.find((b) => b.buildingId === 43 || b.buildingId === 165);
  const researchCenterLevel = Number.isFinite(researchCenter?.level) ? researchCenter.level : Infinity;

  // Calculate simulated levels including active queue and queued automation items
  const simulatedLevels = globalThis.hwaHelperResearchQueue?.getSimulatedLevels
    ? globalThis.hwaHelperResearchQueue.getSimulatedLevels(researchMap, rawQueues, currentResearchQueue.items)
    : (() => {
        const sim = new Map();
        for (const [id, r] of researchMap.entries()) sim.set(id, r.level);
        for (const q of rawQueues) {
          if (Number.isFinite(q.researchId) && Number.isFinite(q.level)) {
            sim.set(Number(q.researchId), Math.max(sim.get(Number(q.researchId)) || 0, q.level));
          }
        }
        for (const item of currentResearchQueue?.items || []) {
          if (Number.isFinite(item.researchId) && Number.isFinite(item.nextLevel)) {
            sim.set(Number(item.researchId), Math.max(sim.get(Number(item.researchId)) || 0, item.nextLevel));
          }
        }
        return sim;
      })();

  const researchDataHelper = globalThis.hwaHelperResearchData;
  const resourcesMap = new Map([
    [1, cache['resource:material:1']?.data?.amount ?? 0],
    [2, cache['resource:material:2']?.data?.amount ?? 0],
    [3, cache['resource:material:3']?.data?.amount ?? 0],
    [4, cache['resource:material:4']?.data?.amount ?? 0],
    [5, cache['resource:material:5']?.data?.amount ?? 0],
    [12, cache['resource:material:12']?.data?.amount ?? 0]
  ]);
  const hasMaterialTracking = Object.keys(cache || {}).some((k) => k.startsWith('resource:material:'));

  const nextAvailable = allResearches
    .map((r) => {
      const curLvl = simulatedLevels.get(r.id) ?? (r.isCompleted ? r.level : 0);
      const nextLvl = (curLvl > 0 || r.isCompleted) ? (curLvl + 1) : 1;
      const durationMs = researchDataHelper?.calculateEffectiveDurationMs
        ? researchDataHelper.calculateEffectiveDurationMs(r.id, nextLvl)
        : 60000;
      const maxLvl = researchDataHelper?.getMaxLevel ? researchDataHelper.getMaxLevel(r.id) : 0;
      return {
        ...r,
        currentLevel: curLvl,
        nextLevel: nextLvl,
        maxLevel: maxLvl,
        durationMs: durationMs || 60000
      };
    })
    .filter((r) => {
      if (r.isResearching) return false;
      if (researchDataHelper?.getMaxLevel) {
        const maxLevel = researchDataHelper.getMaxLevel(r.id);
        if (maxLevel > 0) {
          if (r.nextLevel > maxLevel) return false;
          if (!researchDataHelper.isAvailable(r.id, r.nextLevel, simulatedLevels, researchCenterLevel)) {
            return false;
          }
          return true;
        }
      }
      return (r.currentLevel > 0 || r.isCompleted) && r.nextLevel <= researchCenterLevel;
    })
    .sort((a, b) => (b.currentLevel - a.currentLevel) || (a.id - b.id));

  // Section 2: Next Available Research
  const nextSection = document.createElement('section');
  nextSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  const nextTitle = document.createElement('h3');
  nextTitle.className = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between';
  const nextTitleText = document.createElement('span');
  nextTitleText.className = 'flex items-center gap-2';
  nextTitleText.innerHTML = '<span>⚡</span> Next Research Candidates';
  const nextBadge = document.createElement('span');
  nextBadge.id = 'next-research-count-badge';
  nextBadge.className = 'text-2xs font-normal text-slate-400';
  nextBadge.textContent = `${nextAvailable.length} available`;
  nextTitle.append(nextTitleText, nextBadge);
  nextSection.append(nextTitle);

  const nextIntro = document.createElement('div');
  nextIntro.className = 'mb-3 flex flex-col gap-2.5';
  const desc = document.createElement('p');
  desc.className = 'text-xs text-slate-500 dark:text-slate-400';
  desc.textContent = activeQueues.length > 0
    ? 'Academy queue is currently occupied. Once complete, the following technologies can be researched or upgraded next:'
    : 'Academy queue is available. The following technologies can be researched or upgraded next:';
  nextIntro.append(desc);

  const nextControls = document.createElement('div');
  nextControls.className = 'flex items-center gap-2 flex-wrap pt-0.5';

  const nextSearchWrap = document.createElement('div');
  nextSearchWrap.className = 'flex-1 min-w-[140px]';
  const nextSearchInput = document.createElement('input');
  nextSearchInput.type = 'search';
  nextSearchInput.id = 'next-research-search-input';
  nextSearchInput.placeholder = 'Filter research or ID...';
  nextSearchInput.value = nextResearchFilterQuery;
  nextSearchInput.className = 'h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500';
  nextSearchWrap.append(nextSearchInput);
  nextControls.append(nextSearchWrap);

  const nextSortWrap = document.createElement('div');
  nextSortWrap.className = 'shrink-0 flex items-center gap-1.5';
  const sortLabel = document.createElement('span');
  sortLabel.className = 'text-2xs text-slate-400';
  sortLabel.textContent = 'Sort:';
  nextSortWrap.append(sortLabel);

  const nextSortSelect = document.createElement('select');
  nextSortSelect.id = 'next-research-sort-select';
  nextSortSelect.className = 'h-7 rounded-md border border-slate-300 bg-white px-2 text-2xs text-slate-700 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

  const sortOptions = [
    { value: 'level-desc', label: 'Level: High → Low' },
    { value: 'level-asc', label: 'Level: Low → High' },
    { value: 'time-asc', label: 'Research Time: Shortest → Longest' },
    { value: 'time-desc', label: 'Research Time: Longest → Shortest' },
    { value: 'name-asc', label: 'Name: A → Z' }
  ];
  for (const opt of sortOptions) {
    const optEl = document.createElement('option');
    optEl.value = opt.value;
    optEl.textContent = opt.label;
    if (opt.value === nextResearchSortOrder) optEl.selected = true;
    nextSortSelect.append(optEl);
  }
  nextSortSelect.value = nextResearchSortOrder;
  nextSortWrap.append(nextSortSelect);
  nextControls.append(nextSortWrap);
  nextIntro.append(nextControls);
  nextSection.append(nextIntro);

  const nextGrid = document.createElement('div');
  nextGrid.id = 'next-research-grid';
  nextGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1';

  function renderNextResearchCards() {
    nextGrid.replaceChildren();
    const query = nextResearchFilterQuery.toLowerCase().trim();
    const filtered = nextAvailable
      .filter((r) => {
        if (!query) return true;
        const name = getResearchName(r.id).toLowerCase();
        const idStr = String(r.id);
        return name.includes(query) || idStr.includes(query);
      })
      .sort((a, b) => {
        if (nextResearchSortOrder === 'time-asc') {
          return (a.durationMs - b.durationMs) || (b.currentLevel - a.currentLevel) || (a.id - b.id);
        }
        if (nextResearchSortOrder === 'time-desc') {
          return (b.durationMs - a.durationMs) || (b.currentLevel - a.currentLevel) || (a.id - b.id);
        }
        if (nextResearchSortOrder === 'level-asc') {
          return (a.currentLevel - b.currentLevel) || (a.id - b.id);
        }
        if (nextResearchSortOrder === 'name-asc') {
          const nameA = getResearchName(a.id);
          const nameB = getResearchName(b.id);
          return nameA.localeCompare(nameB) || (a.id - b.id);
        }
        return (b.currentLevel - a.currentLevel) || (a.id - b.id);
      });

    const badge = nextSection.querySelector('#next-research-count-badge');
    if (badge) {
      badge.textContent = query
        ? `${filtered.length} / ${nextAvailable.length} available`
        : `${nextAvailable.length} available`;
    }

    if (filtered.length > 0) {
      for (const r of filtered) {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200/90 bg-white p-3 space-y-2 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between';
        const name = getResearchName(r.id);
        const durationMs = r.durationMs || 60000;
        const estFinishDate = new Date(now + durationMs);

        // Top row: ID pill + full research name (1 line truncate) + Level badge
        const topRow = document.createElement('div');
        topRow.className = 'flex items-center justify-between gap-2 min-w-0';

        const nameGroup = document.createElement('div');
        nameGroup.className = 'flex items-center gap-1.5 min-w-0 flex-1';

        const idPill = document.createElement('span');
        idPill.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0';
        idPill.textContent = `#${r.id}`;

        const nameText = document.createElement('span');
        nameText.className = 'font-bold text-slate-900 dark:text-slate-100 truncate text-xs sm:text-sm';
        nameText.textContent = name;
        nameText.title = name;

        nameGroup.append(idPill, nameText);

        if (requiresSpecialResource(r.id, r.nextLevel)) {
          const medalIcon = document.createElement('span');
          medalIcon.className = 'special-resource-icon inline-flex items-center text-xs shrink-0 cursor-help select-none';
          medalIcon.title = 'Requires Honor Marks / Special Material';
          if (typeof medalIcon.setAttribute === 'function') {
            medalIcon.setAttribute('aria-label', 'Requires Honor Marks');
          }
          medalIcon.textContent = '🎖️';
          nameGroup.append(medalIcon);
        }

        const levelBadge = document.createElement('span');
        levelBadge.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 shrink-0';
        levelBadge.textContent = r.currentLevel > 0
          ? `Lv. ${r.currentLevel} ➔ ${r.nextLevel}${r.maxLevel ? ` / ${r.maxLevel}` : ''}`
          : `Research Lv. 1${r.maxLevel ? ` / ${r.maxLevel}` : ''}`;

        topRow.append(nameGroup, levelBadge);
        card.append(topRow);

        // Bottom row
        const bottomRow = document.createElement('div');
        bottomRow.className = 'flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/50';

        const timeInfo = document.createElement('div');
        timeInfo.className = 'flex items-center gap-1.5 text-2xs text-slate-500 dark:text-slate-400 min-w-0';
        timeInfo.innerHTML = `
          <span class="inline-flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300" title="Research Duration">
            <span>⏱</span><span>${formatRemainingHms(durationMs)}</span>
          </span>
          <span class="text-slate-300 dark:text-slate-600">·</span>
          <span class="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500" title="Estimated Finish Time">
            <span>🏁</span><span>${estFinishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        `;
        bottomRow.append(timeInfo);

        const actionGroup = document.createElement('div');
        actionGroup.className = 'flex items-center gap-1.5 shrink-0';

        const queueBtn = document.createElement('button');
        queueBtn.type = 'button';
        queueBtn.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700/80 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600';
        queueBtn.innerHTML = '<span>➕</span><span>Queue</span>';
        queueBtn.title = `Add ${name} Lv. ${r.nextLevel} to auto-research queue`;
        queueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (globalThis.hwaHelperResearchQueue?.addToQueue) {
            currentResearchQueue = globalThis.hwaHelperResearchQueue.addToQueue(currentResearchQueue, {
              researchId: r.id,
              currentLevel: r.currentLevel,
              nextLevel: r.nextLevel,
              durationMs
            });
          } else {
            currentResearchQueue.items = currentResearchQueue.items || [];
            currentResearchQueue.items.push({
              researchId: r.id,
              currentLevel: r.currentLevel,
              nextLevel: r.nextLevel,
              durationMs
            });
          }
          saveResearchQueue();
          renderResearchDialog(cache);
        });
        actionGroup.append(queueBtn);

        const missingCosts = (hasMaterialTracking && researchDataHelper?.getMissingCosts)
          ? researchDataHelper.getMissingCosts(r.id, r.nextLevel, resourcesMap)
          : [];
        const hasEnoughResources = missingCosts.length === 0;

        const isQueueBusy = activeQueues.length > 0;
        const isRpcReady = typeof popupRpcEnabled === 'undefined' || popupRpcEnabled !== false;
        const canResearch = !isQueueBusy && isRpcReady && hasEnoughResources;

        if (canResearch) {
          const researchBtn = document.createElement('button');
          researchBtn.type = 'button';
          researchBtn.disabled = false;
          researchBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-xs cursor-pointer transition-colors';
          researchBtn.title = `Research ${name} to Lv. ${r.nextLevel}`;
          researchBtn.innerHTML = '<span>🔬</span><span>Research</span>';
          researchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (researchBtn.disabled) return;
            researchBtn.disabled = true;
            researchBtn.textContent = 'Starting...';
            const calls = [];
            for (const f of finishedQueues) {
              calls.push({
                name: 'completeResearch',
                feature: 'personalResearch',
                args: {
                  researchId: f.researchId,
                  level: f.level,
                  queueNumber: f.queueNumber || 0
                }
              });
            }
            calls.push({
              name: 'startResearch',
              feature: 'personalResearch',
              args: {
                researchId: r.id,
                nextLevel: r.nextLevel,
                level: r.nextLevel,
                startDate: Date.now(),
                durationMs,
                queueNumber: 0
              }
            });
            calls.push({ name: 'getSummary', feature: 'personalResearch', args: {} });
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, () => {
                setTimeout(() => {
                  if (typeof renderResearchDialog === 'function' && typeof currentCache !== 'undefined') {
                    renderResearchDialog(currentCache);
                  }
                }, 800);
              });
            }
          });
          actionGroup.append(researchBtn);
        }

        bottomRow.append(actionGroup);
        card.append(bottomRow);
        nextGrid.append(card);
      }
    } else {
      const emptyP = document.createElement('p');
      emptyP.className = 'text-xs text-slate-400 italic py-2 col-span-full';
      emptyP.textContent = query ? 'No matching research found.' : 'No research candidates found.';
      nextGrid.append(emptyP);
    }
  }

  nextSearchInput.addEventListener('input', (e) => {
    nextResearchFilterQuery = e.target.value;
    renderNextResearchCards();
  });
  nextSortSelect.addEventListener('change', (e) => {
    nextResearchSortOrder = e.target.value;
    renderNextResearchCards();
  });

  renderNextResearchCards();
  nextSection.append(nextGrid);
  host.append(nextSection);

  // Section 3: Personal Research Directory
  const dirSection = document.createElement('section');
  dirSection.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  const dirHeader = document.createElement('div');
  dirHeader.className = 'flex items-center justify-between gap-3 flex-wrap mb-3';
  dirHeader.innerHTML = `
    <div>
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <span>📚</span> Personal Research Directory
      </h3>
      <p id="research-count-subtitle" class="text-2xs text-slate-400 dark:text-slate-500 mt-0.5">${completedList.length} completed technologies</p>
    </div>
  `;

  const searchWrap = document.createElement('div');
  searchWrap.className = 'w-full sm:w-64';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'research-search-input';
  searchInput.placeholder = 'Search technologies or ID...';
  searchInput.value = researchSearchQuery;
  searchInput.className = 'h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500';

  searchWrap.append(searchInput);
  dirHeader.append(searchWrap);
  dirSection.append(dirHeader);

  // Filter tabs: All, Completed, In Progress, Available
  const tabsWrap = document.createElement('div');
  tabsWrap.id = 'research-filter-tabs';
  tabsWrap.className = 'flex items-center gap-1.5 flex-wrap mb-3';

  function renderTabs() {
    tabsWrap.replaceChildren();
    const availableCount = allResearches.filter((r) => !r.isCompleted && !r.isResearching).length;
    const tabs = [
      { id: 'all', label: 'All', count: allResearches.length },
      { id: 'completed', label: 'Completed', count: completedList.length },
      { id: 'in_progress', label: 'In Progress', count: activeQueues.length },
      { id: 'available', label: 'Available', count: availableCount }
    ];
    for (const tab of tabs) {
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      const isActive = researchFilterTab === tab.id;
      tabBtn.className = `cursor-pointer rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
        isActive
          ? 'bg-purple-600 text-white shadow-2xs'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
      }`;
      tabBtn.textContent = `${tab.label} (${tab.count})`;
      tabBtn.addEventListener('click', () => {
        researchFilterTab = tab.id;
        renderTabs();
        updateResearchGrid();
      });
      tabsWrap.append(tabBtn);
    }
  }
  renderTabs();
  dirSection.append(tabsWrap);

  const dirGrid = document.createElement('div');
  dirGrid.id = 'research-grid-list';
  dirGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1';

  function updateResearchGrid() {
    dirGrid.replaceChildren();
    const query = researchSearchQuery.toLowerCase();
    const filtered = allResearches
      .filter((r) => {
        if (researchFilterTab === 'completed' && !r.isCompleted) return false;
        if (researchFilterTab === 'in_progress' && !r.isResearching) return false;
        if (researchFilterTab === 'available' && (r.isCompleted || r.isResearching)) return false;
        if (!query) {
          if (researchFilterTab === 'all') return r.isCompleted || r.isResearching;
          return true;
        }
        const name = getResearchName(r.id).toLowerCase();
        const idStr = String(r.id);
        return name.includes(query) || idStr.includes(query);
      })
      .sort((a, b) => {
        if (a.isResearching !== b.isResearching) return a.isResearching ? -1 : 1;
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1;
        return (b.level - a.level) || (a.id - b.id);
      });

    const sub = dirSection.querySelector('#research-count-subtitle');
    if (sub) {
      sub.textContent = query
        ? `${filtered.length} matching "${query}" (${completedList.length} completed)`
        : `${completedList.length} completed technologies`;
    }

    if (filtered.length > 0) {
      for (const r of filtered) {
        const card = document.createElement('div');
        card.className = `flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
          r.isResearching
            ? 'border-purple-300 bg-purple-50/70 dark:border-purple-800 dark:bg-purple-950/30'
            : r.isCompleted
              ? 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
              : 'border-dashed border-slate-200 bg-slate-50/40 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40'
        }`;
        const name = getResearchName(r.id);
        const statusBadge = r.isResearching
          ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"><span class="size-1 rounded-full bg-purple-500 animate-pulse"></span>Researching</span>'
          : r.isCompleted
            ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Completed</span>'
            : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Available</span>';

        card.innerHTML = `
          <div class="min-w-0">
            <div class="font-semibold ${r.isCompleted || r.isResearching ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'} truncate" title="${name}">${name}</div>
            <div class="text-2xs text-slate-400 dark:text-slate-500">ID: ${r.id}</div>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <div class="font-bold text-xs ${r.isCompleted ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}">
              ${r.isCompleted ? `Lv. ${r.level}` : (r.isResearching ? `Lv. ${r.nextLevel}` : '—')}
            </div>
            <div>${statusBadge}</div>
          </div>
        `;
        dirGrid.append(card);
      }
    } else {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'col-span-full py-8 text-center text-xs text-slate-400';
      emptyBox.textContent = query
        ? `No technologies matching "${query}"`
        : 'No technologies found for this filter.';
      dirGrid.append(emptyBox);
    }
  }

  searchInput.addEventListener('input', (e) => {
    researchSearchQuery = e.target.value.trim();
    updateResearchGrid();
  });

  updateResearchGrid();
  dirSection.append(dirGrid);
  host.append(dirSection);
}

let currentQuestFilter = 'all';
let questSearchQuery = '';

function getDetailedQuests(cache = currentCache, now = Date.now()) {
  const questData = globalThis.hwaHelperQuestData;
  const items = [];
  const seenIds = new Set();
  const nextResetTime = questData?.nextReset(cache, now);
  const resetText = nextResetTime ? `Resets ${new Date(nextResetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Daily reset';

  const qAll = Array.isArray(cache?.questGetAll?.data) ? cache.questGetAll.data :
    (Array.isArray(cache?.questGetAll) ? cache.questGetAll : []);
  const qAllMap = new Map();
  for (const q of qAll) {
    if (q && q.id != null) qAllMap.set(String(q.id), q);
  }

  // 1. Daily Quests
  const dailyList = questData?.dailyQuests(cache, now) || [];
  for (const dq of dailyList) {
    if (!dq || dq.id == null) continue;
    const qIdStr = String(dq.id);
    seenIds.add(qIdStr);
    const qAllEntry = qAllMap.get(qIdStr);
    
    const isReady = qAllEntry?.state === 2 || dq.state === 2;
    const isDone = dq.state === 'completed' || dq.state === 3 || qAllEntry?.state === 3;
    const state = isReady ? 'ready' : isDone ? 'done' : 'inProgress';
    
    const title = questData?.dailyTitle(dq) || qAllEntry?.name || `Daily Quest #${dq.id}`;
    const reward = qAllEntry?.reward || dq.reward || null;
    const progress = Number(qAllEntry?.progress ?? dq.progress) || 0;
    
    items.push({
      id: dq.id,
      category: 'daily',
      categoryLabel: 'Daily Quest',
      title,
      state,
      progress,
      reward,
      subtitle: resetText
    });
  }

  // 2. Visible Event Quests
  const events = questData?.visibleEvents(cache, now) || [];
  for (const ev of events) {
    const evTitle = questData?.title(ev) || `Event #${ev.id}`;
    const evEndText = ev.end ? `Ends ${new Date(ev.end).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : '';
    
    for (const group of ev.groups || []) {
      const groupQuests = Array.isArray(group.quests) ? group.quests : [];
      if (groupQuests.length === 0) continue;

      const activeQ = groupQuests.find((q) => q.state === 'inProgress' || q.state === 2);
      const completedCount = groupQuests.filter((q) => q.state === 'completed' || q.state === 3).length;
      const currentQ = activeQ || groupQuests[groupQuests.length - 1];

      const qIdStr = String(currentQ.id);
      seenIds.add(qIdStr);
      const qAllEntry = qAllMap.get(qIdStr);

      const isReady = currentQ.state === 2 || qAllEntry?.state === 2;
      const isDone = !activeQ && completedCount === groupQuests.length;
      const state = isReady ? 'ready' : isDone ? 'done' : 'inProgress';

      const repeatLabel = group.repeatType === 'daily' ? 'Event Daily' : 'Event Chain';
      const questLocMap = globalThis.hwaHelperPopupData?.questLocaleMap || {};
      const groupTitle = questData?.groupTitle ? questData.groupTitle(group.localeKey) : (group.localeKey
        ? (questLocMap[group.localeKey]?.title ||
           group.localeKey.replace(/^(LIB_SPECIAL_QUEST_EVENT_|LIB_SEASONAL_EVENT_NAME_|QUEST_TAB_|UI_)/, '')
                          .replace(/_/g, ' ')
                          .toLowerCase()
                          .replace(/\b\w/g, (c) => c.toUpperCase()))
        : 'Special Quest');

      const tierText = `Tier ${completedCount + (activeQ ? 1 : 0)} of ${groupQuests.length}`;
      const progress = Number(currentQ.progress ?? qAllEntry?.progress) || 0;
      const reward = currentQ.reward || qAllEntry?.reward || null;

      items.push({
        id: currentQ.id,
        category: 'event',
        categoryLabel: repeatLabel,
        eventName: evTitle,
        title: groupTitle,
        tierInfo: tierText,
        state,
        progress,
        reward,
        subtitle: `${evTitle}${evEndText ? ' · ' + evEndText : ''}`
      });
    }
  }

  // 3. Any additional ready/active quests in questGetAll
  for (const q of qAll) {
    if (!q || q.id == null || seenIds.has(String(q.id))) continue;
    if (q.state === 3) continue; // completed & claimed in past
    const isReady = q.state === 2;
    const recognizedDaily = questData?.dailyTitles?.[q.id];
    const recognizedTemplate = questData?.questTemplateTitle?.(q.id);
    const hasKnownName = Boolean(q.name || recognizedDaily || recognizedTemplate);

    // Filter out unmapped internal tracking counters (state === 1 with no UI presence)
    if (!isReady && !hasKnownName) continue;

    const title = q.name || recognizedDaily || recognizedTemplate || (isReady ? `Claimable Reward #${q.id}` : `Quest #${q.id}`);
    const category = recognizedDaily || recognizedTemplate ? 'daily' : 'story';
    const categoryLabel = isReady ? 'Claimable Reward' : (recognizedDaily || recognizedTemplate ? 'Daily Quest' : 'Quest');

    items.push({
      id: q.id,
      category,
      categoryLabel,
      title,
      state: isReady ? 'ready' : 'inProgress',
      progress: Number(q.progress) || 0,
      reward: q.reward || null,
      subtitle: isReady ? '🎁 Reward ready to claim in game' : (recognizedDaily || recognizedTemplate ? 'Daily Task' : 'General Quest')
    });
  }

  return items;
}

  function openQuestDetailDialog(targetType = 'all', cache = currentCache) {
  if (targetType === 'daily-quests') {
    currentQuestFilter = 'daily';
  } else if (targetType === 'event-daily-quests') {
    currentQuestFilter = 'event';
  } else if (targetType === 'ready') {
    currentQuestFilter = 'ready';
  } else if (targetType === 'daily' || targetType === 'event') {
    currentQuestFilter = targetType;
  } else {
    currentQuestFilter = 'all';
  }
  globalThis.currentQuestFilter = currentQuestFilter;

  renderQuestDetailDialog(currentQuestFilter, cache);
  const dialog = document.querySelector('#quest-detail-dialog');
  if (dialog) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
}

function renderQuestDetailDialog(filter = currentQuestFilter, cache = currentCache) {
  const host = document.querySelector('#quest-detail-dialog-body');
  const statusWrap = document.querySelector('#quest-detail-dialog-status');
  if (!host) return;
  host.replaceChildren();
  statusWrap?.replaceChildren();

  const allItems = getDetailedQuests(cache);
  const readyCount = allItems.filter((i) => i.state === 'ready').length;
  const inProgressCount = allItems.filter((i) => i.state === 'inProgress').length;
  const dailyCount = allItems.filter((i) => i.category === 'daily').length;
  const eventCount = allItems.filter((i) => i.category === 'event').length;

  if (statusWrap) {
    if (readyCount > 0) {
      const readyBadge = document.createElement('span');
      readyBadge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50';
      readyBadge.textContent = `🎁 ${readyCount} Ready to Claim`;
      statusWrap.append(readyBadge);
    }
    const countBadge = document.createElement('span');
    countBadge.className = 'text-xs text-slate-500 dark:text-slate-400 font-medium truncate';
    countBadge.textContent = `${inProgressCount} in progress · ${allItems.length} total`;
    statusWrap.append(countBadge);
  }

  // Header toolbar: Tabs & Search
  const toolbar = document.createElement('div');
  toolbar.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200 dark:border-slate-800';

  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'flex flex-wrap items-center gap-1.5';

  const filterTabs = [
    { key: 'all', label: 'All', count: allItems.length },
    { key: 'daily', label: 'Daily', count: dailyCount },
    { key: 'event', label: 'Event', count: eventCount },
    { key: 'ready', label: 'Ready', count: readyCount }
  ];

  for (const tab of filterTabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = filter === tab.key;
    btn.className = `cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
      isActive
        ? 'bg-violet-600 text-white dark:bg-violet-600 shadow-xs'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
    }`;
    btn.textContent = `${tab.label} (${tab.count})`;
    btn.addEventListener('click', () => {
      currentQuestFilter = tab.key;
      globalThis.currentQuestFilter = currentQuestFilter;
      renderQuestDetailDialog(tab.key, cache);
    });
    tabsWrap.append(btn);
  }

  const searchInput = document.createElement('input');
  searchInput.id = 'quest-detail-search';
  searchInput.type = 'text';
  searchInput.value = questSearchQuery;
  searchInput.placeholder = 'Search quests...';
  searchInput.className = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 w-full sm:w-44';
  searchInput.addEventListener('input', (e) => {
    questSearchQuery = e.target.value.trim().toLowerCase();
    updateQuestCardsList();
  });

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'flex items-center gap-1.5 flex-wrap';

  const refreshBtn = document.createElement('button');
  refreshBtn.id = 'quest-detail-refresh';
  refreshBtn.type = 'button';
  refreshBtn.title = 'Refresh quests from game server (RPC)';
  refreshBtn.className = 'cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0';
  refreshBtn.innerHTML = '<span>🔄</span> <span>Refresh</span>';
  refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span>⏳</span> <span>Updating...</span>';
    chrome.runtime?.sendMessage?.({
      kind: 'refresh-rpc',
      calls: [
        { name: 'getDailyQuests', feature: 'quest', args: {} },
        { name: 'getSpecialQuestState' },
        { name: 'questGetAll' },
        { name: 'questGetEvents' }
      ]
    }, () => {
      setTimeout(() => {
        renderQuestDetailDialog(currentQuestFilter, currentCache);
      }, 500);
    });
  });

  const exportBtn = document.createElement('button');
  exportBtn.id = 'quest-detail-export';
  exportBtn.type = 'button';
  exportBtn.title = 'Export quest definitions JSON file';
  exportBtn.className = 'cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0';
  exportBtn.innerHTML = '<span>📥</span> <span>Export JSON</span>';
  exportBtn.addEventListener('click', () => {
    try {
      const json = globalThis.hwaHelperQuestData?.exportCatalogJson?.() || '{}';
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quest-catalog.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {}
  });

  actionsWrap.append(searchInput, refreshBtn, exportBtn);
  toolbar.append(tabsWrap, actionsWrap);
  host.append(toolbar);

  // Cards Container
  const cardsContainer = document.createElement('div');
  cardsContainer.id = 'quest-cards-container';
  host.append(cardsContainer);

  function updateQuestCardsList() {
    cardsContainer.replaceChildren();

    let list = allItems;
    if (filter === 'daily') list = list.filter((i) => i.category === 'daily');
    else if (filter === 'event') list = list.filter((i) => i.category === 'event');
    else if (filter === 'ready') list = list.filter((i) => i.state === 'ready');

    if (questSearchQuery) {
      list = list.filter((i) =>
        i.title.toLowerCase().includes(questSearchQuery) ||
        (i.eventName && i.eventName.toLowerCase().includes(questSearchQuery)) ||
        (i.categoryLabel && i.categoryLabel.toLowerCase().includes(questSearchQuery)) ||
        String(i.id).includes(questSearchQuery)
      );
    }

    const statePriority = { ready: 0, inProgress: 1, done: 2 };
    list.sort((a, b) => (statePriority[a.state] ?? 9) - (statePriority[b.state] ?? 9));

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500';
      empty.textContent = questSearchQuery ? 'No quests match your search query.' : 'No quests found for the selected filter.';
      cardsContainer.append(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-2.5';

    for (const item of list) {
      const card = document.createElement('div');
      card.className = `flex flex-col justify-between rounded-xl border p-3 shadow-2xs transition-all ${
        item.state === 'ready'
          ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/60 dark:bg-emerald-950/20'
          : item.state === 'inProgress'
          ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/80'
          : 'border-slate-200/60 bg-slate-50/50 opacity-70 dark:border-slate-800/50 dark:bg-slate-900/40'
      }`;

      // 1. Header: Category badge & subtitle & state badge
      const header = document.createElement('div');
      header.className = 'flex items-start justify-between gap-2';

      const left = document.createElement('div');
      left.className = 'min-w-0 flex-1';

      const metaRow = document.createElement('div');
      metaRow.className = 'flex items-center gap-1.5 flex-wrap';

      const catBadge = document.createElement('span');
      catBadge.className = `rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        item.category === 'daily'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800/50'
          : item.category === 'event'
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 dark:border dark:border-violet-800/50'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      }`;
      catBadge.textContent = item.categoryLabel;

      const subText = document.createElement('span');
      subText.className = 'text-[11px] text-slate-500 dark:text-slate-400 truncate';
      subText.textContent = item.subtitle;

      metaRow.append(catBadge, subText);

      const titleEl = document.createElement('h4');
      titleEl.className = 'mt-1 font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-snug';
      titleEl.textContent = item.title;

      left.append(metaRow, titleEl);

      const statusBadge = document.createElement('span');
      statusBadge.className = `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        item.state === 'ready'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50'
          : item.state === 'done'
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-700/50'
      }`;
      statusBadge.textContent = item.state === 'ready' ? 'Ready to Claim' : item.state === 'done' ? 'Completed' : 'In Progress';

      header.append(left, statusBadge);
      card.append(header);

      // 2. Middle: Progress / Tier
      if (item.tierInfo || item.progress > 0) {
        const progWrap = document.createElement('div');
        progWrap.className = 'mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/40 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 font-medium';
        if (item.tierInfo) {
          const tierEl = document.createElement('span');
          tierEl.textContent = item.tierInfo;
          progWrap.append(tierEl);
        }
        if (item.progress > 0) {
          const progEl = document.createElement('span');
          progEl.textContent = `Progress: ${item.progress.toLocaleString()}`;
          progWrap.append(progEl);
        }
        card.append(progWrap);
      }

      // 3. Rewards footer
      if (item.reward) {
        const rewardText = towerRewardText(item.reward);
        if (rewardText && rewardText !== '—') {
          const rewardRow = document.createElement('div');
          rewardRow.className = 'mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/40 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate';
          rewardRow.innerHTML = `<span class="shrink-0" aria-hidden="true">🎁</span><span class="truncate">${rewardText}</span>`;
          card.append(rewardRow);
        }
      }

      grid.append(card);
    }
    cardsContainer.append(grid);
  }

  updateQuestCardsList();
}

let currentHeroDialogId = null;

function renderHeroDialog(heroId, cache) {
  const host = document.querySelector('#hero-dialog-body');
  const titleEl = document.querySelector('#hero-dialog-title');
  const statusWrap = document.querySelector('#hero-dialog-status');
  if (!host) return;

  currentHeroDialogId = heroId;
  host.replaceChildren();
  statusWrap?.replaceChildren();

  const strId = String(heroId);
  const numId = Number(heroId);
  const heroesData = cache?.heroGetAll?.data || {};
  const hero = heroesData[strId] || heroesData[numId] || null;
  const meta = globalThis.hwaHelperHeroMetadata?.[strId] || globalThis.hwaHelperHeroMetadata?.[numId] || {};
  const heroName = meta.name || globalThis.hwaHelperNameMap?.hero?.(strId) || `Hero #${strId}`;

  if (titleEl) titleEl.textContent = heroName;

  // Title bar status / switcher
  if (statusWrap) {
    const idPill = document.createElement('span');
    idPill.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0';
    idPill.textContent = `#${strId}`;
    statusWrap.append(idPill);

    if (hero?.power) {
      const powerBadge = document.createElement('span');
      powerBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shrink-0';
      powerBadge.textContent = `⚔️ ${formatNumber(hero.power)}`;
      statusWrap.append(powerBadge);
    }

    // Hero Switcher Dropdown
    const heroEntries = Object.entries(heroesData);
    if (heroEntries.length > 1) {
      const switcher = document.createElement('select');
      switcher.id = 'hero-dialog-switcher';
      switcher.className = 'h-6 rounded border border-slate-300 bg-white px-1.5 text-2xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
      const sortedHeroes = heroEntries
        .map(([id, h]) => ({
          id,
          name: globalThis.hwaHelperHeroMetadata?.[id]?.name || globalThis.hwaHelperNameMap?.hero?.(id) || `Hero #${id}`,
          power: Number(h?.power) || 0
        }))
        .sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));

      for (const h of sortedHeroes) {
        const opt = document.createElement('option');
        opt.value = h.id;
        opt.textContent = `${h.name} (${formatNumber(h.power)})`;
        if (h.id === strId) opt.selected = true;
        switcher.append(opt);
      }
      switcher.addEventListener('change', (e) => {
        renderHeroDialog(e.target.value, cache);
      });
      statusWrap.append(switcher);
    }
  }

  if (!hero) {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400';
    emptyBox.innerHTML = '<span class="text-xl">⚠️</span><div><div class="font-semibold text-slate-700 dark:text-slate-300">Hero not found</div><div>This hero data has not been captured yet. Use "Refresh Heroes" to update snapshots.</div></div>';
    host.append(emptyBox);
    return;
  }

  const starCount = hero?.star || 1;
  const largeGlow = starGlowClass(starCount, true);
  const avatarPath = meta.avatarFile || (meta.hasAvatar ? `assets/heroes/${strId}.png` : null);
  const equipmentRank = globalThis.hwaHelperPopupData?.getHeroEquipmentRank?.(hero.color);
  const soulProgress = globalThis.hwaHelperPopupData?.heroSoulProgress?.(strId, hero, cache.inventoryGet?.data);

  // 1. Hero Overview Header Card
  const profileCard = document.createElement('div');
  profileCard.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80';
  
  const profileRow = document.createElement('div');
  profileRow.className = 'flex items-start gap-4 flex-wrap sm:flex-nowrap';

  // Avatar block
  const avatarBlock = document.createElement('div');
  avatarBlock.className = 'flex flex-col items-center gap-1.5 shrink-0';
  if (avatarPath) {
    const img = document.createElement('img');
    img.src = avatarPath;
    img.alt = heroName;
    img.className = `size-16 rounded-xl object-cover shrink-0 ${largeGlow}`;
    img.addEventListener('error', () => {
      img.replaceWith(createInitialsBadge(heroName, meta.faction, true, largeGlow));
    }, { once: true });
    avatarBlock.append(img);
  } else {
    avatarBlock.append(createInitialsBadge(heroName, meta.faction, true, largeGlow));
  }
  avatarBlock.append(starIcons(starCount));
  profileRow.append(avatarBlock);

  // Info details block
  const detailsBlock = document.createElement('div');
  detailsBlock.className = 'min-w-0 flex-1 space-y-2';

  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-center gap-2 flex-wrap';
  const nameEl = document.createElement('h3');
  nameEl.className = 'font-bold text-slate-900 dark:text-slate-100 text-base';
  nameEl.textContent = heroName;
  titleRow.append(nameEl);

  if (meta.role) {
    const roleBadge = document.createElement('span');
    roleBadge.className = 'px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    roleBadge.textContent = meta.role;
    titleRow.append(roleBadge);
  }
  if (meta.class) {
    const classBadge = document.createElement('span');
    classBadge.className = 'px-1.5 py-0.5 rounded text-2xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
    classBadge.textContent = meta.class;
    titleRow.append(classBadge);
  }
  if (meta.faction) {
    const factionBadge = document.createElement('span');
    factionBadge.className = 'px-1.5 py-0.5 rounded text-2xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300';
    factionBadge.textContent = meta.faction;
    titleRow.append(factionBadge);
  }
  detailsBlock.append(titleRow);

  // Key stats chips
  const chipsRow = document.createElement('div');
  chipsRow.className = 'flex items-center gap-2 flex-wrap text-xs';

  // Level
  const lvlChip = document.createElement('span');
  lvlChip.className = 'inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200';
  lvlChip.innerHTML = `<span class="text-slate-400 font-normal">Level:</span> ${hero.level || 1}`;
  chipsRow.append(lvlChip);

  // Rank
  if (equipmentRank) {
    const rankChip = document.createElement('span');
    rankChip.className = 'inline-flex items-center gap-1 font-semibold';
    rankChip.innerHTML = `<span class="text-slate-400 font-normal">Rank:</span> <span style="color:${equipmentRank.color};text-shadow:${equipmentRank.textShadow}">${equipmentRank.label}</span>`;
    chipsRow.append(rankChip);
  }

  // Power
  const pwrChip = document.createElement('span');
  pwrChip.className = 'inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400';
  pwrChip.innerHTML = `<span class="text-slate-400 font-normal">Power:</span> ⚔️ ${formatNumber(hero.power || 0)}`;
  chipsRow.append(pwrChip);

  detailsBlock.append(chipsRow);

  // Soul Stones progress
  if (soulProgress) {
    const soulWrap = document.createElement('div');
    soulWrap.className = 'pt-1';
    const isMaxStars = starCount >= 6;
    const progressText = isMaxStars ? 'Maximum Evolution' : `${soulProgress.owned} / ${soulProgress.needed}`;
    const pct = isMaxStars ? 100 : Math.min(100, Math.round((soulProgress.owned / (soulProgress.needed || 1)) * 100));

    soulWrap.innerHTML = `
      <div class="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400 mb-1">
        <span>Soul Stones:</span>
        <span class="font-medium ${soulProgress.owned >= soulProgress.needed && !isMaxStars ? 'text-emerald-600 font-bold' : ''}">${progressText}</span>
      </div>
      <div class="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
        <div class="h-full rounded-full ${isMaxStars ? 'bg-amber-400' : (soulProgress.owned >= soulProgress.needed ? 'bg-emerald-500' : 'bg-blue-500')}" style="width:${pct}%"></div>
      </div>
    `;
    detailsBlock.append(soulWrap);
  }

  profileRow.append(detailsBlock);
  profileCard.append(profileRow);
  host.append(profileCard);

  // 2. Skills Section with + Upgrade Button
  const skillsCard = document.createElement('div');
  skillsCard.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3';

  const skillsHeader = document.createElement('div');
  skillsHeader.className = 'flex items-center justify-between gap-2 flex-wrap';
  skillsHeader.innerHTML = `
    <div>
      <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <span>⚡</span> Hero Skills
      </h4>
      <div class="text-2xs text-slate-400 dark:text-slate-500">Upgrade hero skills using skill points and gold</div>
    </div>
  `;
  skillsCard.append(skillsHeader);

  const heroLevel = Number(hero.level) || 1;
  const heroColor = Number(hero.color) || 1;
  const skillKeys = Object.keys(hero.skills || {}).sort((a, b) => Number(a) - Number(b));

  const skillSlots = [
    { slot: 1, label: 'Skill 1', tier: 'White', rankReq: 1, rankName: 'White', bg: 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40', badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300', maxLvl: heroLevel },
    { slot: 2, label: 'Skill 2', tier: 'Green', rankReq: 2, rankName: 'Green', bg: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200', maxLvl: heroLevel },
    { slot: 3, label: 'Skill 3', tier: 'Blue', rankReq: 4, rankName: 'Blue', bg: 'border-sky-200 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200', maxLvl: Math.max(0, heroLevel - 20) },
    { slot: 4, label: 'Skill 4', tier: 'Violet', rankReq: 7, rankName: 'Violet', bg: 'border-purple-200 bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/20', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200', maxLvl: Math.max(0, heroLevel - 40) }
  ];

  const skillsList = document.createElement('div');
  skillsList.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5';

  for (const s of skillSlots) {
    const isUnlocked = heroColor >= s.rankReq || s.slot <= skillKeys.length;
    const skillKey = skillKeys[s.slot - 1];
    const curLevel = isUnlocked ? Number(hero.skills?.[skillKey] ?? hero.skills?.[s.slot] ?? 1) : 0;
    const maxLevel = s.maxLvl;
    const isMax = isUnlocked && curLevel >= maxLevel && maxLevel > 0;
    const pct = maxLevel > 0 ? Math.min(100, Math.round((curLevel / maxLevel) * 100)) : 0;
    const skillName = meta.skills?.[s.slot - 1] || s.label;

    const row = document.createElement('div');
    row.className = `flex flex-col justify-between p-2.5 rounded-lg border transition-all ${
      isUnlocked ? s.bg : 'border-dashed border-slate-200 bg-slate-50/30 text-slate-400 dark:border-slate-800 dark:bg-slate-900/30'
    }`;

    // Top row: pill + skillName on left, button / badge on right (flush right)
    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between gap-1.5 min-w-0';

    const nameGroup = document.createElement('div');
    nameGroup.className = 'flex items-center gap-1.5 min-w-0 flex-1 mr-1';

    const pill = document.createElement('span');
    pill.className = `inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider shrink-0 ${s.badge}`;
    pill.textContent = s.tier;

    const slotTitle = document.createElement('span');
    slotTitle.className = `font-bold text-xs truncate ${isUnlocked ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`;
    slotTitle.textContent = skillName;
    slotTitle.title = skillName;

    nameGroup.append(pill, slotTitle);
    topRow.append(nameGroup);

    // Right action button / badge (flush right)
    const actionWrap = document.createElement('div');
    actionWrap.className = 'shrink-0 flex items-center';

    if (!isUnlocked) {
      const lockBadge = document.createElement('span');
      lockBadge.className = 'px-1.5 py-0.5 rounded text-3xs text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500';
      lockBadge.textContent = 'Locked';
      actionWrap.append(lockBadge);
    } else if (isMax) {
      const maxBadge = document.createElement('span');
      maxBadge.className = 'px-2 py-0.5 rounded text-3xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      maxBadge.textContent = 'MAX';
      actionWrap.append(maxBadge);
    } else {
      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'btn-upgrade-skill inline-flex items-center justify-center size-6 rounded-md font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-all active:scale-95 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:text-white dark:border dark:border-emerald-400/50';
      plusBtn.title = `Upgrade ${skillName} to Lv. ${curLevel + 1}`;
      plusBtn.setAttribute('aria-label', `Upgrade ${skillName} to Lv. ${curLevel + 1}`);
      plusBtn.innerHTML = '<svg class="size-3.5 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        plusBtn.disabled = true;
        plusBtn.innerHTML = '<span class="text-3xs">⏳</span>';

        // Optimistic update
        if (hero.skills && skillKey) {
          hero.skills[skillKey] = (Number(hero.skills[skillKey]) || 0) + 1;
        } else if (hero.skills) {
          hero.skills[s.slot] = (Number(hero.skills[s.slot]) || 0) + 1;
        }

        const calls = [
          {
            name: 'heroUpgradeSkill',
            args: {
              heroId: numId,
              skill: s.slot
            }
          },
          { name: 'heroGetAll', args: {} }
        ];

        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls }, () => {
            setTimeout(() => {
              if (typeof renderHeroDialog === 'function' && typeof currentCache !== 'undefined') {
                renderHeroDialog(heroId, currentCache);
              }
            }, 600);
          });
        }
      });
      actionWrap.append(plusBtn);
    }

    topRow.append(actionWrap);

    // Bottom area: level progress bar or unlock condition
    const bottomDiv = document.createElement('div');
    bottomDiv.className = 'mt-2 space-y-1';

    if (isUnlocked) {
      const lvlText = document.createElement('div');
      lvlText.className = 'flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400';
      lvlText.innerHTML = `<span>Level: <span class="font-bold text-slate-700 dark:text-slate-200">${curLevel}</span> / ${maxLevel}</span><span>${pct}%</span>`;

      const bar = document.createElement('div');
      bar.className = 'w-full bg-slate-200/80 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden';
      bar.innerHTML = `<div class="h-full rounded-full ${isMax ? 'bg-amber-500' : 'bg-emerald-500'} transition-all" style="width:${pct}%"></div>`;

      bottomDiv.append(lvlText, bar);
    } else {
      const lockText = document.createElement('div');
      lockText.className = 'text-2xs text-slate-400 italic';
      lockText.textContent = `🔒 Unlocks at rank ${s.rankName}`;
      bottomDiv.append(lockText);
    }

    row.append(topRow, bottomDiv);
    skillsList.append(row);
  }

  skillsCard.append(skillsList);
  host.append(skillsCard);

  // 3. Artifacts Section (if any)
  if (Array.isArray(hero.artifacts) && hero.artifacts.length > 0) {
    const artCard = document.createElement('div');
    artCard.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-2';
    artCard.innerHTML = '<h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><span>🛡️</span> Artifacts</h4>';

    const artGrid = document.createElement('div');
    artGrid.className = 'grid grid-cols-3 gap-2 text-center text-xs';

    for (const art of hero.artifacts) {
      const artBox = document.createElement('div');
      artBox.className = 'p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700';
      const typeLabel = art.artifactType ? art.artifactType.charAt(0).toUpperCase() + art.artifactType.slice(1) : 'Artifact';
      artBox.innerHTML = `
        <div class="text-2xs text-slate-400 capitalize">${typeLabel}</div>
        <div class="font-bold text-slate-800 dark:text-slate-200">Lv. ${art.level || 1}</div>
        <div class="text-2xs text-amber-500">${'★'.repeat(art.star || 1)}</div>
      `;
      artGrid.append(artBox);
    }
    artCard.append(artGrid);
    host.append(artCard);
  }

  // 4. Equipment & Campaign Farm Section
  const equipCard = document.createElement('div');
  equipCard.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3';

  const equipHeader = document.createElement('div');
  equipHeader.className = 'flex items-center justify-between gap-2 flex-wrap';
  equipHeader.innerHTML = `
    <div>
      <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <span>🛡️</span> Equipment Slots
      </h4>
      <div class="text-2xs text-slate-400 dark:text-slate-500">6 equipment slots to advance Hero Rank/Color</div>
    </div>
  `;

  const farmQuickBtn = document.createElement('button');
  farmQuickBtn.type = 'button';
  farmQuickBtn.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5';
  farmQuickBtn.innerHTML = '<span>⚔️</span> Farm Equipment';
  farmQuickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    let firstMissingGearId = null;
    for (let sIdx = 0; sIdx < 6; sIdx++) {
      let isEquipped = false;
      if (hero.slots) {
        if (Array.isArray(hero.slots)) {
          isEquipped = sIdx < hero.slots.length && hero.slots[sIdx] !== undefined && hero.slots[sIdx] !== null;
        } else if (typeof hero.slots === 'object') {
          isEquipped = Object.hasOwn(hero.slots, String(sIdx)) || Object.hasOwn(hero.slots, sIdx);
        }
      }
      if (!isEquipped && colorItems[sIdx]) {
        firstMissingGearId = colorItems[sIdx];
        break;
      }
    }
    openCampaignDialog({ gearId: firstMissingGearId || colorItems[0] || null }, cache);
  });
  equipHeader.append(farmQuickBtn);
  equipCard.append(equipHeader);

  const slotsGrid = document.createElement('div');
  slotsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5';

  const heroColorStr = String(hero.color || 1);
  const colorItems = meta.equipment?.[heroColorStr] || [];

  for (let sIdx = 0; sIdx < 6; sIdx++) {
    const slotNum = sIdx + 1;
    const itemId = colorItems[sIdx] || null;
    const itemName = itemId
      ? (globalThis.hwaHelperNameData?.names?.gear?.[itemId] ||
         globalThis.hwaHelperNameMap?.item?.('gear', itemId) ||
         `Gear #${itemId}`)
      : `Slot ${slotNum}`;

    let isEquipped = false;
    if (hero.slots) {
      if (Array.isArray(hero.slots)) {
        isEquipped = sIdx < hero.slots.length && hero.slots[sIdx] !== undefined && hero.slots[sIdx] !== null;
      } else if (typeof hero.slots === 'object') {
        isEquipped = Object.hasOwn(hero.slots, String(sIdx)) || Object.hasOwn(hero.slots, sIdx);
      }
    }

    const slotBox = document.createElement('div');
    slotBox.className = 'p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 transition-all';

    if (isEquipped) {
      slotBox.className += ' border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200';
      slotBox.innerHTML = `
        <div class="flex items-center justify-between gap-1.5 min-w-0">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="size-5 rounded-full flex items-center justify-center font-bold text-2xs bg-emerald-600 text-white shrink-0">${slotNum}</span>
            <span class="font-bold truncate text-xs text-slate-800 dark:text-slate-100" title="${itemName}">${itemName}</span>
          </div>
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 shrink-0">✓ Equipped</span>
        </div>
        <div class="text-3xs text-emerald-600 dark:text-emerald-400 font-medium">Slot ${slotNum} • Stats active</div>
      `;
    } else {
      const ownedGear = Number(cache?.inventoryGet?.data?.gear?.[itemId] || 0);
      const craftInfo = itemId ? globalThis.hwaHelperGearCraftData?.[itemId] : null;
      const fragReq = craftInfo?.fragmentCount || 0;
      const ownedFrags = Number(cache?.inventoryGet?.data?.fragmentGear?.[itemId] || 0);
      const hasRecipe = !!craftInfo?.recipe;

      let badgeHtml = '';
      let subText = '';
      let canCraftNow = false;

      if (ownedGear > 0) {
        slotBox.className += ' border-sky-300 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-950/30 hover:border-sky-400 cursor-pointer';
        badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300 shrink-0">📦 In Inventory (${ownedGear})</span>`;
        subText = `Slot ${slotNum} • <span class="text-sky-700 dark:text-sky-300 font-semibold">In Inventory (not equipped)</span>`;
      } else if (fragReq > 0 && ownedFrags >= fragReq) {
        canCraftNow = true;
        slotBox.className += ' border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30 hover:border-amber-400 cursor-pointer';
        badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 shrink-0">🧩 Ready to craft (${ownedFrags}/${fragReq})</span>`;
        subText = `Slot ${slotNum} • <span class="text-amber-700 dark:text-amber-300 font-semibold">Not crafted • Fragments ready</span>`;
      } else if (fragReq > 0 && ownedFrags > 0) {
        slotBox.className += ' border-dashed border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 hover:border-indigo-400 cursor-pointer';
        badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">🧩 Incomplete (${ownedFrags}/${fragReq})</span>`;
        subText = `Slot ${slotNum} • <span class="text-slate-500 dark:text-slate-400">Missing ${fragReq - ownedFrags} fragments</span>`;
      } else if (hasRecipe) {
        slotBox.className += ' border-dashed border-purple-200 bg-purple-50/30 dark:border-purple-900/30 dark:bg-purple-950/10 hover:border-indigo-400 cursor-pointer';
        badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 shrink-0">🛠️ Recipe</span>`;
        subText = `Slot ${slotNum} • <span class="text-purple-600 dark:text-purple-400">Uncrafted (assembled from Recipe)</span>`;
      } else {
        slotBox.className += ' border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer';
        badgeHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">Missing${fragReq > 0 ? ` (0/${fragReq})` : ''}</span>`;
        subText = `Slot ${slotNum} • <span class="text-slate-400 italic">Click to open Campaign Farm</span>`;
      }

      slotBox.innerHTML = `
        <div class="flex items-center justify-between gap-1.5 min-w-0">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="size-5 rounded-full flex items-center justify-center font-bold text-2xs bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">${slotNum}</span>
            <span class="font-bold truncate text-xs text-slate-800 dark:text-slate-100" title="${itemName}">${itemName}</span>
          </div>
          ${badgeHtml}
        </div>
        <div class="flex items-center justify-between gap-1 text-3xs">
          <div>${subText}</div>
        </div>
      `;

      if (canCraftNow) {
        const craftBtn = document.createElement('button');
        craftBtn.type = 'button';
        craftBtn.className = 'px-2 py-0.5 rounded text-3xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs shrink-0';
        craftBtn.textContent = 'Craft';
        craftBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          craftBtn.disabled = true;
          craftBtn.textContent = '...';
          chrome.runtime?.sendMessage?.(
            { kind: 'craft-fragment', libId: itemId, amount: 1 },
            (res) => {
              if (chrome.runtime?.lastError) {
                craftBtn.disabled = false;
                craftBtn.textContent = 'Error';
                return;
              }
              if (res?.ok) {
                setTimeout(() => {
                  if (typeof renderHeroDialog === 'function' && typeof currentCache !== 'undefined') {
                    renderHeroDialog(heroId, currentCache);
                  }
                }, 500);
              } else {
                craftBtn.disabled = false;
                craftBtn.textContent = res?.error || 'Error';
              }
            }
          );
        });
        slotBox.querySelector('.flex.items-center.justify-between.gap-1.text-3xs')?.append(craftBtn);
      }

      slotBox.addEventListener('click', () => {
        openCampaignDialog({ gearId: itemId }, cache);
      });
    }

    slotsGrid.append(slotBox);
  }

  equipCard.append(slotsGrid);
  host.append(equipCard);
}

let selectedCampaignMissionId = 135;
let selectedCampaignTimes = 5;
let selectedFarmGearId = null;
let selectedRecipeNodeId = null;

globalThis.hwaHelperCampaignState = {
  get selectedCampaignMissionId() { return selectedCampaignMissionId; },
  set selectedCampaignMissionId(v) { selectedCampaignMissionId = v; },
  get selectedFarmGearId() { return selectedFarmGearId; },
  set selectedFarmGearId(v) { selectedFarmGearId = v; },
  get selectedRecipeNodeId() { return selectedRecipeNodeId; },
  set selectedRecipeNodeId(v) { selectedRecipeNodeId = v; },
  buildGearRecipeTree,
  findFirstUnfulfilledNode
};

function buildGearRecipeTree(gearId, cache, visited = new Set()) {
  if (!gearId) return null;
  const strId = String(gearId);
  if (visited.has(strId)) return null;
  visited.add(strId);

  const craftInfo = globalThis.hwaHelperGearCraftData?.[strId] || null;
  const name = globalThis.hwaHelperNameData?.names?.gear?.[strId] ||
               globalThis.hwaHelperNameMap?.item?.('gear', strId) ||
               `Gear #${strId}`;
  const ownedGear = Number(cache?.inventoryGet?.data?.gear?.[strId] || 0);

  const node = {
    id: strId,
    name,
    owned: ownedGear,
    craftInfo,
    fragment: null,
    children: [],
    isFulfilled: ownedGear >= 1,
    canCraft: false
  };

  if (craftInfo?.fragmentCount) {
    const fragReq = Number(craftInfo.fragmentCount) || 0;
    const ownedFrags = Number(cache?.inventoryGet?.data?.fragmentGear?.[strId] || 0);
    const fragFulfilled = ownedFrags >= fragReq;
    node.fragment = {
      id: strId,
      required: fragReq,
      owned: ownedFrags,
      isFulfilled: fragFulfilled,
      gold: craftInfo.gold || 0
    };
    if (ownedGear < 1 && fragFulfilled) {
      node.canCraft = true;
    }
  }

  let allSubFulfilled = true;
  let hasSubComponents = false;

  if (craftInfo?.recipe) {
    for (const [subId, reqCount] of Object.entries(craftInfo.recipe)) {
      hasSubComponents = true;
      const child = buildGearRecipeTree(subId, cache, new Set(visited));
      if (child) {
        child.requiredCount = Number(reqCount) || 1;
        child.isFulfilled = child.owned >= child.requiredCount;
        if (!child.isFulfilled) allSubFulfilled = false;
        node.children.push(child);
      }
    }
  }

  // Include recipe scroll / scroll fragments
  if (craftInfo?.scroll) {
    for (const [scrollId, reqCount] of Object.entries(craftInfo.scroll)) {
      hasSubComponents = true;
      const scrollStr = String(scrollId);
      const scrollCraft = globalThis.hwaHelperScrollCraftData?.[scrollStr] || null;
      const scrollName = globalThis.hwaHelperNameData?.names?.scroll?.[scrollStr] ||
                         globalThis.hwaHelperNameMap?.item?.('scroll', scrollStr) ||
                         `Recipe #${scrollStr}`;
      const ownedScroll = Number(cache?.inventoryGet?.data?.scroll?.[scrollStr] || 0);
      const reqNum = Number(reqCount) || 1;
      const isScrollFulfilled = ownedScroll >= reqNum;
      if (!isScrollFulfilled) allSubFulfilled = false;

      const scrollNode = {
        id: scrollStr,
        name: scrollName,
        category: 'scroll',
        isScroll: true,
        owned: ownedScroll,
        requiredCount: reqNum,
        craftInfo: scrollCraft,
        fragment: null,
        children: [],
        isFulfilled: isScrollFulfilled,
        canCraft: false
      };

      if (scrollCraft?.fragmentCount) {
        const fragReq = Number(scrollCraft.fragmentCount) || 0;
        const ownedFragScroll = Number(cache?.inventoryGet?.data?.fragmentScroll?.[scrollStr] || 0);
        const fragFulfilled = ownedFragScroll >= fragReq;
        scrollNode.fragment = {
          id: scrollStr,
          category: 'fragmentScroll',
          required: fragReq,
          owned: ownedFragScroll,
          isFulfilled: fragFulfilled,
          gold: scrollCraft.gold || 0
        };
        if (ownedScroll < reqNum && fragFulfilled) {
          scrollNode.canCraft = true;
        }
      }

      node.children.push(scrollNode);
    }
  }

  if (ownedGear < 1 && allSubFulfilled && hasSubComponents) {
    node.canCraft = true;
  }

  return node;
}

function findFirstUnfulfilledNode(node) {
  if (!node) return null;
  for (const child of node.children) {
    const unfulfilledChild = findFirstUnfulfilledNode(child);
    if (unfulfilledChild) return unfulfilledChild;
  }
  if (!node.isFulfilled) {
    return node;
  }
  return null;
}

function renderCampaignDialog(cache = currentCache, target = document.querySelector('#campaign-dialog-body')) {
  if (!target) return;
  target.replaceChildren();

  const container = document.createElement('div');
  container.className = 'space-y-4';

  const energyStatus = cache?.energyStatus?.data || {};
  const curEnergy = Number.isFinite(energyStatus.energy) ? energyStatus.energy : '—';
  const maxEnergy = Number.isFinite(energyStatus.max) ? energyStatus.max : '—';

  // 1. Energy & Status Banner
  const statusBanner = document.createElement('div');
  statusBanner.className = 'rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80 flex items-center justify-between gap-3 flex-wrap';

  const leftInfo = document.createElement('div');
  leftInfo.className = 'space-y-0.5';
  leftInfo.innerHTML = `
    <div class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
      <span>⚡</span> Campaign Mission Raid
    </div>
    <div class="text-2xs text-slate-500 dark:text-slate-400">
      Raid campaign missions to farm equipment, fragments, and gold
    </div>
  `;

  const energyChip = document.createElement('div');
  energyChip.className = 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-bold text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800';
  energyChip.innerHTML = `<span>⚡ Energy:</span> <span class="text-sm font-extrabold">${curEnergy}</span>${maxEnergy !== '—' ? `<span class="text-amber-500">/ ${maxEnergy}</span>` : ''}`;

  statusBanner.append(leftInfo, energyChip);
  container.append(statusBanner);

  // 2. Target Equipment & Recipe Tree Section (if selectedFarmGearId is active)
  const recipeTree = selectedFarmGearId ? buildGearRecipeTree(selectedFarmGearId, cache) : null;
  if (recipeTree) {
    if (!selectedRecipeNodeId) {
      const unfulfilled = findFirstUnfulfilledNode(recipeTree);
      selectedRecipeNodeId = unfulfilled ? unfulfilled.id : recipeTree.id;
    }

    const treeCard = document.createElement('div');
    treeCard.className = 'rounded-xl border border-indigo-200 bg-white p-4 shadow-xs dark:border-indigo-900/40 dark:bg-slate-800/80 space-y-3';

    const treeHead = document.createElement('div');
    treeHead.className = 'flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-900/30 flex-wrap gap-2';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'flex items-center gap-2.5 min-w-0';

    const rootImg = document.createElement('img');
    rootImg.src = `assets/items/gear/${recipeTree.id}.png`;
    rootImg.alt = recipeTree.name;
    rootImg.className = 'size-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 object-cover shrink-0';
    rootImg.onerror = () => { rootImg.style.display = 'none'; };

    const titleInfo = document.createElement('div');
    titleInfo.className = 'min-w-0';
    titleInfo.innerHTML = `
      <div class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
        <span>🌿 Crafting Recipe Tree:</span>
        <span class="text-indigo-600 dark:text-indigo-400 font-extrabold">${recipeTree.name}</span>
        <span class="text-3xs font-mono text-slate-400">#${recipeTree.id}</span>
      </div>
      <div class="text-2xs text-slate-400 dark:text-slate-500">
        Click a branch or fragment to filter and select the highest campaign mission (3⭐)
      </div>
    `;
    titleGroup.append(rootImg, titleInfo);

    const clearTargetBtn = document.createElement('button');
    clearTargetBtn.type = 'button';
    clearTargetBtn.className = 'text-3xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 cursor-pointer transition-colors';
    clearTargetBtn.textContent = '✕ Clear Gear Filter';
    clearTargetBtn.addEventListener('click', () => {
      selectedFarmGearId = null;
      selectedRecipeNodeId = null;
      renderCampaignDialog(cache, target);
    });

    treeHead.append(titleGroup, clearTargetBtn);
    treeCard.append(treeHead);

    const treeList = document.createElement('div');
    treeList.className = 'space-y-1.5';

    function renderTreeNode(node, depth = 0, isRoot = false) {
      const isSelected = String(selectedRecipeNodeId) === String(node.id);
      const row = document.createElement('div');
      row.className = `p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 flex-wrap ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50/90 dark:border-indigo-500 dark:bg-indigo-950/60 ring-2 ring-indigo-400/60 shadow-xs'
          : (node.isFulfilled
              ? 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/20 hover:border-emerald-300'
              : 'border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40 hover:border-indigo-300 dark:hover:border-indigo-700')
      }`;
      if (depth > 0) {
        row.style.marginLeft = `${depth * 18}px`;
      }

      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 min-w-0 flex-1';

      if (depth > 0) {
        const branchSymbol = document.createElement('span');
        branchSymbol.className = 'text-slate-400 dark:text-slate-500 text-xs select-none font-mono';
        branchSymbol.textContent = '↳';
        left.append(branchSymbol);
      }

      const icon = document.createElement('img');
      icon.src = node.isScroll
        ? `assets/items/scroll/${node.id}.png`
        : `assets/items/gear/${node.id}.png`;
      icon.alt = node.name;
      icon.className = 'size-6 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 object-cover shrink-0';
      icon.onerror = () => { icon.style.display = 'none'; };
      left.append(icon);

      const nameInfo = document.createElement('div');
      nameInfo.className = 'min-w-0';

      const reqLabel = node.requiredCount ? ` (Need ${node.requiredCount})` : (isRoot ? ' (Target)' : '');
      nameInfo.innerHTML = `
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="font-bold text-xs truncate ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}">${node.isScroll ? '📜 ' : ''}${node.name}</span>
          <span class="text-3xs font-mono text-slate-400">#${node.id}${reqLabel}</span>
        </div>
        <div class="text-3xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
          <span>In Inventory: <strong class="${node.owned > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}">${node.owned}</strong></span>
          ${node.fragment ? `<span>• Fragments: <strong class="${node.fragment.isFulfilled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">${node.fragment.owned} / ${node.fragment.required}</strong></span>` : ''}
        </div>
      `;
      left.append(nameInfo);
      row.append(left);

      const right = document.createElement('div');
      right.className = 'flex items-center gap-1.5 shrink-0';

      const statusPill = document.createElement('span');
      if (node.isFulfilled) {
        statusPill.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
        statusPill.textContent = '✓ Complete';
      } else if (node.fragment && !node.fragment.isFulfilled) {
        const missingFrags = node.fragment.required - node.fragment.owned;
        statusPill.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
        statusPill.textContent = node.isScroll ? `📜 Missing ${missingFrags} recipe fragments` : `🧩 Missing ${missingFrags} fragments`;
      } else {
        const missingCount = node.requiredCount ? Math.max(1, node.requiredCount - node.owned) : 1;
        statusPill.className = 'inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300';
        statusPill.textContent = `Missing ${missingCount}`;
      }
      right.append(statusPill);

      if (node.canCraft) {
        const quickCraftBtn = document.createElement('button');
        quickCraftBtn.type = 'button';
        quickCraftBtn.className = 'px-2 py-0.5 rounded text-3xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs';
        quickCraftBtn.textContent = 'Craft';
        quickCraftBtn.title = node.isScroll
          ? `Craft recipe fragments #${node.id}`
          : (node.fragment ? `Craft fragments #${node.id}` : `Craft recipe #${node.id}`);
        quickCraftBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          quickCraftBtn.disabled = true;
          quickCraftBtn.textContent = '...';
          const kind = (node.fragment || node.isScroll) ? 'craft-fragment' : 'craft-recipe';
          const type = node.isScroll ? 'scroll' : 'gear';
          chrome.runtime?.sendMessage?.({ kind, type, libId: Number(node.id), amount: 1 }, (res) => {
            if (chrome.runtime?.lastError) {
              quickCraftBtn.disabled = false;
              quickCraftBtn.textContent = 'Error';
              return;
            }
            setTimeout(() => {
              if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
            }, 600);
          });
        });
        right.append(quickCraftBtn);
      }

      if (isSelected) {
        const targetBadge = document.createElement('span');
        targetBadge.className = 'inline-flex items-center px-2 py-0.5 rounded text-3xs font-bold bg-indigo-600 text-white shadow-xs';
        targetBadge.textContent = '🎯 Selected for farming';
        right.append(targetBadge);
      }

      row.append(right);

      row.addEventListener('click', () => {
        selectedRecipeNodeId = node.id;
        const candidates = globalThis.hwaHelperCampaignMissions?.getMissionsForItem?.(node.id) || [];
        const highest = globalThis.hwaHelperCampaignMissions?.getHighestRaidableMission?.(
          candidates.map((m) => m.id),
          cache?.missionGetAll?.data
        );
        if (highest) {
          selectedCampaignMissionId = highest;
        }
        renderCampaignDialog(cache, target);
      });

      treeList.append(row);

      for (const child of node.children) {
        renderTreeNode(child, depth + 1, false);
      }
    }

    renderTreeNode(recipeTree, 0, true);
    treeCard.append(treeList);
    container.append(treeCard);
  }

  // 3. Raid Mission Configuration Card
  const raidCard = document.createElement('div');
  raidCard.className = 'rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 shadow-xs dark:border-indigo-900/40 dark:bg-indigo-950/20 space-y-3';

  const raidCardHead = document.createElement('div');
  raidCardHead.className = 'flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-100 dark:border-indigo-900/40';
  raidCardHead.innerHTML = `
    <h4 class="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
      <span>🎯</span> Campaign Raid Setup
    </h4>
    <span class="text-2xs text-slate-500 dark:text-slate-400">Estimated cost: ~6-8 Energy / raid</span>
  `;
  raidCard.append(raidCardHead);

  // Mission ID Input & Quick Chips
  const missionRow = document.createElement('div');
  missionRow.className = 'space-y-1.5';
  
  const missionLabelRow = document.createElement('div');
  missionLabelRow.className = 'flex items-center justify-between text-xs';
  missionLabelRow.innerHTML = `
    <label for="campaign-mission-input" class="font-bold text-slate-800 dark:text-slate-200">Campaign Mission (Mission ID):</label>
    <span class="text-2xs text-slate-500">${selectedRecipeNodeId ? `Filtered by item #${selectedRecipeNodeId}` : 'Default: 135 (Map item drop)'}</span>
  `;
  missionRow.append(missionLabelRow);

  const missionInputGroup = document.createElement('div');
  missionInputGroup.className = 'flex items-center gap-2 flex-wrap';

  const missionInput = document.createElement('input');
  missionInput.id = 'campaign-mission-input';
  missionInput.type = 'number';
  missionInput.min = '1';
  missionInput.value = String(selectedCampaignMissionId);
  missionInput.className = 'w-32 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400';
  missionInput.addEventListener('input', (e) => {
    selectedCampaignMissionId = Number(e.target.value) || 135;
  });
  missionInputGroup.append(missionInput);

  // Filtered Mission Chips or Fallback Chips
  const candidateMissions = selectedRecipeNodeId
    ? (globalThis.hwaHelperCampaignMissions?.getMissionsForItem?.(selectedRecipeNodeId) || [])
    : [];

  const quickChipsWrap = document.createElement('div');
  quickChipsWrap.className = 'flex items-center gap-1.5 flex-wrap';

  if (selectedRecipeNodeId && candidateMissions.length > 0) {
    const sortedCandidates = [...candidateMissions].sort((a, b) => b.id - a.id);
    const progressData = cache?.missionGetAll?.data || {};

    sortedCandidates.forEach((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      const mStars = Number(progressData[String(m.id)]?.stars ?? progressData[Number(m.id)]?.stars ?? 0);
      const isSelected = Number(selectedCampaignMissionId) === Number(m.id);
      const is3Star = mStars >= 3;

      let starLabel = '🔒';
      if (mStars >= 3) starLabel = '⭐3';
      else if (mStars > 0) starLabel = `⭐${mStars}`;

      let chipClass = 'px-2 py-1 rounded-md text-2xs font-bold cursor-pointer transition-all flex items-center gap-1 border ';
      if (isSelected) {
        chipClass += 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-400';
      } else if (is3Star) {
        chipClass += 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800';
      } else if (mStars > 0) {
        chipClass += 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800';
      } else {
        chipClass += 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      }

      chip.className = chipClass;
      chip.innerHTML = `<span>#${m.id} (${m.chapter}-${m.index}${m.isHeroic ? ' H' : ''})</span><span class="${is3Star && !isSelected ? 'text-amber-500' : ''}">${starLabel}</span>`;
      chip.title = `Mission #${m.id} (Chapter ${m.chapter}-${m.index}) • ${mStars >= 3 ? '3 Stars (Raid available)' : (mStars > 0 ? `${mStars} Stars (Cannot raid)` : 'Not cleared')}`;

      chip.addEventListener('click', () => {
        selectedCampaignMissionId = m.id;
        missionInput.value = String(m.id);
        renderCampaignDialog(cache, target);
      });
      quickChipsWrap.append(chip);
    });
  } else if (selectedRecipeNodeId && candidateMissions.length === 0) {
    const noDropNotice = document.createElement('span');
    noDropNotice.className = 'text-2xs text-amber-600 dark:text-amber-400 italic';
    noDropNotice.textContent = `No campaign mission drops item #${selectedRecipeNodeId} (available in Shop / Chests)`;
    quickChipsWrap.append(noDropNotice);
  } else {
    const quickMissions = [135, 130, 125, 120, 100, 50];
    quickMissions.forEach((mId) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      const isSelected = Number(selectedCampaignMissionId) === Number(mId);
      chip.className = `px-2 py-1 rounded text-2xs font-semibold border cursor-pointer ${
        isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
      }`;
      chip.textContent = `#${mId}`;
      chip.addEventListener('click', () => {
        selectedCampaignMissionId = mId;
        missionInput.value = String(mId);
        renderCampaignDialog(cache, target);
      });
      quickChipsWrap.append(chip);
    });
  }

  missionInputGroup.append(quickChipsWrap);
  missionRow.append(missionInputGroup);
  raidCard.append(missionRow);

  // Times Selector
  const timesRow = document.createElement('div');
  timesRow.className = 'flex items-center justify-between flex-wrap gap-2 pt-1';

  const timesLabel = document.createElement('span');
  timesLabel.className = 'text-xs font-bold text-slate-800 dark:text-slate-200';
  timesLabel.textContent = 'Consecutive Raid Count:';
  timesRow.append(timesLabel);

  const timesBtnsGroup = document.createElement('div');
  timesBtnsGroup.className = 'inline-flex rounded-lg border border-slate-200 bg-white p-0.5 gap-1 dark:border-slate-700 dark:bg-slate-800';
  const timesOptions = [1, 5, 10, 20];
  timesOptions.forEach((t) => {
    const tBtn = document.createElement('button');
    tBtn.type = 'button';
    const isSelected = selectedCampaignTimes === t;
    tBtn.className = `px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
      isSelected ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
    }`;
    tBtn.textContent = `${t}x`;
    tBtn.addEventListener('click', () => {
      selectedCampaignTimes = t;
      renderCampaignDialog(cache, target);
    });
    timesBtnsGroup.append(tBtn);
  });
  timesRow.append(timesBtnsGroup);
  raidCard.append(timesRow);

  // Sequential Mode Toggle (VIP 0 fallback support)
  const modeRow = document.createElement('div');
  modeRow.className = 'flex items-center justify-between flex-wrap gap-2 pt-1';

  const seqLabel = document.createElement('label');
  seqLabel.className = 'inline-flex items-center gap-1.5 text-2xs cursor-pointer select-none text-slate-600 dark:text-slate-300 font-medium';
  const seqCheck = document.createElement('input');
  seqCheck.type = 'checkbox';
  seqCheck.id = 'campaign-raid-sequential';
  seqCheck.checked = campaignRaidSequential;
  seqCheck.className = 'rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800';
  seqCheck.addEventListener('change', () => {
    campaignRaidSequential = seqCheck.checked;
    chrome.storage.local.set({ campaignRaidSequential });
    renderCampaignDialog(cache, target);
  });
  seqLabel.append(seqCheck);
  const seqText = document.createElement('span');
  seqText.textContent = 'Sequential 1x loop (VIP 0 / F2P friendly)';
  seqLabel.append(seqText);
  modeRow.append(seqLabel);
  raidCard.append(modeRow);

  // Raid Action Button & Status
  const actionRow = document.createElement('div');
  actionRow.className = 'flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/40';

  const missionCostPair = globalThis.hwaHelperMissionCosts?.[selectedCampaignMissionId];
  const unitCost = missionCostPair ? (missionCostPair[0] + missionCostPair[1]) : 6;
  const estCost = selectedCampaignTimes * unitCost;
  const costHint = document.createElement('span');
  costHint.className = 'text-2xs text-slate-500 dark:text-slate-400';
  costHint.textContent = `Estimated ~${estCost} Energy (${unitCost}/raid)`;
  actionRow.append(costHint);

  const raidBtn = document.createElement('button');
  raidBtn.id = 'campaign-raid-submit';
  raidBtn.type = 'button';

  if (isCampaignRaidLoopRunning) {
    raidBtn.className = 'px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5';
    raidBtn.innerHTML = '<span>🛑</span> <span>Stop Raid Loop</span>';
    raidBtn.addEventListener('click', () => {
      abortCampaignRaidLoop = true;
      raidBtn.textContent = 'Stopping...';
    });
  } else {
    raidBtn.className = popupRpcEnabled
      ? 'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer shadow-xs transition-all active:scale-95 flex items-center gap-1.5'
      : 'px-4 py-2 rounded-lg bg-slate-200 text-slate-400 font-bold text-xs cursor-not-allowed border border-slate-300';
    raidBtn.disabled = !popupRpcEnabled;
    raidBtn.innerHTML = popupRpcEnabled
      ? (campaignRaidSequential && selectedCampaignTimes > 1
          ? `<span>⚡</span> <span>Sequential ${selectedCampaignTimes}x Raid Mission #${selectedCampaignMissionId}</span>`
          : `<span>⚡</span> <span>Raid ${selectedCampaignTimes}x Mission #${selectedCampaignMissionId}</span>`)
      : 'Enable Popup RPC to Raid';

    if (popupRpcEnabled) {
      const executeSequentialLoop = async (missionId, totalTimes) => {
        isCampaignRaidLoopRunning = true;
        abortCampaignRaidLoop = false;
        let completed = 0;
        raidBtn.className = 'px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5';

        for (let i = 1; i <= totalTimes; i++) {
          if (abortCampaignRaidLoop) {
            raidBtn.textContent = `Stopped at raid ${completed}/${totalTimes}`;
            break;
          }

          raidBtn.innerHTML = `<span class="animate-spin">⏳</span> <span>Raiding ${i}/${totalTimes}... (Click to Stop)</span>`;

          const currentEnergy = currentCache?.energyStatus?.data?.energy ?? currentCache?.['resource:energy']?.data?.amount;
          if (typeof currentEnergy === 'number' && currentEnergy < unitCost) {
            raidBtn.textContent = `Out of Energy (${currentEnergy}/${unitCost}) at raid ${completed}/${totalTimes}`;
            break;
          }

          const res = await new Promise((resolve) => {
            chrome.runtime?.sendMessage?.(
              { kind: 'campaign-raid', missionId, times: 1 },
              (response) => {
                if (chrome.runtime?.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message });
                } else {
                  resolve(response || { ok: true });
                }
              }
            );
          });

          if (!res.ok) {
            raidBtn.disabled = false;
            raidBtn.textContent = res.error || `Error at raid ${i}`;
            break;
          }

          completed++;

          if (i < totalTimes && !abortCampaignRaidLoop) {
            await new Promise((r) => setTimeout(r, 650));
          }
        }

        isCampaignRaidLoopRunning = false;
        setTimeout(() => {
          if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
        }, 500);
      };

      raidBtn.addEventListener('click', () => {
        if (selectedCampaignTimes > 1 && campaignRaidSequential) {
          executeSequentialLoop(selectedCampaignMissionId, selectedCampaignTimes);
          return;
        }

        raidBtn.disabled = true;
        raidBtn.innerHTML = '<span class="animate-spin">⏳</span> <span>Executing Raid...</span>';
        chrome.runtime?.sendMessage?.(
          { kind: 'campaign-raid', missionId: selectedCampaignMissionId, times: selectedCampaignTimes },
          (res) => {
            if (chrome.runtime?.lastError) {
              raidBtn.disabled = false;
              raidBtn.textContent = chrome.runtime.lastError.message || 'Connection error';
              return;
            }
            if (!res?.ok) {
              const errLower = String(res?.error || '').toLowerCase();
              if (errLower.includes('vip') || errLower.includes('notenough')) {
                raidBtn.textContent = 'VIP insufficient, switching to sequential loop...';
                campaignRaidSequential = true;
                chrome.storage.local.set({ campaignRaidSequential: true });
                setTimeout(() => {
                  executeSequentialLoop(selectedCampaignMissionId, selectedCampaignTimes);
                }, 600);
                return;
              }
              raidBtn.disabled = false;
              raidBtn.textContent = res?.error || 'Raid failed';
            } else {
              setTimeout(() => {
                if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
              }, 600);
            }
          }
        );
      });
    }
  }
  actionRow.append(raidBtn);
  raidCard.append(actionRow);
  container.append(raidCard);

  // 3. Last Raid Results Card (if any)
  const lastRaid = cache?.lastCampaignRaidResult?.data;
  if (lastRaid && lastRaid.drops) {
    const drops = lastRaid.drops;
    const resCard = document.createElement('div');
    resCard.className = 'rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-2.5';

    const resHeader = document.createElement('div');
    resHeader.className = 'flex items-center justify-between text-xs pb-1.5 border-b border-emerald-200/80 dark:border-emerald-800';
    resHeader.innerHTML = `
      <span class="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
        <span>🎉</span> Raid Results: Mission #${lastRaid.missionId} (${lastRaid.times} ${lastRaid.times > 1 ? 'raids' : 'raid'})
      </span>
      <span class="text-2xs font-semibold text-emerald-700 dark:text-emerald-300">
        💰 +${formatNumber(drops.gold || 0)} Gold • 🧪 +${drops.experience || 0} EXP
      </span>
    `;
    resCard.append(resHeader);

    const dropsList = document.createElement('div');
    dropsList.className = 'flex flex-wrap gap-2';

    const getItemName = (category, id) => {
      const numId = String(id);
      return (
        globalThis.hwaHelperNameData?.names?.[category]?.[numId] ||
        globalThis.hwaHelperNameMap?.item?.(category, id) ||
        null
      );
    };

    // Fragment Gear
    if (drops.fragmentGear && Object.keys(drops.fragmentGear).length > 0) {
      for (const [gId, count] of Object.entries(drops.fragmentGear)) {
        const dropTag = document.createElement('span');
        dropTag.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-indigo-200 shadow-2xs dark:bg-slate-800 dark:text-indigo-300 dark:border-indigo-800';
        const name = getItemName('gear', gId) || getItemName('scroll', gId) || `#${gId}`;
        dropTag.innerHTML = `<span>🧩 ${name} Fragment</span> <span class="bg-indigo-100 text-indigo-800 px-1 rounded text-2xs dark:bg-indigo-900 dark:text-indigo-200">+${count}</span>`;
        dropsList.append(dropTag);
      }
    }

    // Fragment Scroll
    if (drops.fragmentScroll && Object.keys(drops.fragmentScroll).length > 0) {
      for (const [sId, count] of Object.entries(drops.fragmentScroll)) {
        const dropTag = document.createElement('span');
        dropTag.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-indigo-200 shadow-2xs dark:bg-slate-800 dark:text-indigo-300 dark:border-indigo-800';
        const name = getItemName('scroll', sId) || getItemName('gear', sId) || `#${sId}`;
        dropTag.innerHTML = `<span>📜 ${name} Fragment</span> <span class="bg-indigo-100 text-indigo-800 px-1 rounded text-2xs dark:bg-indigo-900 dark:text-indigo-200">+${count}</span>`;
        dropsList.append(dropTag);
      }
    }

    // Whole Gear
    if (drops.gear && Object.keys(drops.gear).length > 0) {
      for (const [gId, count] of Object.entries(drops.gear)) {
        const dropTag = document.createElement('span');
        dropTag.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-200 shadow-2xs dark:bg-slate-800 dark:text-emerald-300 dark:border-emerald-800';
        const name = getItemName('gear', gId) || `Gear #${gId}`;
        dropTag.innerHTML = `<span>🛡️ ${name}</span> <span class="bg-emerald-100 text-emerald-800 px-1 rounded text-2xs dark:bg-emerald-900 dark:text-emerald-200">+${count}</span>`;
        dropsList.append(dropTag);
      }
    }

    // Whole Scroll
    if (drops.scroll && Object.keys(drops.scroll).length > 0) {
      for (const [sId, count] of Object.entries(drops.scroll)) {
        const dropTag = document.createElement('span');
        dropTag.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-200 shadow-2xs dark:bg-slate-800 dark:text-emerald-300 dark:border-emerald-800';
        const name = getItemName('scroll', sId) || `Scroll #${sId}`;
        dropTag.innerHTML = `<span>📜 ${name}</span> <span class="bg-emerald-100 text-emerald-800 px-1 rounded text-2xs dark:bg-emerald-900 dark:text-emerald-200">+${count}</span>`;
        dropsList.append(dropTag);
      }
    }

    // Consumables
    if (drops.consumable && Object.keys(drops.consumable).length > 0) {
      for (const [cId, count] of Object.entries(drops.consumable)) {
        const dropTag = document.createElement('span');
        dropTag.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-2xs dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
        const name = getItemName('consumable', cId) || `Item #${cId}`;
        dropTag.innerHTML = `<span>📦 ${name}</span> <span class="bg-slate-100 text-slate-700 px-1 rounded text-2xs dark:bg-slate-700 dark:text-slate-300">+${count}</span>`;
        dropsList.append(dropTag);
      }
    }

    if (dropsList.children.length === 0) {
      const noDrops = document.createElement('span');
      noDrops.className = 'text-2xs text-slate-400 italic';
      noDrops.textContent = 'No items dropped in recent raids';
      dropsList.append(noDrops);
    }

    resCard.append(dropsList);
    container.append(resCard);
  }

  // 4. Equipment Crafting Section
  const craftCard = document.createElement('div');
  craftCard.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3';

  const craftHead = document.createElement('div');
  craftHead.className = 'flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800';
  craftHead.innerHTML = `
    <div>
      <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>🛠️</span> Equipment Crafting & Fragment Fusion
      </h4>
      <div class="text-2xs text-slate-400 dark:text-slate-500">Craft equipment fragments or assemble recipes into inventory</div>
    </div>
  `;
  craftCard.append(craftHead);

  // Owned Fragments list (Gear & Scroll Recipes)
  const invGearFrags = cache?.inventoryGet?.data?.fragmentGear || {};
  const invScrollFrags = cache?.inventoryGet?.data?.fragmentScroll || {};
  const fragEntries = [
    ...Object.entries(invGearFrags).filter(([, count]) => Number(count) > 0).map(([id, count]) => ({ id, count: Number(count), type: 'gear' })),
    ...Object.entries(invScrollFrags).filter(([, count]) => Number(count) > 0).map(([id, count]) => ({ id, count: Number(count), type: 'scroll' }))
  ];

  const fragsSection = document.createElement('div');
  fragsSection.className = 'space-y-1.5';
  
  const fragsTitle = document.createElement('div');
  fragsTitle.className = 'text-xs font-semibold text-slate-700 dark:text-slate-300';
  fragsTitle.textContent = 'Fragments & Recipes in Inventory:';
  fragsSection.append(fragsTitle);

  if (fragEntries.length > 0) {
    const fragsGrid = document.createElement('div');
    fragsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[180px] overflow-y-auto p-1 border border-slate-100 dark:border-slate-800 rounded-lg';
    for (const fragItem of fragEntries) {
      const isScroll = fragItem.type === 'scroll';
      const itemName = isScroll
        ? (globalThis.hwaHelperNameData?.names?.scroll?.[fragItem.id] ||
           globalThis.hwaHelperNameMap?.item?.('scroll', fragItem.id) ||
           `Recipe #${fragItem.id}`)
        : (globalThis.hwaHelperNameData?.names?.gear?.[fragItem.id] ||
           globalThis.hwaHelperNameMap?.item?.('gear', fragItem.id) ||
           `Gear #${fragItem.id}`);
      const iconSrc = isScroll ? `assets/items/scroll/${fragItem.id}.png` : `assets/items/gear/${fragItem.id}.png`;

      const fragRow = document.createElement('div');
      fragRow.className = 'flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs gap-2';

      const leftWrap = document.createElement('div');
      leftWrap.className = 'min-w-0 flex items-center gap-2';

      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = itemName;
      img.className = 'size-6 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 object-cover shrink-0';
      img.onerror = () => { img.style.display = 'none'; };
      leftWrap.append(img);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'min-w-0';
      infoDiv.innerHTML = `
        <div class="font-bold text-slate-800 dark:text-slate-200 truncate" title="${itemName}">${isScroll ? '📜 ' : '🧩 '}${itemName}</div>
        <div class="text-3xs text-slate-500">${isScroll ? 'Recipe Fragment' : 'Gear Fragment'} • ${fragItem.count} fragments</div>
      `;
      leftWrap.append(infoDiv);
      fragRow.append(leftWrap);

      const craftBtn = document.createElement('button');
      craftBtn.type = 'button';
      craftBtn.className = 'px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-2xs font-bold cursor-pointer transition-all shrink-0';
      craftBtn.textContent = 'Craft';
      craftBtn.title = isScroll ? `Craft recipe fragment #${fragItem.id}` : `Craft gear fragment #${fragItem.id}`;
      craftBtn.addEventListener('click', () => {
        craftBtn.disabled = true;
        craftBtn.textContent = '⏳';
        chrome.runtime?.sendMessage?.(
          { kind: 'craft-fragment', type: fragItem.type, libId: Number(fragItem.id), amount: 1 },
          (res) => {
            if (chrome.runtime?.lastError) {
              craftBtn.disabled = false;
              craftBtn.textContent = 'Error';
              return;
            }
            setTimeout(() => {
              if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
            }, 600);
          }
        );
      });
      fragRow.append(craftBtn);
      fragsGrid.append(fragRow);
    }
    fragsSection.append(fragsGrid);
  } else {
    const emptyFrags = document.createElement('div');
    emptyFrags.className = 'text-2xs text-slate-400 italic py-2 text-center bg-slate-50/50 dark:bg-slate-800/40 rounded-lg';
    emptyFrags.textContent = 'No gear fragments in inventory (raid campaign missions to obtain fragments)';
    fragsSection.append(emptyFrags);
  }
  craftCard.append(fragsSection);

  // Manual Craft Toolbar
  const manualCraftRow = document.createElement('div');
  manualCraftRow.className = 'pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5';
  manualCraftRow.innerHTML = `
    <div class="text-2xs font-semibold text-slate-600 dark:text-slate-400">Manual Craft by Item ID:</div>
  `;

  const manualForm = document.createElement('div');
  manualForm.className = 'flex items-center gap-2 flex-wrap';

  const craftInput = document.createElement('input');
  craftInput.type = 'number';
  craftInput.placeholder = 'Enter Item ID (e.g. 57, 146)...';
  craftInput.className = 'w-44 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-400';
  manualForm.append(craftInput);

  const craftFragBtn = document.createElement('button');
  craftFragBtn.type = 'button';
  craftFragBtn.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer';
  craftFragBtn.textContent = 'Craft Gear Fragment';
  craftFragBtn.addEventListener('click', () => {
    const val = Number(craftInput.value);
    if (!val) return;
    chrome.runtime?.sendMessage?.({ kind: 'craft-fragment', type: 'gear', libId: val, amount: 1 }, () => {
      if (chrome.runtime?.lastError) return;
      setTimeout(() => {
        if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
      }, 600);
    });
  });

  const craftScrollBtn = document.createElement('button');
  craftScrollBtn.type = 'button';
  craftScrollBtn.className = 'px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer';
  craftScrollBtn.textContent = 'Craft Recipe Fragment';
  craftScrollBtn.addEventListener('click', () => {
    const val = Number(craftInput.value);
    if (!val) return;
    chrome.runtime?.sendMessage?.({ kind: 'craft-fragment', type: 'scroll', libId: val, amount: 1 }, () => {
      if (chrome.runtime?.lastError) return;
      setTimeout(() => {
        if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
      }, 600);
    });
  });

  const craftRecipeBtn = document.createElement('button');
  craftRecipeBtn.type = 'button';
  craftRecipeBtn.className = 'px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer';
  craftRecipeBtn.textContent = 'Craft Gear Recipe';
  craftRecipeBtn.addEventListener('click', () => {
    const val = Number(craftInput.value);
    if (!val) return;
    chrome.runtime?.sendMessage?.({ kind: 'craft-recipe', libId: val, amount: 1 }, () => {
      if (chrome.runtime?.lastError) return;
      setTimeout(() => {
        if (typeof currentCache !== 'undefined') renderCampaignDialog(currentCache, target);
      }, 600);
    });
  });

  manualForm.append(craftFragBtn, craftScrollBtn, craftRecipeBtn);
  manualCraftRow.append(manualForm);
  craftCard.append(manualCraftRow);

  container.append(craftCard);
  target.append(container);
}

function openCampaignDialog(options = null, cache = currentCache) {
  let missionId = null;
  let gearId = null;
  if (typeof options === 'number') {
    missionId = options;
  } else if (options && typeof options === 'object') {
    missionId = options.missionId;
    gearId = options.gearId;
  }

  if (gearId != null) {
    selectedFarmGearId = Number(gearId) || null;
    const tree = buildGearRecipeTree(selectedFarmGearId, cache);
    const unfulfilled = findFirstUnfulfilledNode(tree);
    selectedRecipeNodeId = unfulfilled ? unfulfilled.id : (tree ? tree.id : null);

    if (selectedRecipeNodeId) {
      const candidates = globalThis.hwaHelperCampaignMissions?.getMissionsForItem?.(selectedRecipeNodeId) || [];
      const highest = globalThis.hwaHelperCampaignMissions?.getHighestRaidableMission?.(
        candidates.map((m) => m.id),
        cache?.missionGetAll?.data
      );
      if (highest) {
        selectedCampaignMissionId = highest;
      }
    }
  } else if (missionId != null) {
    selectedCampaignMissionId = Number(missionId) || 135;
  }

  const dialog = document.querySelector('#campaign-dialog');
  if (!dialog) return;
  renderCampaignDialog(cache);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function openHeroDialog(heroId, cache = currentCache) {
  const dialog = document.querySelector('#hero-dialog');
  if (!dialog) return;
  renderHeroDialog(heroId, cache);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function setupBuildingAndResearchDialogs() {
  const buildingBadge = document.querySelector('#building-badge');
  const buildingDialog = document.querySelector('#building-dialog');
  const researchBadge = document.querySelector('#research-badge');
  const researchDialog = document.querySelector('#research-dialog');
  const questDetailDialog = document.querySelector('#quest-detail-dialog');
  const heroDialog = document.querySelector('#hero-dialog');
  const campaignDialog = document.querySelector('#campaign-dialog');

  if (buildingBadge && buildingDialog) {
    const openBuilding = () => {
      renderBuildingDialog(currentCache);
      if (typeof buildingDialog.showModal === 'function') {
        buildingDialog.showModal();
      } else {
        buildingDialog.setAttribute('open', '');
      }
    };
    buildingBadge.addEventListener('click', openBuilding);
    buildingBadge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBuilding();
      }
    });
  }

  if (researchBadge && researchDialog) {
    const openResearch = () => {
      renderResearchDialog(currentCache);
      if (typeof researchDialog.showModal === 'function') {
        researchDialog.showModal();
      } else {
        researchDialog.setAttribute('open', '');
      }
    };
    researchBadge.addEventListener('click', openResearch);
    researchBadge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openResearch();
      }
    });
  }

  for (const dlg of [buildingDialog, researchDialog, questDetailDialog, heroDialog, campaignDialog]) {
    dlg?.addEventListener('click', (e) => {
      if (e.target === dlg) {
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
      }
    });
  }
}

globalThis.renderBuildingDialog = renderBuildingDialog;
globalThis.renderResearchDialog = renderResearchDialog;
globalThis.renderHeroDialog = renderHeroDialog;
globalThis.openHeroDialog = openHeroDialog;
globalThis.renderCampaignDialog = renderCampaignDialog;
globalThis.openCampaignDialog = openCampaignDialog;
globalThis.renderQuestDetailDialog = renderQuestDetailDialog;
globalThis.openQuestDetailDialog = openQuestDetailDialog;
globalThis.getDetailedQuests = getDetailedQuests;
globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;

async function render() {
  const [stored, session] = await Promise.all([
    chrome.storage.local.get([CACHE_KEY, 'buildingQueue', 'researchQueue', 'resourceSelection', 'guildChatLastReadTime', 'favoriteHeroes', 'favoriteTitans', 'tabConfig', 'autoClaimSettings', 'autoGatherSettings', 'priorityAutoJoin', 'popupRpcEnabled', 'claimRpcStatus', 'socketRefreshMode', 'captureSettings', 'rpcQueueStatus', 'customTeams', 'raidPreferences', 'raidQueue', 'monsterPreferences', 'monsterQueue', 'troopCapacitySettings', 'towerAutomationSettings', 'towerRun', 'dungeonAutomationSettings', 'dungeonRun', 'rpcMqttTelemetry', 'rpcMqttTriggerStatus', 'cachedGameVersion', 'campaignRaidSequential']), chrome.storage.session.get(['recordingState', 'cachedGameVersion'])
  ]);
  const cache = stored[CACHE_KEY] || {};
  if (stored.autoGatherSettings) {
    currentAutoGatherSettings = globalThis.hwaHelperAutoGather?.normalizeAutoGatherSettings?.(stored.autoGatherSettings) || stored.autoGatherSettings;
  }
  if (stored.campaignRaidSequential !== undefined) campaignRaidSequential = stored.campaignRaidSequential === true;
  if (stored.buildingQueue) currentBuildingQueue = stored.buildingQueue;
  if (stored.researchQueue) currentResearchQueue = stored.researchQueue;
  currentCache = cache;
  render.customTeams = stored.customTeams?.[String(cache.accountStatus?.data?.id)] || [];
  towerRunState = stored.towerRun || null;
  dungeonRunState = stored.dungeonRun || null;
  const towerAccountId = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id ?? null;
  if (towerSettingsLoadedFor !== String(towerAccountId)) {
    towerAutomationSettings = String(stored.towerAutomationSettings?.accountId) === String(towerAccountId) ?
      stored.towerAutomationSettings : { accountId: towerAccountId, buffPriority: [] };
    towerSettingsLoadedFor = String(towerAccountId);
  }
  const dungeonAccountId = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id ?? null;
  if (dungeonSettingsLoadedFor !== String(dungeonAccountId)) {
    const saved = stored.dungeonAutomationSettings;
    const defaultPools = globalThis.hwaHelperDungeonAutomation?.DEFAULT_TITAN_POOLS || {
      water: [4000, 4001, 4052, 4004, 4002, 4003],
      earth: [4020, 4022, 4024, 4023, 4021],
      fire: [4010, 4011, 4013, 4012, 4014, 4051],
      neutral: [4000, 4001, 4052, 4004, 4002, 4020, 4023, 4013, 4022, 4021, 4010, 4011, 4012, 4053]
    };
    if (saved && String(saved.accountId) === String(dungeonAccountId)) {
      dungeonAutomationSettings = {
        accountId: dungeonAccountId,
        attackerPriority: Array.isArray(saved.attackerPriority) && saved.attackerPriority.length
          ? [...saved.attackerPriority]
          : ['water', 'neutral', 'earth', 'fire'],
        pools: {
          water: Array.isArray(saved.pools?.water) ? [...saved.pools.water] : [...defaultPools.water],
          earth: Array.isArray(saved.pools?.earth) ? [...saved.pools.earth] : [...defaultPools.earth],
          fire: Array.isArray(saved.pools?.fire) ? [...saved.pools.fire] : [...defaultPools.fire],
          neutral: Array.isArray(saved.pools?.neutral)
            ? [...saved.pools.neutral]
            : (Array.isArray(saved.pools?.mixed) ? [...saved.pools.mixed] : [...defaultPools.neutral])
        }
      };
    } else {
      dungeonAutomationSettings = {
        accountId: dungeonAccountId,
        attackerPriority: ['water', 'neutral', 'earth', 'fire'],
        pools: {
          water: [...defaultPools.water],
          earth: [...defaultPools.earth],
          fire: [...defaultPools.fire],
          neutral: [...defaultPools.neutral]
        }
      };
    }
    dungeonSettingsLoadedFor = String(dungeonAccountId);
  }
  raidQueueState = stored.raidQueue || null;
  monsterQueueState = stored.monsterQueue || null;
  const monsterAccount = String(cache.accountStatus?.data?.id ?? '');
  if (monsterPreferencesAccount !== monsterAccount) {
    const saved = stored.monsterPreferences;
    monsterSelection.teamId = String(saved?.accountId) === monsterAccount ? saved.teamId || '' : '';
    monsterSelection.level = String(saved?.accountId) === monsterAccount &&
      Number.isInteger(saved.level) && saved.level >= 1 && saved.level <= 30 ? saved.level : 1;
    monsterSelection.count = String(saved?.accountId) === monsterAccount &&
      Number.isInteger(saved.count) && saved.count >= 2 && saved.count <= 100 ? saved.count : 2;
    monsterSelection.targetMobId = '';
    monsterPreferencesAccount = monsterAccount;
  }
  troopCapacitySettings = globalThis.hwaHelperExperimentalData?.normalizeCapacitySettings(stored.troopCapacitySettings) || troopCapacitySettings;
  if (!raidPreferencesLoaded && cache.accountStatus?.data?.id) {
    const saved = stored.raidPreferences;
    if (saved && String(saved.accountId) === String(cache.accountStatus.data.id)) {
      for (const key of ['rallyTeam', 'bossLevel', 'waitSeconds', 'minMembers', 'autoCancel', 'raidCount']) {
        if (saved[key] !== undefined) experimentalSelection[key] = saved[key];
      }
      if (!Number.isInteger(experimentalSelection.raidCount) || experimentalSelection.raidCount < 2 ||
          experimentalSelection.raidCount > 100) experimentalSelection.raidCount = 2;
      experimentalSelection.searchedBossLevel = experimentalSelection.bossLevel;
    }
    raidPreferencesLoaded = true;
  }
  popupRpcEnabled = stored.popupRpcEnabled === true;
  currentRpcPolicy = { mode: ['direct', 'mqtt-piggyback'].includes(stored.socketRefreshMode) ? stored.socketRefreshMode : 'piggyback',
    monitor: stored.captureSettings?.interceptEnabled !== false };
  renderRpcQueue(stored.rpcQueueStatus?.count || 0, currentRpcPolicy.mode);
  renderGameVersion(stored.cachedGameVersion || session?.cachedGameVersion || cache.accountStatus?.data?.version);
  claimRpcStatus = stored.claimRpcStatus || null;
  currentGuildChatLastReadTime = Number(stored.guildChatLastReadTime || 0);
  favoriteHeroes = new Set(Array.isArray(stored.favoriteHeroes) ? stored.favoriteHeroes.map(String) : []);
  favoriteTitans = new Set(Array.isArray(stored.favoriteTitans) ? stored.favoriteTitans.map(String) : []);
  currentTabConfig = normalizeTabConfig(stored.tabConfig);
  applyTabConfig(currentTabConfig);
  currentAutoClaimSettings = {
    mail: stored.autoClaimSettings?.mail !== false,
    reports: stored.autoClaimSettings?.reports !== false,
    quests: stored.autoClaimSettings?.quests !== false,
    onOpen: Boolean(stored.autoClaimSettings?.onOpen)
  };
  currentProductionRates = Object.fromEntries([1, 2, 3, 4, 5].map((id) =>
    [id, globalThis.hwaHelperProductionData.ratePerMinute(cache, id)]));
  const resources = resourceEntries(cache).filter((entry) => !['resource:refillable:62', 'resource:world-refillable:62'].includes(entry.key));
  const selectedResources = stored.resourceSelection || [];
  document.querySelector('#account-name').textContent = cache.accountStatus?.data?.name || '—';
  renderMarches(cache);
  renderAutoClaim(cache, currentAutoClaimSettings);
  renderPriorityAutoJoin(stored.priorityAutoJoin, cache, render.customTeams);
  if (popupRpcEnabled && currentAutoClaimSettings.onOpen && !hasAutoClaimedThisSession &&
      !isClaimQueued()) {
    const pending = globalThis.hwaHelperPopupData?.getPendingClaims?.(cache);
    if (pending && pending.totalCount > 0) {
      hasAutoClaimedThisSession = true;
      executeAutoClaim(cache, currentAutoClaimSettings);
    }
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
  const towerModal = document.querySelector('#tower-modal');
  if (towerModal && !towerModal.hidden) renderTowerModal(cache);
  const dungeonModal = document.querySelector('#dungeon-modal');
  if (dungeonModal && !dungeonModal.hidden) openDungeonModal(cache.dungeonStatus?.data, dungeonModalReturnFocus);
  if (document.querySelector('#raid-dialog')?.open) renderExperimental(cache, true);
  if (document.querySelector('#gather-dialog')?.open) renderExperimental(cache);
  if (document.querySelector('#monster-dialog')?.open) renderMonster(cache);
  if (document.querySelector('#building-dialog')?.open) renderBuildingDialog(cache);
  if (document.querySelector('#research-dialog')?.open) renderResearchDialog(cache);
  if (document.querySelector('#hero-dialog')?.open && currentHeroDialogId) renderHeroDialog(currentHeroDialogId, cache);
  if (document.querySelector('#quest-detail-dialog')?.open) renderQuestDetailDialog(currentQuestFilter, cache);
  if (document.querySelector('#campaign-dialog')?.open && !isCampaignRaidLoopRunning) renderCampaignDialog(cache);
  const draftModal = document.querySelector('#draft-modal');
  if (draftModal && !draftModal.hidden) {
    const modalBody = document.querySelector('#draft-modal-body');
    if (modalBody) {
      renderDraft(cache, modalBody);
    }
    const stageBadge = document.querySelector('#draft-modal-stage-badge');
    if (stageBadge) {
      stageBadge.textContent = globalThis.hwaHelperPopupData?.draftStageDescription?.(draftStatus?.stageId) || 'Draft Active';
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
  document.querySelector('#toolbar').hidden = activeTab === 'config' || activeTab === 'dashboard';
  document.querySelector('#settings-panel').hidden = activeTab !== 'config';
  view.hidden = activeTab === 'config';
  document.querySelector('#export').hidden = activeTab !== 'log';
  if (tableExportBtn && !['heroes', 'titans', 'items', 'resources', 'teams', 'other'].includes(activeTab)) {
    tableExportBtn.hidden = true;
  }
  document.querySelector('#clear').hidden = activeTab !== 'log';
  document.querySelector('#item-group-filter').hidden = activeTab !== 'items';
  const toolbarRefreshHeroesBtn = document.querySelector('#btn-toolbar-refresh-heroes');
  if (toolbarRefreshHeroesBtn) toolbarRefreshHeroesBtn.hidden = activeTab !== 'heroes';
  const heroCarrierBadge = document.querySelector('#hero-carrier-badge');
  if (heroCarrierBadge) {
    heroCarrierBadge.hidden = activeTab !== 'heroes' || stored.socketRefreshMode !== 'mqtt-piggyback';
    if (!heroCarrierBadge.hidden) {
      const last = stored.rpcMqttTelemetry?.lastCarrier;
      if (last && typeof last.delayMs === 'number') {
        const isFast = last.delayMs <= 3000;
        heroCarrierBadge.textContent = isFast ? `⚡ ${(last.delayMs / 1000).toFixed(1)}s (${last.method})` : `⏱️ ${(last.delayMs / 1000).toFixed(1)}s (${last.method})`;
        heroCarrierBadge.title = `Last carrier: ${last.method} via ${last.source} in ${last.delayMs}ms`;
        heroCarrierBadge.className = `inline-flex items-center px-2 py-1 rounded text-2xs font-medium border shrink-0 ${isFast ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`;
      } else {
        heroCarrierBadge.textContent = 'MQTT Assisted';
        heroCarrierBadge.title = 'MQTT-assisted piggyback mode active';
        heroCarrierBadge.className = 'inline-flex items-center px-2 py-1 rounded text-2xs font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0';
      }
    }
  }
  const itemsViewToggle = document.querySelector('#items-view-toggle');
  if (itemsViewToggle) itemsViewToggle.hidden = activeTab !== 'items';
  document.querySelector('#log-sort-wrap').hidden = activeTab !== 'log';
  document.querySelector('#resource-sort-wrap').hidden = activeTab !== 'resources';
  if (resourceFilterToggle) resourceFilterToggle.hidden = activeTab !== 'resources';
  document.querySelector('#search-label').textContent = activeTab === 'log' ? 'Filter endpoint' :
    activeTab === 'chat' ? 'Search message or sender' :
    activeTab === 'goals' ? 'Search goal, activity, or event' :
    activeTab === 'events' ? 'Search event name or type' : 'Search ID, name, or group';
  search.placeholder = activeTab === 'log' ? 'Filter endpoint' :
    activeTab === 'chat' ? 'Search message or sender' :
    activeTab === 'goals' ? 'Search goal, activity, or event' :
    activeTab === 'events' ? 'Search event name or type' : 'Search ID, name, or group';

  if (activeTab === 'dashboard') {
    renderDashboard(cache);
  } else if (activeTab === 'config') {
    status.textContent = 'Settings and data stored in this browser.';
    renderConfigTabs();
    renderConfigOther(cache);
    renderAutoClaim(cache, currentAutoClaimSettings);
    chrome.storage?.local?.get?.('gameEngineStatus')?.then?.((stored) => {
      renderEngineStatus(stored?.gameEngineStatus);
    });
  } else if (activeTab === 'heroes') {
    console.log('[HWA-TRACK][UI_RENDER_HEROES]', {
      time: new Date().toISOString(),
      heroCount: Object.keys(cache.heroGetAll?.data || {}).length,
      updatedAt: cache.heroGetAll?.updatedAt
    });
    showSnapshot(cache.heroGetAll, ['Hero ID', 'Name', 'Level', 'Star', 'Equipment rank', 'Soul stones', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, hero]) => {
        const { owned, needed } = globalThis.hwaHelperPopupData.heroSoulProgress(id, hero, cache.inventoryGet?.data);
        const soulStones = `${formatNumber(owned)} / ${typeof needed === 'number' ? formatNumber(needed) : needed ?? '—'}`;
        return [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(hero?.level),
          hero?.star, hero?.color, soulStones, formatNumber(hero?.power)];
      }));
  } else if (activeTab === 'items') {
    updateItemGroups(cache.inventoryGet?.data);
    updateItemsViewButtons();
    if (itemsViewMode === 'grid') {
      renderInventoryGrid(cache);
    } else {
      showSnapshot(cache.inventoryGet, ['Group', 'Item ID', 'Name', 'Amount'], (data) =>
        Object.entries(data).filter(([category]) => !itemGroup.value || category === itemGroup.value).flatMap(([category, items]) =>
          Object.entries(items ?? {}).sort(byId).map(([id, quantity]) =>
            [category, id, globalThis.hwaHelperNameMap.item(category, id) || '—', formatNumber(quantity)])));
    }
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
    renderCustomTeams(cache);
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
        'experimentalMapContext', 'experimentalRallySearch', 'experimentalSoloSearch', 'experimentalRallyHistory',
        'experimentalActionStatus', 'experimentalLastSquad', 'wheelFortuneStatus',
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


const refreshGroups = {
  all: [
    { name: 'userGetInfo' },
    { name: 'inventoryGet' },
    { name: 'heroGetAll' },
    { name: 'titanGetAll' },
    { name: 'teamGetAll' },
    { name: 'refillableGetAll', feature: 'refillable' },
    { name: 'questGetAll' },
    { name: 'getDailyQuests', feature: 'quest', args: {} },
    { name: 'getSpecialQuestState', feature: 'quest', args: {} },
    { name: 'user_getNextDayTime' },
    { name: 'missionGetAll' },
    { name: 'questGetEvents' },
    { name: 'artifact_getAll' },
    { name: 'titan_artifactGetCounters' },
    { name: 'skin_getAll' },
    { name: 'rune_getAll' },
    { name: 'arenaGetAll' },
    { name: 'clanWarGetBriefInfo' },
    { name: 'getPage', feature: 'report', args: { limit: 10, cursor: null } },
    { name: 'mailGetAll' },
    { name: 'chatGetAll', args: { chatType: 'clan' } }
  ],
  heroes: [
    { name: 'heroGetAll' }
  ],
  core: [
    { name: 'userGetInfo' },
    { name: 'inventoryGet' },
    { name: 'refillableGetAll', feature: 'refillable' }
  ],
  roster: [
    { name: 'heroGetAll' },
    { name: 'titanGetAll' },
    { name: 'inventoryGet' },
    { name: 'teamGetAll' },
    { name: 'artifact_getAll' },
    { name: 'titan_artifactGetCounters' },
    { name: 'skin_getAll' },
    { name: 'rune_getAll' }
  ],
  quests: [
    { name: 'questGetAll' },
    { name: 'getDailyQuests', feature: 'quest', args: {} },
    { name: 'getSpecialQuestState', feature: 'quest', args: {} },
    { name: 'user_getNextDayTime' },
    { name: 'missionGetAll' },
    { name: 'questGetEvents' },
    { name: 'clanWarGetBriefInfo' }
  ],
  mail: [
    { name: 'getPage', feature: 'report', args: { limit: 10, cursor: null } },
    { name: 'mailGetAll' }
  ],
  dungeon: [
    { name: 'dungeonGetInfo', args: {}, ident: 'dungeonRefresh' },
    { name: 'teamGetAll', args: {} },
    { name: 'titanGetAll', args: {} }
  ]
};

function triggerRefresh(groupKey) {
  const calls = refreshGroups[groupKey];
  if (!calls) return;
  const statusEl = document.querySelector('#config-refresh-status');
  if (!popupRpcEnabled) {
    if (statusEl) statusEl.textContent = 'Enable popup RPC calls in Settings to use quick refresh.';
    return;
  }
  const trackId = 'trk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const requestedAt = Date.now();
  console.log('[HWA-TRACK][1/6 UI_TRIGGER]', {
    trackId,
    time: new Date().toISOString(),
    groupKey,
    calls,
    popupRpcEnabled,
    dispatchMode: typeof socketRefreshMode !== 'undefined' ? socketRefreshMode : null
  });
  if (statusEl) {
    statusEl.textContent = `Requesting quick refresh (${groupKey})...`;
    statusEl.className = 'text-xs text-blue-600 font-medium';
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls, trackId, requestedAt }, (response) => {
      console.log('[HWA-TRACK][UI_TRIGGER_ACK]', {
        trackId,
        time: new Date().toISOString(),
        elapsedMs: Date.now() - requestedAt,
        response
      });
      if (chrome.runtime.lastError || !response?.ok) {
        if (statusEl) {
          statusEl.textContent = response?.error || 'No active Hero Wars tab found.';
          statusEl.className = 'text-xs text-amber-600 font-medium';
        }
      } else {
        if (statusEl) {
          const time = new Date().toLocaleTimeString();
          statusEl.textContent = response.queued ?
            `Quick refresh queued at ${time}; waiting for native game RPC carrier.` :
            `Quick refresh sent at ${time}. If not updating, use Reload Game Tab.`;
          statusEl.className = 'text-xs text-emerald-600 font-medium';
        }
      }
    });
  }
}

document.querySelector('#btn-reload-game')?.addEventListener('click', () => {
  const statusEl = document.querySelector('#config-refresh-status');
  if (statusEl) {
    statusEl.textContent = 'Reloading game tab...';
    statusEl.className = 'text-xs text-blue-600 font-medium';
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'reload-game-tab' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        if (statusEl) {
          statusEl.textContent = response?.error || 'No active Hero Wars tab found.';
          statusEl.className = 'text-xs text-amber-600 font-medium';
        }
      } else {
        if (statusEl) {
          statusEl.textContent = 'Game tab reloaded. New snapshots will load automatically.';
          statusEl.className = 'text-xs text-emerald-600 font-medium';
        }
      }
    });
  }
});

document.querySelector('#btn-refresh-all')?.addEventListener('click', () => triggerRefresh('all'));
document.querySelector('#btn-refresh-heroes')?.addEventListener('click', () => triggerRefresh('heroes'));
document.querySelector('#btn-toolbar-refresh-heroes')?.addEventListener('click', () => triggerRefresh('heroes'));
document.querySelector('#btn-refresh-core')?.addEventListener('click', () => triggerRefresh('core'));
document.querySelector('#btn-refresh-roster')?.addEventListener('click', () => triggerRefresh('roster'));
document.querySelector('#btn-refresh-quests')?.addEventListener('click', () => triggerRefresh('quests'));
document.querySelector('#btn-refresh-mail')?.addEventListener('click', () => triggerRefresh('mail'));
document.querySelector('#mail-badge')?.addEventListener('click', () => triggerRefresh('mail'));

function renderAutoClaim(cache, settings = currentAutoClaimSettings) {
  const pending = globalThis.hwaHelperPopupData?.getPendingClaims?.(cache) || { letterIds: [], hasReports: false, questIds: [], totalCount: 0 };

  const mailCountEl = document.querySelector('#autoclaim-count-mail');
  const reportsCountEl = document.querySelector('#autoclaim-count-reports');
  const questsCountEl = document.querySelector('#autoclaim-count-quests');
  const pendingBadgeEl = document.querySelector('#autoclaim-pending-badge');
  const claimBtn = document.querySelector('#btn-claim-all');
  const claimCountEl = document.querySelector('#btn-claim-count');
  const optMail = document.querySelector('#autoclaim-opt-mail');
  const optReports = document.querySelector('#autoclaim-opt-reports');
  const optQuests = document.querySelector('#autoclaim-opt-quests');
  const optOnOpen = document.querySelector('#autoclaim-opt-on-open');

  if (mailCountEl) mailCountEl.textContent = String(pending.letterIds.length);
  if (reportsCountEl) reportsCountEl.textContent = String(pending.hasReports ? 1 : 0);
  if (questsCountEl) questsCountEl.textContent = String(pending.questIds.length);

  const selectedCount = (settings.mail ? pending.letterIds.length : 0) +
    (settings.reports && pending.hasReports ? 1 : 0) +
    (settings.quests ? pending.questIds.length : 0);

  if (pendingBadgeEl) {
    pendingBadgeEl.textContent = `${pending.totalCount} Ready`;
    if (pending.totalCount > 0) {
      pendingBadgeEl.className = 'rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800';
    } else {
      pendingBadgeEl.className = 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500';
    }
  }

  if (claimCountEl) claimCountEl.textContent = String(selectedCount);
  if (claimBtn) {
    claimBtn.disabled = selectedCount === 0 || !popupRpcEnabled || isClaimQueued();
  }

  const statusEl = document.querySelector('#autoclaim-status');
  const statusAge = Date.now() - Date.parse(claimRpcStatus?.updatedAt || '');
  if (statusEl && claimRpcStatus?.state === 'queued' && isClaimQueued()) {
    statusEl.textContent = 'Queued for the next game RPC.';
    statusEl.className = 'text-xs text-blue-600 font-medium';
  } else if (statusEl && claimRpcStatus?.state === 'queued' && statusAge >= 120000) {
    statusEl.textContent = 'Queued claim expired. Retry the claim.';
    statusEl.className = 'text-xs text-rose-600 font-medium';
  } else if (statusEl && claimRpcStatus?.state === 'complete' && statusAge < 10000) {
    statusEl.textContent = 'Claim RPC completed. Rewards are syncing.';
    statusEl.className = 'text-xs text-emerald-600 font-medium';
  } else if (statusEl && claimRpcStatus?.state === 'failed' && statusAge < 120000) {
    statusEl.textContent = claimRpcStatus.error || 'Reward claim RPC failed.';
    statusEl.className = 'text-xs text-rose-600 font-medium';
  }

  if (optMail && optMail.checked !== Boolean(settings.mail)) optMail.checked = Boolean(settings.mail);
  if (optReports && optReports.checked !== Boolean(settings.reports)) optReports.checked = Boolean(settings.reports);
  if (optQuests && optQuests.checked !== Boolean(settings.quests)) optQuests.checked = Boolean(settings.quests);
  if (optOnOpen && optOnOpen.checked !== Boolean(settings.onOpen)) optOnOpen.checked = Boolean(settings.onOpen);
}

function isClaimQueued() {
  return claimRpcStatus?.state === 'queued' &&
    Date.now() - Date.parse(claimRpcStatus.updatedAt || '') < 120000;
}

function executeAutoClaim(cache = currentCache, settings = currentAutoClaimSettings) {
  if (!popupRpcEnabled) {
    const statusEl = document.querySelector('#autoclaim-status');
    if (statusEl) statusEl.textContent = 'Enable popup RPC calls in Settings to claim rewards.';
    return;
  }
  if (isClaimQueued()) return;
  const { calls, pending } = globalThis.hwaHelperPopupData?.buildAutoClaimCalls?.(cache, settings) || { calls: [], pending: { totalCount: 0 } };
  if (!calls || calls.length === 0) return;

  const claimBtn = document.querySelector('#btn-claim-all');
  const statusEl = document.querySelector('#autoclaim-status');
  const labelEl = claimBtn?.querySelector('span') || claimBtn?.firstElementChild || claimBtn;
  if (claimBtn) {
    claimBtn.disabled = true;
    if (labelEl) labelEl.textContent = '⏳ Claiming...';
  }
  if (statusEl) {
    statusEl.textContent = 'Dispatching claims...';
    statusEl.className = 'text-xs text-blue-600 font-medium';
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'claim-rewards', calls }, (response) => {
      if (claimBtn && labelEl) {
        labelEl.textContent = '🎁 Claim Selected Rewards';
      }
      if (chrome.runtime.lastError || !response?.ok) {
        if (statusEl) {
          statusEl.textContent = response?.error || 'Game tab not reachable.';
          statusEl.className = 'text-xs text-rose-600 font-medium';
        }
        if (claimBtn) claimBtn.disabled = false;
      } else if (response.queued) {
        claimRpcStatus = { state: 'queued', updatedAt: new Date().toISOString() };
        if (statusEl) {
          statusEl.textContent = 'Queued for the next game RPC.';
          statusEl.className = 'text-xs text-blue-600 font-medium';
        }
        if (claimBtn) claimBtn.disabled = true;
      } else {
        claimRpcStatus = null;
        // Optimistically update cache and UI
        try {
          if (settings.mail && cache.mailStatus?.data) {
            cache.mailStatus.data.lettersCount = 0;
            if (Array.isArray(cache.mailStatus.data.letters)) {
              for (const l of cache.mailStatus.data.letters) {
                if (pending.letterIds.includes(l.id ?? l.letterId)) {
                  l.claimed = true;
                  l.rewardReceived = true;
                  l.rewardClaimed = true;
                }
              }
            }
          }
          if (settings.mail && cache.mailGetAll?.data) {
            const list = Array.isArray(cache.mailGetAll.data) ? cache.mailGetAll.data : cache.mailGetAll.data.letters;
            if (Array.isArray(list)) {
              for (const l of list) {
                if (pending.letterIds.includes(l.id ?? l.letterId)) {
                  l.claimed = true;
                  l.rewardReceived = true;
                  l.rewardClaimed = true;
                }
              }
            }
          }
          if (settings.reports && cache.mailStatus?.data) {
            cache.mailStatus.data.hasUnclaimed = false;
            cache.mailStatus.data.totalUnclaimed = 0;
            cache.mailStatus.data.unclaimedReportsCount = 0;
          }
          if (settings.quests && cache.questGetAll?.data) {
            const qList = Array.isArray(cache.questGetAll.data) ? cache.questGetAll.data : [];
            for (const q of qList) {
              if (pending.questIds.includes(q.id)) {
                q.state = 3;
              }
            }
          }
          if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
            chrome.storage.local.set({ [CACHE_KEY]: cache });
          }
        } catch (_) {}

        renderAutoClaim(cache, settings);
        try {
          if (typeof renderMailBadge === 'function') renderMailBadge(cache);
        } catch (_) {}

        if (statusEl) {
          const totalClaimed = (settings.mail ? pending.letterIds.length : 0) +
            (settings.reports && pending.hasReports ? 1 : 0) +
            (settings.quests ? pending.questIds.length : 0);
          statusEl.textContent = `Claimed ${totalClaimed} rewards! Syncing...`;
          statusEl.className = 'text-xs text-emerald-600 font-medium';
          if (typeof setTimeout === 'function') {
            setTimeout(() => {
              if (statusEl && statusEl.textContent.includes('Syncing')) {
                statusEl.textContent = 'Idle';
                statusEl.className = 'text-slate-500 italic';
              }
            }, 3500);
          }
        }
      }
    });
  }
}

function setupAutoClaimListeners() {
  const saveSettings = async () => {
    const optMail = document.querySelector('#autoclaim-opt-mail');
    const optReports = document.querySelector('#autoclaim-opt-reports');
    const optQuests = document.querySelector('#autoclaim-opt-quests');
    const optOnOpen = document.querySelector('#autoclaim-opt-on-open');

    currentAutoClaimSettings = {
      mail: optMail ? optMail.checked : true,
      reports: optReports ? optReports.checked : true,
      quests: optQuests ? optQuests.checked : true,
      onOpen: optOnOpen ? optOnOpen.checked : false
    };

    renderAutoClaim(currentCache, currentAutoClaimSettings);
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ autoClaimSettings: currentAutoClaimSettings });
    }
  };

  document.querySelector('#autoclaim-opt-mail')?.addEventListener('change', saveSettings);
  document.querySelector('#autoclaim-opt-reports')?.addEventListener('change', saveSettings);
  document.querySelector('#autoclaim-opt-quests')?.addEventListener('change', saveSettings);
  document.querySelector('#autoclaim-opt-on-open')?.addEventListener('change', saveSettings);

  document.querySelector('#btn-claim-all')?.addEventListener('click', () => {
    executeAutoClaim(currentCache, currentAutoClaimSettings);
  });
}

function renderPriorityAutoJoin(settings, cache = (typeof currentCache !== 'undefined' ? currentCache : null), customTeams = (typeof render !== 'undefined' ? render.customTeams : [])) {
  const chk = document.querySelector('#setting-priority-autojoin-enabled');
  const num = document.querySelector('#setting-priority-autojoin-min-level');
  const teamSelect = document.querySelector('#setting-priority-autojoin-team');
  const badge = document.querySelector('#priority-autojoin-status');
  if (chk) chk.checked = Boolean(settings?.enabled);
  if (num && settings?.minLevel != null) num.value = settings.minLevel;
  if (badge) {
    badge.textContent = settings?.enabled ? `Active (≥ Lv${settings.minLevel ?? 10})` : 'Disabled';
  }
  if (teamSelect) {
    const data = globalThis.hwaHelperExperimentalData;
    const heroes = cache?.heroGetAll?.data || {};
    const summary = cache?.['getUnitSummary:unit']?.data;
    const marches = cache?.marchStatus?.data?.marches;
    const available = data?.availableHeroIds ? data.availableHeroIds(heroes, summary, marches) : Object.keys(heroes).map(Number);
    const teams = data?.autoJoinTeamOptions ?
      data.autoJoinTeamOptions(cache?.teamGetAll?.data, heroes, customTeams || [], available) :
      [{ id: 'highest', label: '⭐ Top 5 highest power heroes (Default)' }];

    const selectedTeamId = settings?.teamId || 'highest';
    if (typeof document.createElement === 'function') {
      teamSelect.replaceChildren?.();
      for (const team of teams) {
        const opt = document.createElement('option');
        opt.value = team.id;
        opt.textContent = team.label;
        if (team.id === selectedTeamId) opt.selected = true;
        teamSelect.append?.(opt);
      }
    }
    if (teams.some((t) => t.id === selectedTeamId)) {
      teamSelect.value = selectedTeamId;
    } else {
      teamSelect.value = 'highest';
    }
  }
}

function setupPriorityAutoJoinListeners() {
  const chk = document.querySelector('#setting-priority-autojoin-enabled');
  const num = document.querySelector('#setting-priority-autojoin-min-level');
  const teamSelect = document.querySelector('#setting-priority-autojoin-team');
  const save = async () => {
    const enabled = Boolean(chk?.checked);
    const minLevel = Math.max(1, Math.min(30, parseInt(num?.value, 10) || 10));
    const teamId = teamSelect?.value || 'highest';
    if (num) num.value = minLevel;

    let heroIds = null;
    const data = globalThis.hwaHelperExperimentalData;
    const cache = typeof currentCache !== 'undefined' ? currentCache : null;
    const customTeams = typeof render !== 'undefined' ? render.customTeams : [];
    const heroes = cache?.heroGetAll?.data || {};
    const summary = cache?.['getUnitSummary:unit']?.data;
    const marches = cache?.marchStatus?.data?.marches;
    const available = data?.availableHeroIds ? data.availableHeroIds(heroes, summary, marches) : Object.keys(heroes).map(Number);
    const teams = data?.autoJoinTeamOptions ?
      data.autoJoinTeamOptions(cache?.teamGetAll?.data, heroes, customTeams || [], available) : [];
    const matched = teams.find((t) => t.id === teamId);
    if (matched && Array.isArray(matched.heroIds)) {
      heroIds = matched.heroIds;
    }

    const nextSettings = { enabled, minLevel, teamId, ...(heroIds ? { heroIds } : {}) };
    renderPriorityAutoJoin(nextSettings, cache, customTeams);
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ priorityAutoJoin: nextSettings });
    }
  };
  chk?.addEventListener('change', save);
  num?.addEventListener('change', save);
  teamSelect?.addEventListener('change', save);
}

globalThis.renderPriorityAutoJoin = renderPriorityAutoJoin;
globalThis.setupPriorityAutoJoinListeners = setupPriorityAutoJoinListeners;

function renderEngineStatus(status) {
  const badgeEl = document.querySelector('#engine-status-badge');
  const instanceEl = document.querySelector('#engine-unity-instance');
  const sendMsgEl = document.querySelector('#engine-send-message');
  const rpcHeadersEl = document.querySelector('#engine-rpc-headers');

  if (!badgeEl || !instanceEl || !sendMsgEl || !rpcHeadersEl) return;

  if (!status) {
    badgeEl.textContent = 'Standby';
    badgeEl.className = 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600';
    instanceEl.textContent = 'Waiting for game tab...';
    instanceEl.className = 'font-medium text-slate-500';
    sendMsgEl.textContent = 'Unknown';
    sendMsgEl.className = 'font-medium text-slate-500';
    rpcHeadersEl.textContent = 'None detected';
    rpcHeadersEl.className = 'font-medium text-slate-500';
    return;
  }

  if (status.ready) {
    badgeEl.textContent = 'Connected';
    badgeEl.className = 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800';
    instanceEl.textContent = 'Active (In-Page WebGL)';
    instanceEl.className = 'font-medium text-emerald-700';
  } else if (status.hasCanvas && status.hasRpcHeaders) {
    badgeEl.textContent = 'Active (RPC Bridge)';
    badgeEl.className = 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800';
    instanceEl.textContent = 'Game Canvas Active (RPC Auth Connected)';
    instanceEl.className = 'font-medium text-emerald-700';
  } else if (status.hasCanvas) {
    badgeEl.textContent = 'Canvas Ready';
    badgeEl.className = 'rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800';
    instanceEl.textContent = 'Canvas detected, awaiting RPC traffic...';
    instanceEl.className = 'font-medium text-blue-700';
  } else {
    badgeEl.textContent = 'Waiting';
    badgeEl.className = 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800';
    instanceEl.textContent = 'Game tab loading or not found';
    instanceEl.className = 'font-medium text-amber-700';
  }

  if (status.hasSendMessage) {
    sendMsgEl.textContent = 'Available (unityInstance.SendMessage)';
    sendMsgEl.className = 'font-medium text-emerald-700';
  } else if (status.ready) {
    sendMsgEl.textContent = 'Not exposed by WebGL build';
    sendMsgEl.className = 'font-medium text-slate-500';
  } else if (status.hasCanvas && status.hasRpcHeaders) {
    sendMsgEl.textContent = 'Not exposed by WebGL (RPC Dispatch active)';
    sendMsgEl.className = 'font-medium text-slate-500';
  } else {
    sendMsgEl.textContent = status.hasCanvas ? 'Checking...' : 'Standby';
    sendMsgEl.className = 'font-medium text-slate-500';
  }

  if (status.hasRpcHeaders) {
    rpcHeadersEl.textContent = 'Active (Auth headers captured)';
    rpcHeadersEl.className = 'font-medium text-emerald-700';
  } else if (status.rpcUrlAvailable) {
    rpcHeadersEl.textContent = 'RPC URL detected (needs refresh)';
    rpcHeadersEl.className = 'font-medium text-amber-600';
  } else {
    rpcHeadersEl.textContent = 'None detected (reload game tab)';
    rpcHeadersEl.className = 'font-medium text-slate-500';
  }
}

document.querySelector('#btn-ping-engine')?.addEventListener('click', () => {
  const resultEl = document.querySelector('#engine-ping-result');
  if (resultEl) {
    resultEl.textContent = 'Pinging game tab...';
    resultEl.className = 'text-xs text-blue-600 font-medium';
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'engine-ping' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        if (resultEl) {
          resultEl.textContent = response?.error || 'No active Hero Wars tab found.';
          resultEl.className = 'text-xs text-amber-600 font-medium';
        }
      } else {
        if (resultEl) {
          const time = new Date().toLocaleTimeString();
          resultEl.textContent = `Ping sent at ${time}`;
          resultEl.className = 'text-xs text-emerald-600 font-medium';
        }
        chrome.storage?.local?.get?.('gameEngineStatus')?.then?.((res) => {
          if (res?.gameEngineStatus) renderEngineStatus(res.gameEngineStatus);
        });
      }
    });
  }
});

document.querySelector('#btn-reset-tabs')?.addEventListener('click', async () => {
  currentTabConfig = DEFAULT_TAB_CONFIG.map((t) => ({ id: t.id, visible: true }));
  await saveTabConfig(currentTabConfig);
  applyTabConfig(currentTabConfig);
  renderConfigTabs();
});

document.querySelector('#clear-cache').addEventListener('click', async () => {
  await chrome.storage.local.remove(CACHE_KEY);
  await render();
});

async function renderSettings() {
  const stored = await chrome.storage.local.get(['captureSettings', 'popupRpcEnabled',
    'socketRefreshMode', 'rpcMqttTriggerStatus', 'rpcMqttTelemetry', 'troopCapacitySettings', 'theme']);
  const capacities = globalThis.hwaHelperExperimentalData?.normalizeCapacitySettings(stored.troopCapacitySettings) || { defaultHero: 600, base: 950 };
  for (const [id, key] of [['default-hero-troop-capacity', 'defaultHero'], ['base-troop-capacity', 'base']]) {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = String(capacities[key]);
  }
  const themeSelect = document.querySelector('#setting-theme');
  if (themeSelect) themeSelect.value = stored.theme || 'dark';
  document.querySelector('#intercept-enabled').checked = stored.captureSettings?.interceptEnabled !== false;
  document.querySelector('#popup-rpc-enabled').checked = stored.popupRpcEnabled === true;
  document.querySelector('#socket-refresh-mode').value =
    ['direct', 'mqtt-piggyback'].includes(stored.socketRefreshMode) ? stored.socketRefreshMode : 'piggyback';

  const triggerPanel = document.querySelector('#mqtt-trigger-panel');
  const triggerStatus = document.querySelector('#mqtt-trigger-status');
  const triggerBadge = document.querySelector('#mqtt-trigger-badge');
  const telemetryLast = document.querySelector('#mqtt-telemetry-last');
  const telemetryStats = document.querySelector('#mqtt-telemetry-stats');
  const isMqttMode = stored.socketRefreshMode === 'mqtt-piggyback';

  if (triggerPanel) triggerPanel.hidden = !isMqttMode;
  else if (triggerStatus) triggerStatus.hidden = !isMqttMode;

  const status = stored.rpcMqttTriggerStatus;
  const telemetry = stored.rpcMqttTelemetry || { fastCarrierCount: 0, fallbackCarrierCount: 0, lastCarrier: null };

  if (isMqttMode) {
    const messages = {
      triggered: status?.nudgeType === 'user' ? 'User push delivered locally. Waiting for game carrier RPC.' :
        status?.nudgeType === 'multi' ? 'Map + user push delivered locally. Waiting for game carrier RPC.' :
        'Local map update delivered. Waiting for game carrier RPC.',
      'carrier-attached': status?.carrierSource?.startsWith('fast') ?
        `Fast carrier attached (${status.carrierMethod || 'getChunks'} in ${status.carrierDelayMs ? (status.carrierDelayMs / 1000).toFixed(2) + 's' : '<3s'}).` :
        `Fallback carrier attached (${status?.carrierMethod || 'periodic'} after ${status?.carrierDelayMs ? (status.carrierDelayMs / 1000).toFixed(2) + 's' : 'delay'}).`,
      'waiting-template': 'Waiting for MQTT template. Open the world map or wait for user push in game.',
      'expired-template': 'MQTT template expired. Waiting for a fresh game push.',
      'socket-closed': 'MQTT connection is closed. Queued calls wait for native game traffic.',
      cooldown: 'MQTT trigger is cooling down; queued calls still wait for native game traffic.',
      disabled: 'MQTT trigger requires Monitor API, popup RPC and MQTT-assisted mode.',
      error: 'Could not deliver local MQTT update. Queued calls wait for native game traffic.'
    };
    if (triggerStatus) {
      triggerStatus.textContent = messages[status?.state] ||
        'Uses recent MQTT updates to request a native carrier. Fallback piggybacks on periodic game RPCs.';
    }
    if (triggerBadge) {
      const badges = {
        triggered: { text: 'Nudge Sent', bg: 'bg-yellow-100 text-yellow-800' },
        'carrier-attached': status?.carrierSource?.startsWith('fast') ?
          { text: 'Fast Carrier ⚡', bg: 'bg-green-100 text-green-800' } :
          { text: 'Fallback Carrier ⏱️', bg: 'bg-blue-100 text-blue-800' },
        'waiting-template': { text: 'Waiting Push', bg: 'bg-slate-200 text-slate-700' },
        'expired-template': { text: 'Expired', bg: 'bg-orange-100 text-orange-800' },
        'socket-closed': { text: 'Disconnected', bg: 'bg-red-100 text-red-800' },
        cooldown: { text: 'Cooldown', bg: 'bg-amber-100 text-amber-800' },
        disabled: { text: 'Disabled', bg: 'bg-slate-200 text-slate-500' }
      };
      const badge = badges[status?.state] || { text: 'Idle', bg: 'bg-slate-200 text-slate-700' };
      triggerBadge.textContent = badge.text;
      triggerBadge.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${badge.bg}`;
    }
    if (telemetryLast) {
      if (telemetry.lastCarrier) {
        const sec = typeof telemetry.lastCarrier.delayMs === 'number' ? `${(telemetry.lastCarrier.delayMs / 1000).toFixed(2)}s` : '-';
        telemetryLast.textContent = `Last carrier: ${telemetry.lastCarrier.method} (${sec} · ${telemetry.lastCarrier.source})`;
      } else {
        telemetryLast.textContent = 'Last carrier: None';
      }
    }
    if (telemetryStats) {
      telemetryStats.textContent = `Fast: ${telemetry.fastCarrierCount || 0} · Fallback: ${telemetry.fallbackCarrierCount || 0}`;
    }
  }
}

for (const [id, key] of [['default-hero-troop-capacity', 'defaultHero'], ['base-troop-capacity', 'base']]) {
  document.querySelector(`#${id}`)?.addEventListener('change', (event) => {
    const count = Number(event.currentTarget.value);
    if (!event.currentTarget.value.trim() || !Number.isSafeInteger(count) || count < (key === 'base' ? 0 : 1) || count > 1000000) {
      event.currentTarget.reportValidity?.(); return;
    }
    settingsPending = settingsPending.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get('troopCapacitySettings');
      const settings = globalThis.hwaHelperExperimentalData.normalizeCapacitySettings(stored.troopCapacitySettings);
      await chrome.storage.local.set({ troopCapacitySettings: { ...settings, [key]: count } });
    });
    settingsPending.catch(() => { status.textContent = 'Could not save troop capacity settings.'; });
  });
}

document.querySelector('#setting-theme')?.addEventListener('change', async (event) => {
  const selectedTheme = ['dark', 'light', 'system'].includes(event.currentTarget.value) ? event.currentTarget.value : 'dark';
  await chrome.storage.local.set({ theme: selectedTheme });
  applyTheme(selectedTheme);
});

document.querySelector('#socket-refresh-mode').addEventListener('change', async (event) => {
  const newMode = ['direct', 'mqtt-piggyback'].includes(event.currentTarget.value) ? event.currentTarget.value : 'piggyback';
  currentRpcPolicy = { ...currentRpcPolicy, mode: newMode };
  renderRpcQueue(undefined, newMode);
  await chrome.storage.local.set({ socketRefreshMode: newMode });
});

document.querySelector('#popup-rpc-enabled').addEventListener('change', async (event) => {
  await chrome.storage.local.set({ popupRpcEnabled: event.currentTarget.checked });
  await render();
});

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
    if ('theme' in changes) {
      applyTheme(changes.theme.newValue || 'dark');
      renderSettings();
    }
    if ('rpcQueueStatus' in changes) renderRpcQueue(changes.rpcQueueStatus.newValue?.count || 0);
    if ('cachedGameVersion' in changes) renderGameVersion(changes.cachedGameVersion.newValue);
    if ('captureSettings' in changes || 'popupRpcEnabled' in changes ||
        'socketRefreshMode' in changes || 'rpcMqttTriggerStatus' in changes || 'rpcMqttTelemetry' in changes || 'troopCapacitySettings' in changes || 'theme' in changes) renderSettings();
    if ('gameEngineStatus' in changes) {
      renderEngineStatus(changes.gameEngineStatus.newValue);
      if (typeof activeTab !== 'undefined' && activeTab === 'dashboard' && typeof updateDashboardGameStatus === 'function') {
        updateDashboardGameStatus();
      }
    }
    if ('buildingQueue' in changes || 'researchQueue' in changes || 'troopCapacitySettings' in changes || 'raidQueue' in changes || 'monsterQueue' in changes || 'towerRun' in changes || 'dungeonRun' in changes || 'priorityAutoJoin' in changes || CACHE_KEY in changes || 'resourceSelection' in changes || 'tabConfig' in changes ||
        'popupRpcEnabled' in changes || 'claimRpcStatus' in changes ||
        'socketRefreshMode' in changes || 'captureSettings' in changes || 'rpcMqttTelemetry' in changes || 'rpcMqttTriggerStatus' in changes) {
      if ('dungeonRun' in changes) dungeonRunState = changes.dungeonRun.newValue || null;
      queueRender();
    }
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
setupDraftModal();
setupTowerModal();
setupFabDial();
setupAutoClaimListeners();
setupPriorityAutoJoinListeners();
setupBuildingAndResearchDialogs();
setupGuildChatInput();
setInterval(refreshTimed, 1000);


// Setup Guild Chat FAB and Panel
const chatFab = document.querySelector('#guild-chat-fab');
const chatPanel = document.querySelector('#guild-chat-panel');
const chatClose = document.querySelector('#guild-chat-close');
const chatRefresh = document.querySelector('#guild-chat-refresh');

function triggerGuildChatRefresh() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    if (chatRefresh) chatRefresh.classList.add('animate-spin');
    chrome.runtime.sendMessage({ kind: 'refresh-rpc', calls: [{ name: 'chatGetAll', args: { chatType: 'clan' } }] }, () => {
      setTimeout(() => chatRefresh?.classList?.remove('animate-spin'), 600);
    });
  }
}

if (chatFab && chatPanel) {
  chatFab.addEventListener('click', async () => {
    chatPanel.hidden = !chatPanel.hidden;
    if (!chatPanel.hidden) {
      setupGuildChatInput();
      const prevRead = currentGuildChatLastReadTime;
      renderGuildChat(currentCache, false, prevRead);
      await markGuildChatAsRead(currentCache);
      if (popupRpcEnabled) {
        triggerGuildChatRefresh();
      }
      const input = document.querySelector('#guild-chat-input');
      if (input && typeof input.focus === 'function') input.focus();
      else chatClose?.focus?.();
    } else {
      updateGuildChatBadge(currentCache, currentGuildChatLastReadTime);
    }
  });
}
if (chatRefresh) {
  chatRefresh.addEventListener('click', () => {
    triggerGuildChatRefresh();
  });
}
if (chatClose && chatPanel) {
  chatClose.addEventListener('click', () => {
    chatPanel.hidden = true;
    updateGuildChatBadge(currentCache, currentGuildChatLastReadTime);
    document.querySelector('#fab-trigger')?.focus?.();
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs) {
  try {
    chrome.tabs.onUpdated?.addListener?.(() => {
      if (typeof activeTab !== 'undefined' && activeTab === 'dashboard' && typeof updateDashboardGameStatus === 'function') {
        updateDashboardGameStatus();
      }
    });
    chrome.tabs.onRemoved?.addListener?.(() => {
      if (typeof activeTab !== 'undefined' && activeTab === 'dashboard' && typeof updateDashboardGameStatus === 'function') {
        updateDashboardGameStatus();
      }
    });
  } catch (_) {}
}
