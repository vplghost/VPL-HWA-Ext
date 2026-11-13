import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

export interface AccountTeam { id: string; name: string; heroIds: number[]; maxTroops?: number }

export function useAccountTeams(accountId: Ref<string | number | undefined>) {
  const customTeams = ref<AccountTeam[]>([]);
  const storageError = ref('');
  let revision = 0;
  async function loadTeams() {
    const request = ++revision;
    const account = accountId.value;
    customTeams.value = [];
    if (account == null || account === '') return;
    const stored = await chrome.storage.local.get('customTeams');
    if (request !== revision || account !== accountId.value) return;
    const accounts = (stored.customTeams || {}) as Record<string, AccountTeam[]>;
    customTeams.value = Array.isArray(accounts[String(account)]) ? accounts[String(account)]! : [];
  }
  async function saveTeams(next: AccountTeam[]) {
    const account = accountId.value;
    if (account == null || account === '') throw new Error('Wait for the active game account before saving teams.');
    const stored = await chrome.storage.local.get('customTeams');
    if (account !== accountId.value) throw new Error('Game account changed. Reopen the team editor.');
    const accounts = (stored.customTeams || {}) as Record<string, AccountTeam[]>;
    await chrome.storage.local.set({ customTeams: { ...accounts, [String(account)]: next } });
    if (account === accountId.value) customTeams.value = next;
  }
  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && 'customTeams' in changes) void loadTeams().catch((cause) => { storageError.value = String(cause); });
  }
  watch(accountId, () => { void loadTeams().catch((cause) => { storageError.value = String(cause); }); }, { immediate: true });
  onMounted(() => chrome.storage.onChanged.addListener(onChanged));
  onUnmounted(() => { ++revision; chrome.storage.onChanged.removeListener(onChanged); });
  return { customTeams, saveTeams, storageError };
}
