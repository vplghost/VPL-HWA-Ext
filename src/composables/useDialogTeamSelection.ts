import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

export interface DialogTeamSelection { teamId?: string; heroIds?: number[] }

/** One storage key per account/dialog prevents unrelated preference writes from replacing a team. */
export function useDialogTeamSelection(dialog: string, accountId: Ref<string | number | undefined>) {
  const selection = ref<DialogTeamSelection | null>(null);
  const loaded = ref(false);
  const storageError = ref('');
  const key = computed(() => accountId.value == null || accountId.value === '' ? null
    : `dialogTeam:${encodeURIComponent(String(accountId.value))}:${dialog}`);
  let revision = 0;
  const pendingWrites = new Map<string, number>();

  async function loadSelection() {
    const request = ++revision;
    const target = key.value;
    if (!target || typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    if (pendingWrites.has(target)) return selection.value;
    try {
      const stored = await chrome.storage.local.get(target);
      if (request !== revision || target !== key.value) return selection.value;
      selection.value = stored[target] as DialogTeamSelection || null;
      loaded.value = true;
      storageError.value = '';
    } catch (error) { if (request === revision) storageError.value = String(error); }
    return selection.value;
  }
  async function saveSelection(value: DialogTeamSelection) {
    const target = key.value;
    if (!target) return false;
    ++revision;
    const snapshot = { ...value, ...(value.heroIds ? { heroIds: [...value.heroIds] } : {}) };
    selection.value = snapshot;
    loaded.value = true;
    pendingWrites.set(target, (pendingWrites.get(target) || 0) + 1);
    try {
      await chrome.storage.local.set({ [target]: snapshot });
      if (target === key.value) storageError.value = '';
      return true;
    } catch (error) {
      if (target === key.value) storageError.value = String(error);
      return false;
    } finally {
      const remaining = (pendingWrites.get(target) || 1) - 1;
      if (remaining) pendingWrites.set(target, remaining);
      else pendingWrites.delete(target);
    }
  }
  watch(key, () => {
    ++revision;
    selection.value = null;
    loaded.value = false;
    storageError.value = '';
    void loadSelection();
  }, { immediate: true });
  function changed(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area !== 'local' || !key.value || !(key.value in changes)) return;
    ++revision;
    selection.value = changes[key.value]?.newValue as DialogTeamSelection || null;
    loaded.value = true;
  }
  onMounted(() => { if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(changed); });
  onUnmounted(() => {
    ++revision;
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(changed);
  });
  return { selection, loaded, storageError, loadSelection, saveSelection };
}
