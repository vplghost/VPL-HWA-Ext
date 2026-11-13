import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

export function normalizeAutoClaim(value: any = {}) {
  value = value || {};
  return { mail: value.mail !== false, reports: value.reports !== false,
    quests: value.quests !== false, onOpen: value.onOpen === true };
}
export function normalizePriorityJoin(value: any = {}) {
  value = value || {};
  return { enabled: value.enabled === true,
    minLevel: Math.max(1, Math.min(30, Math.trunc(Number(value.minLevel) || 10))),
    teamId: typeof value.teamId === 'string' ? value.teamId : 'highest',
    ...(Array.isArray(value.heroIds) ? { heroIds: value.heroIds } : {}) };
}

export function usePopupAutomation(cache: Ref<any>, runOnOpen = false) {
  const autoClaimSettings = ref(normalizeAutoClaim());
  const priorityAutoJoin = ref(normalizePriorityJoin());
  const customTeams = ref<Record<string, any[]>>({});
  const enabled = ref(false);
  const loaded = ref(false);
  const claimStatus = ref<any>(null);
  const message = ref('');
  const busy = ref(false);
  let didAutoClaim = false;
  const helpers = () => (globalThis as any).hwaHelperPopupData;
  const experimental = () => (globalThis as any).hwaHelperExperimentalData;
  const pending = computed(() => helpers()?.getPendingClaims?.(cache.value) ||
    { letterIds: [], hasReports: false, questIds: [], totalCount: 0 });
  const selectedCount = computed(() => (autoClaimSettings.value.mail ? pending.value.letterIds.length : 0) +
    (autoClaimSettings.value.reports && pending.value.hasReports ? 1 : 0) +
    (autoClaimSettings.value.quests ? pending.value.questIds.length : 0));
  const teams = computed<any[]>(() => {
    const c = cache.value;
    const heroes = c.heroGetAll?.data || {};
    const summary = c['getUnitSummary:unit']?.data;
    const array = (value: any): any[] => Array.isArray(value) ? value : Object.values(value || {});
    const available = experimental()?.availableHeroIds?.(heroes, { ...summary, squads: array(summary?.squads) }, array(c.marchStatus?.data?.marches));
    const accountTeams = customTeams.value[String(c.accountStatus?.data?.id)] || [];
    return experimental()?.autoJoinTeamOptions?.(c.teamGetAll?.data, heroes, accountTeams, available) ||
      [{ id: 'highest', label: 'Top 5 highest power heroes' }];
  });
  function consume(stored: Record<string, any>) {
    if ('autoClaimSettings' in stored) autoClaimSettings.value = normalizeAutoClaim(stored.autoClaimSettings);
    if ('priorityAutoJoin' in stored) priorityAutoJoin.value = normalizePriorityJoin(stored.priorityAutoJoin);
    if ('popupRpcEnabled' in stored) enabled.value = stored.popupRpcEnabled === true;
    if ('customTeams' in stored) customTeams.value = stored.customTeams || {};
    if ('claimRpcStatus' in stored) claimStatus.value = stored.claimRpcStatus;
  }
  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local') consume(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.newValue])));
  }
  async function saveAutoClaim() {
    autoClaimSettings.value = normalizeAutoClaim(autoClaimSettings.value);
    await chrome.storage.local.set({ autoClaimSettings: { ...autoClaimSettings.value } });
  }
  async function savePriorityJoin() {
    const next = normalizePriorityJoin(priorityAutoJoin.value);
    const team = teams.value.find((item) => item.id === next.teamId);
    // A different team must never retain stale heroIds from the prior selection.
    delete next.heroIds;
    if (Array.isArray(team?.heroIds)) next.heroIds = [...team.heroIds];
    priorityAutoJoin.value = next;
    await chrome.storage.local.set({ priorityAutoJoin: next });
  }
  async function claimRewards() {
    if (!enabled.value || busy.value) return;
    if (claimStatus.value?.state === 'queued' && Date.now() - Date.parse(claimStatus.value.updatedAt || '') < 120000) return;
    const calls = helpers()?.buildAutoClaimCalls?.(cache.value, autoClaimSettings.value)?.calls || [];
    if (!calls.length) return;
    busy.value = true;
    message.value = 'Dispatching selected rewards…';
    try {
      const result = await chrome.runtime.sendMessage({ kind: 'claim-rewards', calls });
      if (!result?.ok) throw new Error(result?.error || 'Game tab is not reachable.');
      message.value = result.queued ? 'Queued for the next game RPC.' : 'Rewards requested. Waiting for game sync.';
      if (result.queued) claimStatus.value = { state: 'queued', updatedAt: new Date().toISOString() };
    } catch (cause) { message.value = String(cause); }
    finally { busy.value = false; }
  }
  onMounted(async () => {
    chrome.storage.onChanged.addListener(onChanged);
    try {
      consume(await chrome.storage.local.get(['autoClaimSettings', 'priorityAutoJoin', 'popupRpcEnabled', 'customTeams', 'claimRpcStatus']));
      loaded.value = true;
    } catch (cause) { message.value = String(cause); }
  });
  onUnmounted(() => chrome.storage.onChanged.removeListener(onChanged));
  watch([loaded, cache, enabled], () => {
    if (runOnOpen && loaded.value && !didAutoClaim && autoClaimSettings.value.onOpen && enabled.value && selectedCount.value > 0) {
      didAutoClaim = true;
      void claimRewards();
    }
  });
  return { autoClaimSettings, priorityAutoJoin, teams, pending, selectedCount, busy, message,
    saveAutoClaim, savePriorityJoin, claimRewards };
}
