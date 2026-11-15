<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useGameConnection } from '@/src/composables/useGameConnection';
import { useNow } from '@/src/composables/useNow';
import { mail } from '@/src/utils/mail';
import { resourceLabel } from '@/src/utils/resourceData';
import { getResourceIcon } from '@/src/utils/itemResources';
import { formatDuration, formatNumber, formatFinishTime } from '@/src/utils/formatters';
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
const { cache, dispatchRpc } = useRpcCache(), { hasGameTab } = useGameConnection(), now = useNow();
const rows = computed(() => mail.rows(cache.value, now.value));
const claimable = computed<any[]>(() => rows.value.letters.filter((row: any) => row.canClaim));
const reportCount = computed(() => rows.value.reports.filter((row: any) => row.canClaim).length);
const reportGroups = computed(() => mail.reportGroups(rows.value.reports));
const reportDays = computed(() => mail.dailyReports(cache.value, now.value));
const known = computed(() => Boolean(cache.value.mailStatus?.data?.lettersObservedAt) || cache.value.mailGetAll?.data?.letters != null);
const refreshing = ref(false), submitting = ref(false), message = ref('');
const claimState = shallowRef<any>(null);
const pending = computed(() => submitting.value || Boolean(claimState.value?.pending));
const statusMessage = computed(() => message.value || (String(claimState.value?.accountId) === String(cache.value.accountStatus?.data?.id) ? claimState.value?.message : ''));
let revision = 0;
async function loadClaimState() {
  const read = revision;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const stored = await chrome.storage.local.get('mailClaimState');
  if (read === revision) claimState.value = stored.mailClaimState || null;
}
function storageChanged(changes: any, area: string) {
  if (area === 'local' && changes.mailClaimState) { revision++; claimState.value = changes.mailClaimState.newValue || null; message.value = ''; }
}
onMounted(() => {
  if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(storageChanged);
  void loadClaimState().catch(() => {});
});
onUnmounted(() => { revision++; if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(storageChanged); });
watch(() => props.modelValue, open => {
  if (open && typeof chrome !== 'undefined') void chrome.runtime.sendMessage({ kind: 'mail-prune' }).catch(() => {});
});
watch(() => cache.value.accountStatus?.data?.id, () => { message.value = ''; });
async function refresh() {
  if (refreshing.value || !hasGameTab.value) return;
  refreshing.value = true;
  try {
    const result = await dispatchRpc(mail.refreshCalls());
    message.value = result?.ok ? result.queued ? 'Mail refresh queued for game traffic.' : 'Mail refresh requested. Waiting for game data.' : result?.error || 'Mail refresh failed.';
  } finally { refreshing.value = false; }
}
async function claim(ids?: any[], reports = false) {
  if (pending.value || !hasGameTab.value || !props.modelValue) return;
  const current = mail.rows(cache.value, Date.now());
  const selected: any[] = reports ? [] : (ids || current.letters.filter((row: any) => row.canClaim).map((row: any) => row.id).slice(0, 100));
  if (!current.scoped || (reports ? !current.reports.some((row: any) => row.canClaim) : !selected.length || selected.some(id => !current.letters.some((row: any) => String(row.id) === String(id) && row.canClaim)))) return;
  submitting.value = true;
  try {
    const result = await chrome.runtime.sendMessage({ kind: 'mail-claim', accountId: cache.value.accountStatus?.data?.id, ids: selected, reports });
    message.value = result?.ok ? 'Claim requested. Waiting for game confirmation.' : result?.error || 'Claim could not be sent.';
    await loadClaimState();
  } catch (error) { message.value = String(error); }
  finally { submitting.value = false; }
}
function title(row: any) {
  return row.title || (String(row.params?.titleIdent || '').includes('CLANBOSS') ? 'Hydra rewards' :
    row.type === 'clanActivity' ? 'Guild activity rewards' : row.type === 'wendy_fb_reward' ? 'Community reward' : `Mail #${row.id}`);
}
const plainMessage = (row: any) => typeof row.message === 'string' ? row.message.replace(/<[^>]*>/g, ' ').trim() : '';
</script>

<template>
  <ModalDialog :model-value="modelValue" title="Mail" icon="✉️" max-width="max-w-3xl" @update:model-value="emit('update:modelValue', $event)">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs text-slate-500">{{ claimable.length }} mail rewards available</span>
      <div class="flex items-center gap-2">
        <button type="button" :disabled="refreshing || !hasGameTab" class="cursor-pointer rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 disabled:opacity-50" @click="refresh">{{ refreshing ? 'Requesting…' : 'Refresh' }}</button>
        <button type="button" :disabled="pending || !hasGameTab || !claimable.length" class="cursor-pointer rounded bg-emerald-600 text-white px-3 py-1.5 disabled:opacity-50" @click="claim()">{{ claimable.length > 100 ? 'Claim next 100 mail' : `Claim all mail (${claimable.length})` }}</button>
      </div>
    </div>
    <p v-if="pending || statusMessage" role="status" class="text-xs text-slate-500">{{ pending ? 'Claim awaiting game confirmation. No automatic retry.' : statusMessage }}</p>
    <p v-if="!rows.scoped && rows.letters.length" class="text-xs text-amber-600">Refresh mail to verify the current account before claiming.</p>
    <p v-if="!rows.letters.length" class="rounded-lg bg-slate-50 dark:bg-slate-800 p-4 text-center text-slate-500">{{ known ? 'No current mail. Expired mail is removed automatically.' : 'Waiting for mail data. Click Refresh to load your inbox.' }}</p>
    <article v-for="row in rows.letters" :key="row.id" :data-mail-id="row.id" class="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
      <div class="flex items-start justify-between gap-3"><h4 class="font-semibold">{{ title(row) }}</h4><span v-if="!row.unclaimed" class="text-[10px] text-slate-500">{{ row.rewards.length ? 'Claimed' : 'No rewards' }}</span></div>
      <div class="flex flex-wrap gap-2">
        <span v-for="reward in row.rewards" :key="reward.key" class="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 px-2 py-1.5 font-semibold" :title="resourceLabel(reward)">
          <img v-if="getResourceIcon(reward)" :src="getResourceIcon(reward)!" alt="" class="size-7 object-contain" /><span v-else aria-hidden="true">🎁</span>
          <span>{{ formatNumber(reward.amount) }} <span class="font-normal">{{ resourceLabel(reward) }}</span></span>
        </span>
        <span v-if="!row.rewards.length" class="text-slate-500">No reward details provided.</span>
      </div>
      <p v-if="plainMessage(row)" class="text-xs text-slate-500 whitespace-pre-line">{{ plainMessage(row) }}</p>
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div v-if="row.expiresAtMs" class="text-xs" :class="row.expiresAtMs - now < 21600000 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'">
          <p>Expires {{ formatFinishTime(row.expiresAtMs, now) }}</p><p>{{ formatDuration(Math.max(0, Math.ceil((row.expiresAtMs - now) / 1000))) }} remaining</p>
        </div><span v-else class="text-xs text-slate-500">Expiry not provided</span>
        <button v-if="row.unclaimed" type="button" :disabled="pending || !hasGameTab || !row.canClaim" class="cursor-pointer rounded bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-50" @click="claim([row.id])">Claim</button>
      </div>
    </article>
    <section v-if="reportGroups.length" data-pending-reports class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <h4 class="font-semibold">Battle reports · {{ reportCount }} rewards available</h4>
      <button type="button" :disabled="pending || !hasGameTab || !reportCount" class="cursor-pointer rounded bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-50" @click="claim(undefined, true)">Claim report rewards</button>
      <div v-for="group in reportGroups" :key="group.type" class="flex flex-wrap justify-between gap-2 border-t border-slate-200 dark:border-slate-700 pt-2 text-xs">
        <span>{{ group.label }} · {{ formatNumber(group.count) }}<span v-if="!group.canClaim" class="text-slate-500"> · Collect in game</span></span>
        <span class="text-slate-500">{{ group.expiresAtMs ? `Earliest expiry ${formatFinishTime(group.expiresAtMs, now)}` : 'Expiry not provided' }}</span>
        <span v-if="group.rewards.length" class="basis-full text-slate-500">Known rewards: {{ group.rewards.map((reward: any) => `${formatNumber(reward.amount)} ${resourceLabel(reward)}`).join(' · ') }}</span>
      </div>
      <p class="text-xs text-slate-500">Rewards are recorded when the game confirms collection.</p>
    </section>
    <details v-if="reportDays.length" data-report-history class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <summary class="cursor-pointer font-semibold">Battle report history · daily totals</summary>
      <p class="text-xs text-slate-500">Last 30 days · UTC · observed claimed reports. Counts use report dates (or first observation when unavailable); collected rewards use claim dates.</p>
      <div v-for="day in reportDays" :key="day.day" :data-report-day="day.day" class="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-1">
        <div class="flex flex-wrap justify-between gap-2"><span class="font-medium">{{ day.day }}</span><span class="text-xs">{{ formatNumber(day.total) }} reports<span v-if="day.wins || day.losses"> · {{ formatNumber(day.wins) }} wins / {{ formatNumber(day.losses) }} losses</span></span></div>
        <p v-if="day.types.length" class="text-xs text-slate-500">{{ day.types.map((type: any) => `${type.label}: ${formatNumber(type.count)}`).join(' · ') }}</p>
        <div v-if="day.rewards.length" class="flex flex-wrap gap-2 text-xs">
          <span v-for="reward in day.rewards" :key="reward.key" class="inline-flex items-center gap-1">
            <img v-if="getResourceIcon(reward)" :src="getResourceIcon(reward)!" alt="" class="size-5 object-contain" />
            {{ formatNumber(reward.amount) }} {{ resourceLabel(reward) }}
          </span>
        </div>
        <p v-else class="text-xs text-slate-500">No collected reward totals observed.</p>
      </div>
    </details>
  </ModalDialog>
</template>
