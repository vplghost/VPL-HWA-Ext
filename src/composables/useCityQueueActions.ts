import { ref } from 'vue';

/** Send intent to the background queue owner instead of writing stale UI snapshots. */
export function useCityQueueActions(type: 'building' | 'research', apply: (queue: any) => void) {
  const queueError = ref('');
  const queueBusy = ref(false);
  let revision = 0;
  let active = 0;
  function applyQueueSnapshot(queue: any) {
    const next = Number(queue?.updatedAt) || 0;
    if (next < revision) return;
    revision = next;
    apply(queue);
  }

  async function commandQueue(action: string, payload: Record<string, any> = {}) {
    queueError.value = '';
    queueBusy.value = true;
    active++;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Extension runtime is unavailable. Queue was not changed.');
      const result = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({ kind: type + '-queue-action', action, ...payload }, response => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || 'Queue request failed.'));
          else resolve(response);
        });
      });
      if (!result?.ok) {
        const error = new Error(result?.error || 'No confirmation from the queue service.');
        Object.assign(error, { logged: result?.logged === true });
        throw error;
      }
      if (result.queue) applyQueueSnapshot(result.queue);
      return result;
    } catch (error: any) {
      queueError.value = error?.message || String(error);
      console.error('[HWA-QUEUE][' + type + '] ' + queueError.value);
      if (!error?.logged && typeof chrome !== 'undefined' && chrome.storage?.local) {
        try {
          const key = type + 'QueueLogs';
          const stored = await chrome.storage.local.get([key]);
          const logs = Array.isArray(stored[key]) ? stored[key] : [];
          await chrome.storage.local.set({ [key]: [{ timestamp: Date.now(), type, action: 'ui_error',
            status: 'error', message: queueError.value, error: queueError.value }, ...logs].slice(0, 100) });
        } catch (logError) { console.error('Could not save queue error log', logError); }
      }
      return { ok: false, error: queueError.value };
    } finally {
      active--;
      queueBusy.value = active > 0;
    }
  }
  return { commandQueue, queueError, queueBusy, applyQueueSnapshot };
}
