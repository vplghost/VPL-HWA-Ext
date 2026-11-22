import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { normalizeArray } from '../utils/troops.ts';
import { teamMemberIds } from '../utils/teamMembers.ts';

export interface AccountTeam { id: string; name: string; heroIds: number[]; type?: 'hero' | 'titan'; maxTroops?: number }
export function normalizeAccountTeams(raw: unknown): AccountTeam[] {
  return normalizeArray(raw).filter(team => team && typeof team === 'object' && team.id != null)
    .map(team => {
      const ids = teamMemberIds(team.heroIds);
      const isTitan = team.type === 'titan' || (ids.length > 0 && ids.every(id => Number(id) >= 4000));
      const res: AccountTeam = {
        ...team,
        heroIds: ids
      };
      if (team.type != null) {
        res.type = team.type;
      } else if (isTitan) {
        res.type = 'titan';
      }
      return res;
    });
}

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
    customTeams.value = normalizeAccountTeams(accounts[String(account)]);
  }
  async function saveTeams(next: AccountTeam[]) {
    const account = accountId.value;
    if (account == null || account === '') throw new Error('Wait for the active game account before saving teams.');
    const stored = await chrome.storage.local.get('customTeams');
    if (account !== accountId.value) throw new Error('Game account changed. Reopen the team editor.');
    const accounts = (stored.customTeams || {}) as Record<string, AccountTeam[]>;
    const normalized = normalizeAccountTeams(next);
    await chrome.storage.local.set({ customTeams: { ...accounts, [String(account)]: normalized } });
    if (account === accountId.value) customTeams.value = normalized;
  }
  function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area === 'local' && 'customTeams' in changes) void loadTeams().catch((cause) => { storageError.value = String(cause); });
  }
  watch(accountId, () => { void loadTeams().catch((cause) => { storageError.value = String(cause); }); }, { immediate: true });
  onMounted(() => chrome.storage.onChanged.addListener(onChanged));
  onUnmounted(() => { ++revision; chrome.storage.onChanged.removeListener(onChanged); });
  return { customTeams, saveTeams, storageError };
}
