<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useDialogTeamSelection } from '@/src/composables/useDialogTeamSelection';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { getHeroMetadata, getItemName, starGlowClass } from '@/src/utils/metadata';
import { teamOptions as getTeamOptions } from '@/src/utils/squadCapacity';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import { getAmountAt } from '@/src/utils/resourceData';
import { BRIGAND_ENERGY_COST, campHeroIds, campAttackError, campAttackCalls, campSearchCalls, availableCamps } from '@/src/utils/brigandCamp';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
const { cache, dispatchRpc, updateCacheLocally } = useRpcCache();
const accountId = computed(() => cache.value.accountStatus?.data?.id);
const { customTeams } = useAccountTeams(accountId);
const rememberedTeam = useDialogTeamSelection('brigand', accountId);
const selectedPreset = ref('');
const owned = computed<Record<string, any>>(() => cache.value.heroGetAll?.data || {});
const teamOptions = computed(() => {
  const options = getTeamOptions(cache.value.teamGetAll?.data, owned.value, customTeams.value);
  return [{ id: 'camp', label: 'Brigand Camp team', heroIds: savedTeam.value }, ...options.filter((team: any) => !team.id.startsWith('globalMapCamp:'))];
});
function heroName(id: number) { return getHeroMetadata(id)?.name || `Hero #${id}`; }
function heroAvatar(id: number) { return getHeroMetadata(id)?.avatarFile || ''; }
function getRewardIcon(reward: any): string {
  const type = String(reward?.type || '').toLowerCase();
  if (type === 'gold' || type === 'coin') return '🪙';
  if (type === 'experience') return '⭐';
  if (type.includes('lootbox')) return '🎁';
  if (type === 'consumable') return '🧪';
  if (type.includes('fragment') || type === 'gear') return '🧩';
  return '📦';
}
function getRewardLabel(reward: any): string {
  if (reward?.type === 'gold') return 'Gold';
  if (reward?.type === 'experience') return 'XP';
  return getItemName(reward?.type, reward?.id);
}
const now = ref(Date.now());
let energyTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { energyTimer = setInterval(() => { now.value = Date.now(); }, 1000); });
onUnmounted(() => clearInterval(energyTimer));
const energy = computed<number | null>(() => {
  const value = getAmountAt(cache.value['resource:world-energy'], now.value);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
});
const savedTeam = computed(() => {
  const observed = cache.value.brigandCampTeam;
  const snapshot = cache.value.teamGetAll;
  return campHeroIds(observed && (!snapshot || observed.updatedAt > snapshot.updatedAt)
    ? observed.data?.units : snapshot?.data?.globalMapCamp);
});
const campId = ref('');
const campLevel = ref(0);
const summary = computed(() => cache.value.brigandCampSummary);
const searchStatus = computed(() => cache.value.brigandCampSearchStatus);
const searchPending = shallowRef<{ startedAt: number; previous?: string } | null>(null);
const searchMessage = ref('');
const searchError = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const camps = computed(() => availableCamps(summary.value?.data, now.value));
const filteredCamps = computed(() => camps.value.filter(camp => !campLevel.value || camp.campConfigId === campLevel.value));
const selectedCamp = computed(() => camps.value.find(camp => camp.id === campId.value));
const expired = computed(() => typeof summary.value?.data?.nextRespawnDt === 'number' && summary.value.data.nextRespawnDt <= now.value);
const respawnText = computed(() => summary.value?.data?.nextRespawnDt
  ? new Date(summary.value.data.nextRespawnDt).toLocaleString() : 'Unknown');
function chooseCamp(id: string) {
  if (!pending.value && !searchPending.value && camps.value.some(camp => camp.id === id)) campId.value = id;
}
watch(camps, rows => {
  if (!pending.value && campId.value && !rows.some(camp => camp.id === campId.value)) campId.value = '';
});
watch(searchStatus, entry => {
  const request = searchPending.value;
  if (!request || !entry || entry.updatedAt === request.previous || Date.parse(entry.updatedAt) < request.startedAt) return;
  clearTimeout(searchTimer);
  searchPending.value = null;
  searchError.value = entry.data.success ? '' : entry.data.error || 'Camp search failed.';
  searchMessage.value = entry.data.success ? 'Camp list updated.' : '';
});
onUnmounted(() => clearTimeout(searchTimer));
async function searchCamps() {
  if (pending.value || searchPending.value) return;
  const request = { startedAt: Date.now(), previous: searchStatus.value?.updatedAt };
  searchPending.value = request;
  searchError.value = '';
  searchMessage.value = 'Searching camps…';
  const response = await dispatchRpc(campSearchCalls());
  if (searchPending.value !== request) return;
  if (!response?.ok) {
    searchPending.value = null;
    searchMessage.value = '';
    searchError.value = response?.error || 'Camp search could not be sent.';
    return;
  }
  // Fast-path: Handle authoritative response directly if returned by RPC transport
  if (Array.isArray(response.results)) {
    const summaryRes = response.results.find((r: any) =>
      r?.result?.response?.camps || r?.result?.response?.nextRespawnDt || r?.error || r?.result?.error
    ) || response.results[0];
    const err = summaryRes?.error || summaryRes?.result?.error;
    if (err) {
      clearTimeout(searchTimer);
      searchPending.value = null;
      searchMessage.value = '';
      searchError.value = typeof err === 'string' ? err : err.message || 'Camp search failed.';
      return;
    }
    const data = summaryRes?.result?.response;
    if (data && (Array.isArray(data.camps) || data.nextRespawnDt)) {
      clearTimeout(searchTimer);
      searchPending.value = null;
      searchError.value = '';
      searchMessage.value = 'Camp list updated.';
      void updateCacheLocally((draft) => {
        draft.brigandCampSummary = {
          updatedAt: new Date().toISOString(),
          data
        };
        draft.brigandCampSearchStatus = {
          updatedAt: new Date().toISOString(),
          data: { success: true, count: data.camps?.length || 0 }
        };
      });
      return;
    }
  }
  searchMessage.value = response.queued ? 'Search queued. Waiting for game traffic.' : 'Waiting for camp list…';
  searchTimer = setTimeout(() => {
    if (searchPending.value !== request) return;
    searchPending.value = null;
    searchMessage.value = '';
    searchError.value = 'No camp list received yet. You can search again.';
  }, 30000);
}
const heroIds = ref<number[]>([]);
const message = ref('');
const error = ref('');
const refreshing = ref(false);
const pending = shallowRef<{ campId: string; startedAt: number; previous: string | undefined } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
const result = computed(() => cache.value.brigandCampStatus);
const validation = computed(() => summary.value && !selectedCamp.value
  ? 'Search and select an available camp.'
  : campAttackError(campId.value, heroIds.value, owned.value, energy.value));
const alreadyWon = computed(() => result.value?.data?.success && result.value.data.campId === campId.value.trim());

function selectTeam(ids: number[], preset = 'camp', persist = true) {
  heroIds.value = campHeroIds(ids).filter(id => !!owned.value[String(id)]);
  selectedPreset.value = preset;
  if (persist) void rememberedTeam.saveSelection({ teamId: preset, heroIds: [...heroIds.value] });
}
function selectSavedTeam(id: string) {
  if (pending.value) return;
  const team = teamOptions.value.find((team: any) => team.id === id);
  if (team) selectTeam(team.heroIds, id);
}
watch([rememberedTeam.selection, owned, teamOptions, pending], () => {
  if (pending.value) return;
  const saved = rememberedTeam.selection.value;
  const id = saved?.teamId || selectedPreset.value || 'camp';
  const team = teamOptions.value.find((team: any) => team.id === id || team.id === `custom:${id}`);
  if (team) selectTeam(team.heroIds, team.id, false);
  else if (saved?.heroIds?.length) {
    const matching = teamOptions.value.find((team: any) => JSON.stringify(team.heroIds) === JSON.stringify(campHeroIds(saved.heroIds)));
    selectTeam(matching?.heroIds || savedTeam.value, matching?.id || 'camp', false);
  } else selectTeam(savedTeam.value, 'camp', false);
}, { immediate: true });
watch(() => props.modelValue, open => {
  if (open && !heroIds.value.length) selectTeam(savedTeam.value, 'camp', false);
});
watch(savedTeam, ids => { if (props.modelValue && !heroIds.value.length) selectTeam(ids, 'camp', false); });
watch(accountId, () => {
  clearTimeout(timer);
  clearTimeout(searchTimer);
  searchPending.value = null;
  searchMessage.value = '';
  searchError.value = '';
  pending.value = null;
  heroIds.value = [];
  selectedPreset.value = '';
  campId.value = '';
  message.value = '';
  error.value = '';
});
watch(result, entry => {
  const request = pending.value;
  if (!request || !entry || entry.updatedAt === request.previous ||
      entry.data?.campId !== request.campId || Date.parse(entry.updatedAt) < request.startedAt) return;
  clearTimeout(timer);
  pending.value = null;
  error.value = entry.data.success ? '' : entry.data.error || 'Camp attack was rejected.';
  message.value = entry.data.success ? 'Camp defeated. World Energy and rewards updated.' : '';
});
onUnmounted(() => clearTimeout(timer));

async function sync() {
  refreshing.value = true;
  error.value = '';
  try {
    const response = await dispatchRpc([
      { name: 'teamGetAll' }, { name: 'heroGetAll' },
      { name: 'refillableGetAll', feature: 'refillable' },
    ]);
    if (!response?.ok) error.value = response?.error || 'Sync could not be sent.';
    else if (Array.isArray(response.results) && response.results.length > 0) message.value = 'Sync completed.';
    else message.value = response.queued ? 'Sync queued. Waiting for game traffic.' : 'Sync requested.';
  } finally { refreshing.value = false; }
}
async function attack() {
  if (pending.value || searchPending.value) return;
  error.value = validation.value || (alreadyWon.value ? 'This camp has already been defeated.' : '');
  if (error.value) return;
  const request = { campId: campId.value.trim(), startedAt: Date.now(), previous: result.value?.updatedAt };
  pending.value = request;
  message.value = 'Sending camp attack…';
  const response = await dispatchRpc(campAttackCalls(request.campId, heroIds.value));
  if (pending.value !== request) return;
  if (!response?.ok) {
    pending.value = null;
    error.value = response?.error || 'Camp attack could not be sent.';
    message.value = '';
    return;
  }
  // Fast-path: Handle authoritative response directly if returned by RPC transport
  if (Array.isArray(response.results)) {
    const battleRes = response.results.find((r: any) =>
      r?.result?.response?.reward ||
      r?.result?.response?.progress ||
      r?.result?.response?.camps ||
      r?.result?.error ||
      r?.error
    ) || response.results[0];

    const err = battleRes?.error || battleRes?.result?.error;
    if (err) {
      clearTimeout(timer);
      pending.value = null;
      message.value = '';
      error.value = typeof err === 'string' ? err : err.message || 'Camp attack was rejected.';
      return;
    }
    const data = battleRes?.result?.response;
    if (data || battleRes?.result) {
      clearTimeout(timer);
      pending.value = null;
      error.value = '';
      message.value = 'Camp defeated. World Energy and rewards updated.';
      void updateCacheLocally((draft) => {
        const nowIso = new Date().toISOString();
        draft.brigandCampStatus = {
          updatedAt: nowIso,
          data: {
            success: true,
            campId: request.campId,
            ...(typeof data === 'object' ? data : {})
          }
        };
        const prevCamps = Array.isArray(draft.brigandCampHistory?.data) ? draft.brigandCampHistory.data : [];
        draft.brigandCampHistory = {
          updatedAt: nowIso,
          data: [
            ...prevCamps.filter((item: any) => item?.campId !== request.campId),
            { campId: request.campId, success: true, timestamp: nowIso }
          ]
        };
        if (draft.refillableGetAll?.data) {
          const worldEnergyItem = Object.values(draft.refillableGetAll.data).find(
            (item: any) => item?.id === 13 || item?.type === 'worldEnergy'
          );
          if (worldEnergyItem && typeof (worldEnergyItem as any).amount === 'number') {
            (worldEnergyItem as any).amount = Math.max(0, (worldEnergyItem as any).amount - BRIGAND_ENERGY_COST);
          }
        }
      });
      return;
    }
  }
  message.value = response.queued ? 'Attack queued. Waiting for game traffic and server confirmation.' : 'Waiting for server confirmation…';
  timer = setTimeout(() => {
    if (pending.value === request) message.value = 'Still waiting for the game response. Do not resend this camp attack.';
  }, 30000);
}
</script>

<template>
  <ModalDialog :model-value="modelValue" title="Brigand Camp" icon="⛺" max-width="max-w-3xl" @update:model-value="emit('update:modelValue', $event)">
    <template #header-status>
      <span
        id="brigand-header-cost-pill"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/70"
        :title="`Current World Energy: ${energy ?? 'Unknown'} (${BRIGAND_ENERGY_COST} per camp)`"
      >
        <span>⚡</span>
        <span>{{ BRIGAND_ENERGY_COST }} / camp</span>
      </span>

      <span
        v-if="summary"
        id="brigand-header-camps-pill"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
        :title="`Next respawn: ${respawnText}`"
      >
        <span>⛺</span>
        <span>{{ filteredCamps.length }}</span>
      </span>
    </template>

    <template #header-actions>
      <button
        id="brigand-sync-btn"
        type="button"
        title="Sync Team & Energy"
        aria-label="Sync Team and Energy"
        :disabled="refreshing || !!pending"
        class="cursor-pointer size-7 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        @click="sync"
      >
        <span :class="{ 'inline-block animate-spin': refreshing }">↻</span>
      </button>
    </template>

    <div class="space-y-3 text-xs">
      <section class="space-y-2" aria-label="Available Brigand camps">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <strong class="text-slate-800 dark:text-slate-200">Available Camps · {{ filteredCamps.length }}</strong>
            <select v-model.number="campLevel" aria-label="Camp level" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs">
              <option :value="0">All levels</option>
              <option v-for="level in 3" :key="level" :value="level">Level {{ level }}</option>
            </select>
            <span v-if="summary" class="text-[11px] text-slate-400 hidden sm:inline">Respawn: {{ respawnText }}</span>
          </div>
          <button
            id="brigand-search"
            type="button"
            class="cursor-pointer rounded-lg bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-white font-semibold text-xs disabled:opacity-50 transition-colors"
            :disabled="!!searchPending || !!pending"
            @click="searchCamps"
          >
            {{ searchPending ? 'Searching…' : 'Search Camps' }}
          </button>
        </div>

        <p v-if="searchError" role="alert" class="text-red-600 dark:text-red-400">{{ searchError }}</p>
        <p v-if="searchMessage" role="status" class="text-[11px] text-slate-500">{{ searchMessage }}</p>
        <p v-if="expired" class="text-[11px] text-amber-600">Camp list expired. Search again for current targets.</p>
        <p v-else-if="!summary" class="text-[11px] text-slate-500">Search to load camps from the game.</p>
        <p v-else-if="!filteredCamps.length" class="text-[11px] text-slate-500">No available camps for this level.</p>

        <div id="brigand-camp-list" class="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
          <button
            v-for="camp in filteredCamps"
            :key="camp.id"
            type="button"
            :aria-pressed="campId === camp.id"
            :disabled="!!pending || !!searchPending"
            :title="`Camp ID: ${camp.id}`"
            class="cursor-pointer rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50 space-y-1"
            :class="
              campId === camp.id
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-400/50'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 hover:border-orange-300 dark:hover:border-orange-700'
            "
            @click="chooseCamp(camp.id)"
          >
            <div class="flex items-center justify-between gap-1">
              <span
                class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold"
                :class="
                  camp.campConfigId === 3
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                    : camp.campConfigId === 2
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                "
              >
                Lv.{{ camp.campConfigId }}
              </span>
              <span v-if="campId === camp.id" class="text-[11px] font-bold text-orange-600 dark:text-orange-400">✓ Selected</span>
            </div>
            <span class="block text-[11px] leading-snug text-slate-600 dark:text-slate-300 line-clamp-2">
              {{ camp.defendersPack?.map(hero => (getHeroMetadata(hero.id)?.name || 'Hero #' + hero.id) + ' Lv.' + (hero.level ?? '?')).join(', ') || 'Defenders unavailable' }}
            </span>
          </button>
        </div>
      </section>

      <section class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <label for="brigand-team-select" class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Team</label>
          <span class="text-[11px] text-slate-400">Direct instant battle</span>
        </div>
        <select id="brigand-team-select" :value="selectedPreset" :disabled="!!pending" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs" @change="selectSavedTeam(($event.target as HTMLSelectElement).value)">
          <option v-for="team in teamOptions" :key="team.id" :value="team.id">{{ team.label }} ({{ team.heroIds.length }}/5)</option>
        </select>
        <div v-if="heroIds.length" class="flex flex-wrap items-center gap-1.5" aria-label="Selected camp team">
          <span v-for="id in heroIds" :key="id" class="hero-hover-trigger inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700">
            <span class="size-5 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border" :class="starGlowClass(Number(owned[String(id)]?.star) || 1)">
              <img v-if="heroAvatar(id)" :src="heroAvatar(id)" :alt="heroName(id)" class="size-full object-cover" />
              <span v-else aria-hidden="true">👤</span>
            </span>
            <span>{{ heroName(id) }}</span>
            <HeroHoverCard :hero-id="id" :hero="owned[String(id)]" :inventory="cache.inventoryGet?.data" />
          </span>
        </div>
        <p v-else class="text-[11px] text-amber-600 dark:text-amber-400">Select a saved team or sync the Brigand Camp team.</p>
      </section>

      <p v-if="error" role="alert" class="text-red-600 dark:text-red-400">{{ error }}</p>
      <p v-if="message" role="status" class="text-slate-600 dark:text-slate-300">{{ message }}</p>
      <p v-if="alreadyWon" class="text-emerald-600">This camp has already been defeated. Choose another camp.</p>

      <div
        v-if="result"
        id="brigand-last-result"
        class="rounded-xl border p-2.5 space-y-2"
        :class="
          result.data.success
            ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
            : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20'
        "
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="inline-flex items-center gap-1 font-bold text-xs"
            :class="result.data.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'"
            :title="`Camp ID: ${result.data.campId}`"
          >
            <span>{{ result.data.success ? '🏆' : '❌' }}</span>
            <span>Last Camp: {{ result.data.success ? 'Victory' : 'Failed' }}</span>
          </span>
          <span v-if="result.data.success && result.data.rewards?.length" class="text-[11px] text-slate-400">
            {{ result.data.rewards.length }} reward{{ result.data.rewards.length > 1 ? 's' : '' }}
          </span>
        </div>

        <p v-if="!result.data.success" class="text-rose-600 dark:text-rose-400">{{ result.data.error }}</p>
        <div v-else id="brigand-rewards-list" class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="(reward, index) in result.data.rewards"
            :key="index"
            class="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-200 shadow-2xs"
          >
            <span aria-hidden="true">{{ getRewardIcon(reward) }}</span>
            <strong class="font-mono">{{ reward.amount.toLocaleString() }}</strong>
            <span class="text-slate-500 dark:text-slate-400">{{ getRewardLabel(reward) }}</span>
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap justify-end items-center gap-3">
        <span v-if="!pending && validation" class="text-xs text-slate-500">{{ validation }}</span>
        <button
          id="brigand-attack"
          type="button"
          class="cursor-pointer rounded-lg bg-orange-600 hover:bg-orange-500 px-4 py-1.5 font-semibold text-white text-xs disabled:opacity-50 transition-colors"
          :disabled="!!pending || !!searchPending || !!validation || alreadyWon"
          @click="attack"
        >
          {{ pending ? 'Waiting…' : `Attack Camp · ⚡ ${BRIGAND_ENERGY_COST}` }}
        </button>
      </div>
    </template>
  </ModalDialog>
</template>
