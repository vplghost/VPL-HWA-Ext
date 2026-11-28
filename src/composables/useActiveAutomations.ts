import { ref, onMounted, onUnmounted } from 'vue';
import type { ModalName } from './useModals.ts';

export type ActiveAutomationId =
  | 'raid'
  | 'monster'
  | 'gather'
  | 'train'
  | 'heal'
  | 'energy-burn'
  | 'expiring-claims'
  | 'building'
  | 'research'
  | 'tower'
  | 'dungeon';

export interface ActiveAutomationItem {
  id: ActiveAutomationId;
  label: string;
  icon: string;
  statusTone: 'running' | 'waiting' | 'warning';
  modalName: ModalName;
  stopMessage?: { kind: string; [k: string]: any };
  storageDisableKey?: { key: string; patch: Record<string, any> };
}

export const AUTOMATION_STORAGE_KEYS = [
  'raidQueue',
  'monsterQueue',
  'autoGatherSettings',
  'smartGatherState',
  'troopTrainSettings',
  'autoTrainState',
  'troopHealSettings',
  'autoHealState',
  'energyAutoBurnSettings',
  'energyAutoBurnState',
  'expiringClaimSettings',
  'expiringClaimState',
  'buildingQueue',
  'researchQueue',
  'towerRun',
  'dungeonRun',
  'activeResourceLocks',
] as const;

/**
 * Pure aggregator that derives currently active automation pills from chrome.storage.local snapshot.
 */
export function computeActiveAutomations(stored: Record<string, any> | null | undefined): ActiveAutomationItem[] {
  if (!stored || typeof stored !== 'object') return [];
  const items: ActiveAutomationItem[] = [];

  const rq = stored.raidQueue;
  if (rq && ['running', 'waiting_rally', 'waiting_march', 'queued'].includes(String(rq.status || ''))) {
    const completed = Number(rq.completedRounds ?? rq.completed ?? 0);
    const total = Number(rq.totalRounds ?? rq.count ?? 0);
    const progress = total > 0 ? `${completed}/${total}` : 'Active';
    const isWaiting = rq.status === 'waiting_rally' || rq.status === 'waiting_march';
    items.push({
      id: 'raid',
      icon: '⚔️',
      label: isWaiting ? `Raid: ${progress} · Waiting rally` : `Raid: ${progress}`,
      statusTone: isWaiting ? 'waiting' : 'running',
      modalName: 'raid',
      stopMessage: { kind: 'raid-queue-stop' },
    });
  }

  const mq = stored.monsterQueue;
  if (mq && ['running', 'waiting_march', 'queued'].includes(String(mq.status || ''))) {
    const completed = Number(mq.completedRounds ?? mq.completed ?? 0);
    const total = Number(mq.totalRounds ?? mq.count ?? 0);
    const progress = total > 0 ? `${completed}/${total}` : 'Active';
    items.push({
      id: 'monster',
      icon: '👹',
      label: `Monster: ${progress}`,
      statusTone: mq.status === 'waiting_march' ? 'waiting' : 'running',
      modalName: 'monster',
      stopMessage: { kind: 'monster-queue-stop' },
    });
  }

  if (stored.autoGatherSettings?.enabled === true) {
    const lockedByRaid = Array.isArray(stored.activeResourceLocks) &&
      stored.activeResourceLocks.some((l: any) => l?.owner === 'raidQueue');
    const waitingForTroops = Boolean(stored.smartGatherState?.waitingForTroops);
    const smart = stored.autoGatherSettings.smartEnabled ? 'Smart' : 'Auto';
    items.push({
      id: 'gather',
      icon: '⛏️',
      label: lockedByRaid
        ? `${smart} Gather · Yielding to Raid`
        : waitingForTroops
          ? `${smart} Gather · Waiting for troops`
          : `${smart} Gather: Active`,
      statusTone: lockedByRaid || waitingForTroops ? 'waiting' : 'running',
      modalName: 'gathering',
      storageDisableKey: {
        key: 'autoGatherSettings',
        patch: { ...(stored.autoGatherSettings || {}), enabled: false },
      },
    });
  }

  if (stored.troopTrainSettings?.autoTrainEnabled === true) {
    const statusText = stored.autoTrainState?.lastError
      ? 'Auto Train: Attention'
      : 'Auto Train: Active';
    items.push({
      id: 'train',
      icon: '🪖',
      label: statusText,
      statusTone: stored.autoTrainState?.lastError ? 'warning' : 'running',
      modalName: 'building',
      storageDisableKey: {
        key: 'troopTrainSettings',
        patch: { ...(stored.troopTrainSettings || {}), autoTrainEnabled: false },
      },
    });
  }

  if (stored.troopHealSettings?.autoHealEnabled === true) {
    const statusText = stored.autoHealState?.lastError
      ? 'Auto Heal: Attention'
      : 'Auto Heal: Active';
    items.push({
      id: 'heal',
      icon: '🏥',
      label: statusText,
      statusTone: stored.autoHealState?.lastError ? 'warning' : 'running',
      modalName: 'building',
      storageDisableKey: {
        key: 'troopHealSettings',
        patch: { ...(stored.troopHealSettings || {}), autoHealEnabled: false },
      },
    });
  }

  if (stored.energyAutoBurnSettings?.enabled === true) {
    const statusText = stored.energyAutoBurnState?.lastError
      ? 'Energy Burn: Attention'
      : 'Energy Burn: Active';
    items.push({
      id: 'energy-burn',
      icon: '⚡',
      label: statusText,
      statusTone: stored.energyAutoBurnState?.lastError ? 'warning' : 'running',
      modalName: 'campaignRaid',
      storageDisableKey: {
        key: 'energyAutoBurnSettings',
        patch: { ...(stored.energyAutoBurnSettings || {}), enabled: false },
      },
    });
  }

  if (stored.expiringClaimSettings?.enabled === true) {
    const statusText = stored.expiringClaimState?.lastError
      ? 'Expiring Claims: Attention'
      : 'Expiring Claims: Active';
    items.push({
      id: 'expiring-claims',
      icon: '⏰',
      label: statusText,
      statusTone: stored.expiringClaimState?.lastError ? 'warning' : 'running',
      modalName: 'shop',
      storageDisableKey: {
        key: 'expiringClaimSettings',
        patch: { ...(stored.expiringClaimSettings || {}), enabled: false },
      },
    });
  }

  const bq = stored.buildingQueue;
  const bqItems = Array.isArray(bq?.items) ? bq.items : (Array.isArray(bq?.queue) ? bq.queue : []);
  if (bq && (bq.active === true || bq.status === 'running') && bqItems.length > 0) {
    items.push({
      id: 'building',
      icon: '🏗️',
      label: `Build Queue: ${bqItems.length} left`,
      statusTone: 'running',
      modalName: 'building',
      stopMessage: { kind: 'building-queue-clear' },
    });
  }

  const resQ = stored.researchQueue;
  const resItems = Array.isArray(resQ?.items) ? resQ.items : (Array.isArray(resQ?.queue) ? resQ.queue : []);
  if (resQ && (resQ.active === true || resQ.status === 'running') && resItems.length > 0) {
    items.push({
      id: 'research',
      icon: '🧪',
      label: `Research Queue: ${resItems.length} left`,
      statusTone: 'running',
      modalName: 'research',
      stopMessage: { kind: 'research-queue-clear' },
    });
  }

  const tr = stored.towerRun;
  if (tr && ['running', 'waiting'].includes(String(tr.status || ''))) {
    items.push({
      id: 'tower',
      icon: '🗼',
      label: `Tower Auto: Floor ${tr.floor ?? '?'}`,
      statusTone: tr.status === 'waiting' ? 'waiting' : 'running',
      modalName: 'tower',
      stopMessage: { kind: 'tower-run-stop' },
    });
  }

  const dr = stored.dungeonRun;
  if (dr && ['running', 'waiting'].includes(String(dr.status || ''))) {
    items.push({
      id: 'dungeon',
      icon: '🕳️',
      label: `Dungeon Auto: Running`,
      statusTone: dr.status === 'waiting' ? 'waiting' : 'running',
      modalName: 'dungeon',
      stopMessage: { kind: 'dungeon-run-stop' },
    });
  }

  return items;
}

export function useActiveAutomations() {
  const activeItems = ref<ActiveAutomationItem[]>([]);
  const snapshot = ref<Record<string, any>>({});

  function recompute() {
    activeItems.value = computeActiveAutomations(snapshot.value);
  }

  async function refresh() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
    try {
      const stored = await chrome.storage.local.get([...AUTOMATION_STORAGE_KEYS]);
      snapshot.value = stored || {};
      recompute();
    } catch (_) {}
  }

  function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area !== 'local') return;
    let touched = false;
    for (const key of AUTOMATION_STORAGE_KEYS) {
      if (key in changes) {
        snapshot.value = { ...snapshot.value, [key]: changes[key].newValue };
        touched = true;
      }
    }
    if (touched) recompute();
  }

  async function stopAutomation(item: ActiveAutomationItem) {
    if (typeof chrome === 'undefined') return;
    try {
      if (item.stopMessage && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage(item.stopMessage);
      }
      if (item.storageDisableKey && chrome.storage?.local?.set) {
        await chrome.storage.local.set({
          [item.storageDisableKey.key]: item.storageDisableKey.patch,
        });
      }
    } catch (_) {}
  }

  onMounted(() => {
    void refresh();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }
  });

  onUnmounted(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  });

  return {
    activeItems,
    refresh,
    stopAutomation,
  };
}
