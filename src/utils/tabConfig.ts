export interface TabConfigItem {
  id: string;
  label?: string;
  visible: boolean;
}

export const DEFAULT_TAB_CONFIG = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'items', label: 'Items' },
  { id: 'resources', label: 'Resources' },
  { id: 'titans', label: 'Titans' },
  { id: 'teams', label: 'Teams' },
  { id: 'events', label: 'Events' },
  { id: 'goals', label: 'Goals' },
  { id: 'log', label: 'Log' },
];

export function normalizeTabConfig(storedConfig: unknown): TabConfigItem[] {
  if (!Array.isArray(storedConfig) || storedConfig.length === 0) {
    return DEFAULT_TAB_CONFIG.map((t) => ({ id: t.id, visible: true }));
  }
  const knownIds = new Set(DEFAULT_TAB_CONFIG.map((t) => t.id));
  const result: TabConfigItem[] = [];
  const seenIds = new Set<string>();
  for (const item of storedConfig) {
    if (item && knownIds.has(item.id) && !seenIds.has(item.id)) {
      result.push({
        id: item.id,
        visible: item.visible !== false,
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
    if (result[0]) result[0].visible = true;
  }
  return result;
}

export function applyTabConfig(
  config: TabConfigItem[],
  doc: any = typeof document !== 'undefined' ? document : null,
  activeTabRef: any = null,
) {
  const tabsNav = doc?.querySelector?.('#tabs');
  if (!tabsNav) return;
  const configBtn = tabsNav.querySelector?.('[data-tab="config"]');

  config.forEach((item) => {
    const btn = tabsNav.querySelector?.(`[data-tab="${item.id}"]`);
    if (btn) {
      btn.hidden = !item.visible;
      if (configBtn && typeof tabsNav.insertBefore === 'function') {
        tabsNav.insertBefore(btn, configBtn);
      } else if (typeof tabsNav.appendChild === 'function') {
        tabsNav.appendChild(btn);
      }
    }
  });

  const currentTab = activeTabRef?.activeTab ?? activeTabRef?.value;
  if (currentTab && currentTab !== 'config') {
    const currentTabItem = config.find((t) => t.id === currentTab);
    if (currentTabItem && !currentTabItem.visible) {
      const firstVisible = config.find((t) => t.visible);
      if (firstVisible) {
        if (activeTabRef) {
          if ('activeTab' in activeTabRef) activeTabRef.activeTab = firstVisible.id;
          if ('value' in activeTabRef) activeTabRef.value = firstVisible.id;
        }
        const allTabs = [...(tabsNav.querySelectorAll?.('[data-tab]') || [])];
        allTabs.forEach((t: any) => {
          t.setAttribute?.('aria-selected', String(t.dataset?.tab === firstVisible.id));
        });
      }
    }
  }
}

export function createTabConfigManager(options: {
  doc?: any;
  activeTab?: string;
  storage?: { get: Function; set: Function };
} = {}) {
  const doc = options.doc || (typeof document !== 'undefined' ? document : null);
  const context = {
    activeTab: options.activeTab || 'heroes',
    currentTabConfig: DEFAULT_TAB_CONFIG.map((t) => ({ id: t.id, visible: true })),
  };

  async function saveTabConfig(config: TabConfigItem[]) {
    if (options.storage?.set) {
      await options.storage.set({ tabConfig: config });
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      await chrome.storage.local.set({ tabConfig: config });
    }
  }

  function apply(config: TabConfigItem[]) {
    context.currentTabConfig = config;
    applyTabConfig(config, doc, context);
  }

  function renderConfigTabs() {
    const container = doc?.querySelector?.('#config-tabs-list');
    if (!container) return;
    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren();
    } else {
      container.children = [];
    }

    const labelMap = Object.fromEntries(DEFAULT_TAB_CONFIG.map((t) => [t.id, t.label]));

    context.currentTabConfig.forEach((item, index) => {
      const row = doc.createElement('div');
      row.className = 'flex items-center justify-between rounded-md bg-white px-3 py-2 border border-slate-200 shadow-xs text-xs';

      const left = doc.createElement('label');
      left.className = 'flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none';

      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.visible;
      checkbox.className = 'tab-visibility-toggle size-4 accent-blue-600 cursor-pointer';
      checkbox.dataset = checkbox.dataset || {};
      checkbox.dataset.tabId = item.id;
      checkbox.addEventListener('change', async () => {
        if (!checkbox.checked) {
          const visibleCount = context.currentTabConfig.filter((t) => t.visible).length;
          if (visibleCount <= 1) {
            checkbox.checked = true;
            return;
          }
        }
        item.visible = checkbox.checked;
        apply(context.currentTabConfig);
        await saveTabConfig(context.currentTabConfig);
      });

      const labelText = doc.createElement('span');
      labelText.textContent = labelMap[item.id] || item.id;
      left.append(checkbox, labelText);

      const right = doc.createElement('div');
      right.className = 'flex items-center gap-1';

      const upBtn = doc.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'tab-move-up-btn size-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer';
      upBtn.textContent = '▲';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', async () => {
        if (index > 0) {
          const temp = context.currentTabConfig[index - 1]!;
          context.currentTabConfig[index - 1] = context.currentTabConfig[index]!;
          context.currentTabConfig[index] = temp;
          apply(context.currentTabConfig);
          await saveTabConfig(context.currentTabConfig);
          renderConfigTabs();
        }
      });

      const downBtn = doc.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'tab-move-down-btn size-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer';
      downBtn.textContent = '▼';
      downBtn.disabled = index === context.currentTabConfig.length - 1;
      downBtn.addEventListener('click', async () => {
        if (index < context.currentTabConfig.length - 1) {
          const temp = context.currentTabConfig[index + 1]!;
          context.currentTabConfig[index + 1] = context.currentTabConfig[index]!;
          context.currentTabConfig[index] = temp;
          apply(context.currentTabConfig);
          await saveTabConfig(context.currentTabConfig);
          renderConfigTabs();
        }
      });

      right.append(upBtn, downBtn);
      row.append(left, right);
      container.append(row);
    });
  }

  return {
    DEFAULT_TAB_CONFIG,
    normalizeTabConfig,
    applyTabConfig: apply,
    renderConfigTabs,
    get currentTabConfig() {
      return context.currentTabConfig;
    },
    set currentTabConfig(val) {
      context.currentTabConfig = val;
    },
    context,
  };
}
