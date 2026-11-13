import { computed, ref, watch, type Ref } from 'vue';
import { recentMissionIds, rememberMission } from '../utils/campaignMissionHistory';

export function useCampaignMissionHistory(accountId: Ref<string | number | undefined>) {
  const recent = ref<number[]>([]);
  const key = computed(() => accountId.value == null || accountId.value === '' ? null
    : `campaignRecentMissions:${encodeURIComponent(String(accountId.value))}`);
  let revision = 0;
  let pending: number[] = [];
  let loaded: Promise<void> = Promise.resolve();
  let writes = Promise.resolve();
  watch(key, target => {
    const request = ++revision;
    recent.value = [];
    pending = [];
    loaded = (async () => {
      if (!target || typeof chrome === 'undefined' || !chrome.storage?.local) return;
      try {
        const stored = await chrome.storage.local.get(target);
        if (request !== revision) return;
        recent.value = recentMissionIds([...pending, ...recentMissionIds(stored[target])]);
      } catch (error) { console.warn('Could not load recent campaign missions:', error); }
    })();
  }, { immediate: true });
  async function record(id: number, account = accountId.value) {
    const target = key.value, request = revision;
    if (!target || account !== accountId.value || !Number.isSafeInteger(id) || id <= 0) return;
    pending = rememberMission(pending, id);
    recent.value = rememberMission(recent.value, id);
    await loaded;
    if (request !== revision) return;
    const snapshot = [...recent.value];
    writes = writes.then(async () => {
      try { await chrome.storage.local.set({ [target]: snapshot }); }
      catch (error) { console.warn('Could not save recent campaign missions:', error); }
    });
    await writes;
  }
  return { recent, record };
}
