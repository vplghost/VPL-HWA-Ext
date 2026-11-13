import { ref, computed, onMounted, onUnmounted } from 'vue';

export interface GameEngineStatus {
  ready?: boolean;
  hasCanvas?: boolean;
  hasRpcHeaders?: boolean;
  extensionVersion?: string;
  refreshRequired?: boolean;
  needsRefresh?: boolean;
  reason?: string;
  rpcUrlAvailable?: boolean;
  [key: string]: any;
}

const hasGameTab = ref(true); // optimistic default
const gameEngineStatus = ref<GameEngineStatus | null>(null);
const isRefreshing = ref(false);
let consumerCount = 0;
let detachListeners: (() => void) | null = null;
let checkInterval: any = null;

export function useGameConnection() {
  const currentExtVersion = computed(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest()?.version || '';
    }
    return '';
  });

  const isHooked = computed(() => {
    const s = gameEngineStatus.value;
    return Boolean(s && (s.ready || (s.hasCanvas && s.hasRpcHeaders)));
  });

  const isVersionChanged = computed(() => {
    const s = gameEngineStatus.value;
    return Boolean(
      s?.extensionVersion &&
      currentExtVersion.value &&
      s.extensionVersion !== currentExtVersion.value
    );
  });

  const isRefreshRequired = computed(() => {
    const s = gameEngineStatus.value;
    return Boolean(
      s?.refreshRequired === true ||
      s?.needsRefresh === true ||
      s?.reason === 'refresh-required' ||
      s?.reason === 'extension-updated' ||
      (s?.rpcUrlAvailable && !s?.hasRpcHeaders)
    );
  });

  const isHealthy = computed(() => {
    return hasGameTab.value && isHooked.value && !isVersionChanged.value && !isRefreshRequired.value;
  });

  const needsRefresh = computed(() => {
    return hasGameTab.value && (!isHooked.value || isVersionChanged.value || isRefreshRequired.value);
  });

  const alertMessage = computed(() => {
    if (!hasGameTab.value) {
      return {
        type: 'no-tab',
        title: 'No Game Window Detected:',
        body: 'Hero Wars: Alliance is not currently open in any browser tab. Open the game in a tab to enable live tracking and automated features.',
      };
    }
    if (isVersionChanged.value) {
      return {
        type: 'version-changed',
        title: 'Refresh Recommended:',
        body: `Extension updated to v${currentExtVersion.value} (game tab has v${gameEngineStatus.value?.extensionVersion}). Please refresh browser.`,
      };
    }
    if (isRefreshRequired.value) {
      return {
        type: 'refresh-required',
        title: 'Refresh Recommended:',
        body: 'Game engine requested a refresh to reconnect RPC bridge and hooks.',
      };
    }
    if (!isHooked.value) {
      return {
        type: 'not-hooked',
        title: 'Refresh Recommended:',
        body: 'Game window is open but engine hooks are not yet connected. Please refresh browser.',
      };
    }
    return null;
  });

  async function checkStatus() {
    if (typeof chrome === 'undefined') return;

    if (chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ kind: 'get-game-tab-status' }, (response) => {
          if (chrome.runtime?.lastError) return;
          if (response && response.ok) {
            hasGameTab.value = Boolean(response.hasGameTab);
            if (response.gameEngineStatus !== undefined) {
              gameEngineStatus.value = response.gameEngineStatus;
            }
          }
        });
      } catch (_) {}
    }

    if (chrome.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get('gameEngineStatus');
        if (stored.gameEngineStatus) {
          gameEngineStatus.value = stored.gameEngineStatus;
        }
      } catch (_) {}
    }
  }

  async function reloadGameTab() {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ kind: 'reload-game-tab' }, () => {
          setTimeout(() => {
            isRefreshing.value = false;
            checkStatus();
          }, 1200);
        });
      } catch (_) {
        isRefreshing.value = false;
      }
    } else {
      isRefreshing.value = false;
    }
  }

  function handleStorageChange(changes: any, area: string) {
    if (area === 'local' && changes.gameEngineStatus) {
      gameEngineStatus.value = changes.gameEngineStatus.newValue || null;
    }
  }

  onMounted(() => {
    consumerCount++;
    checkStatus();
    if (!detachListeners) {
      if (typeof chrome !== 'undefined') {
        const changed = () => { void checkStatus(); };
        chrome.storage?.onChanged?.addListener(handleStorageChange);
        chrome.tabs?.onUpdated?.addListener?.(changed);
        chrome.tabs?.onRemoved?.addListener?.(changed);
        detachListeners = () => {
          chrome.storage?.onChanged?.removeListener(handleStorageChange);
          chrome.tabs?.onUpdated?.removeListener?.(changed);
          chrome.tabs?.onRemoved?.removeListener?.(changed);
        };
      }
      if (!checkInterval) checkInterval = setInterval(checkStatus, 3000);
    }
  });
  onUnmounted(() => {
    consumerCount--;
    if (consumerCount === 0) {
      detachListeners?.();
      detachListeners = null;
      if (checkInterval) clearInterval(checkInterval);
      checkInterval = null;
    }
  });

  return {
    hasGameTab,
    gameEngineStatus,
    isHooked,
    isVersionChanged,
    isRefreshRequired,
    isHealthy,
    needsRefresh,
    alertMessage,
    isRefreshing,
    checkStatus,
    reloadGameTab,
  };
}
