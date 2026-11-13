<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { getHeroMetadata, getItemName } from '@/src/utils/metadata';
import { getAmountAt } from '@/src/utils/resourceData';
import { BRIGAND_ENERGY_COST, campHeroIds, campAttackError, campAttackCalls } from '@/src/utils/brigandCamp';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
const { cache, dispatchRpc } = useRpcCache();
const accountId = computed(() => cache.value.accountStatus?.data?.id);
const { customTeams } = useAccountTeams(accountId);
const owned = computed<Record<string, any>>(() => cache.value.heroGetAll?.data || {});
const heroes = computed(() => Object.entries(owned.value).map(([id, hero]) => ({
  id: Number(id), name: getHeroMetadata(id)?.name || `Hero #${id}`, power: Number(hero.power) || 0,
})).sort((a, b) => b.power - a.power));
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
const heroIds = ref<number[]>([]);
const message = ref('');
const error = ref('');
const refreshing = ref(false);
const pending = shallowRef<{ campId: string; startedAt: number; previous: string | undefined } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
const result = computed(() => cache.value.brigandCampStatus);
const validation = computed(() => campAttackError(campId.value, heroIds.value, owned.value, energy.value));
const alreadyWon = computed(() => result.value?.data?.success && result.value.data.campId === campId.value.trim());

function selectTeam(ids: number[]) {
  heroIds.value = campHeroIds(ids).filter(id => !!owned.value[String(id)]);
}
function toggleHero(id: number) {
  if (heroIds.value.includes(id)) heroIds.value = heroIds.value.filter(hero => hero !== id);
  else if (heroIds.value.length < 5) heroIds.value = [...heroIds.value, id];
}
watch(() => props.modelValue, open => {
  if (open && !heroIds.value.length) selectTeam(savedTeam.value);
});
watch(savedTeam, ids => { if (props.modelValue && !heroIds.value.length) selectTeam(ids); });
watch(accountId, () => {
  clearTimeout(timer);
  pending.value = null;
  heroIds.value = [];
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
    else message.value = response.queued ? 'Sync queued. Waiting for game traffic.' : 'Sync requested.';
  } finally { refreshing.value = false; }
}
async function attack() {
  if (pending.value) return;
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
  message.value = response.queued ? 'Attack queued. Waiting for game traffic and server confirmation.' : 'Waiting for server confirmation…';
  timer = setTimeout(() => {
    if (pending.value === request) message.value = 'Still waiting for the game response. Do not resend this camp attack.';
  }, 30000);
}
</script>

<template>
  <ModalDialog :model-value="modelValue" title="Brigand Camp" icon="⛺" max-width="max-w-3xl" @update:model-value="emit('update:modelValue', $event)">
    <div class="space-y-4 text-sm">
      <div class="flex items-center justify-between gap-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 p-3">
        <div><strong>World Energy: {{ energy ?? 'Unknown' }}</strong><p class="text-xs text-slate-500">{{ BRIGAND_ENERGY_COST }} per camp · Levels 1–3</p></div>
        <button class="rounded-lg px-3 py-2 bg-slate-200 dark:bg-slate-700 disabled:opacity-50" :disabled="refreshing || !!pending" @click="sync">{{ refreshing ? 'Syncing…' : 'Sync Team & Energy' }}</button>
      </div>
      <label class="block font-semibold">Camp ID
        <input v-model="campId" :disabled="!!pending" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 font-mono text-xs" />
      </label>
      <p class="text-xs text-slate-500">Enter the target camp ID from the game record. Automatic camp search is not available yet. This sends a camp victory request directly; it does not open the in-game battle.</p>
      <div class="flex flex-wrap items-center gap-2">
        <strong>Team · {{ heroIds.length }}/5 heroes</strong>
        <button class="text-xs text-orange-600 disabled:opacity-50" :disabled="!!pending || !savedTeam.length" @click="selectTeam(savedTeam)">Use Brigand Camp team</button>
        <select class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs" :disabled="!!pending" aria-label="Use custom team" @change="selectTeam(customTeams.find(team => team.id === ($event.target as HTMLSelectElement).value)?.heroIds || [])">
          <option value="">Custom team…</option>
          <option v-for="team in customTeams" :key="team.id" :value="team.id">{{ team.name }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
        <button v-for="hero in heroes" :key="hero.id" :aria-pressed="heroIds.includes(hero.id)" :disabled="!!pending || (!heroIds.includes(hero.id) && heroIds.length >= 5)" class="rounded-lg border p-2 text-left disabled:opacity-50" :class="heroIds.includes(hero.id) ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40' : 'border-slate-200 dark:border-slate-700'" @click="toggleHero(hero.id)">
          <span class="font-semibold">{{ hero.name }}</span><span class="block text-xs text-slate-500">Power {{ hero.power.toLocaleString() }}</span>
        </button>
        <p v-if="!heroes.length" class="col-span-full text-xs text-slate-500">Sync heroes to select a team.</p>
      </div>
      <p v-if="error" role="alert" class="text-red-600 dark:text-red-400">{{ error }}</p>
      <p v-if="message" role="status" class="text-slate-600 dark:text-slate-300">{{ message }}</p>
      <p v-if="alreadyWon" class="text-emerald-600">This camp has already been defeated. Choose another camp.</p>
      <div v-if="result" class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1">
        <strong>Last camp: {{ result.data.success ? 'Victory' : 'Failed' }}</strong>
        <p class="break-all font-mono text-xs text-slate-500">{{ result.data.campId }}</p>
        <p v-if="!result.data.success" class="text-red-600">{{ result.data.error }}</p>
        <ul v-else class="text-xs space-y-1"><li v-for="(reward, index) in result.data.rewards" :key="index">{{ reward.amount.toLocaleString() }} × {{ reward.type === 'gold' ? 'Gold' : reward.type === 'experience' ? 'Experience' : getItemName(reward.type, reward.id) }}</li></ul>
      </div>
    </div>
    <template #footer>
      <div class="flex flex-wrap justify-end items-center gap-3">
        <span v-if="!pending && validation" class="text-xs text-slate-500">{{ validation }}</span>
        <button id="brigand-attack" class="rounded-lg bg-orange-600 hover:bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50" :disabled="!!pending || !!validation || alreadyWon" @click="attack">{{ pending ? 'Waiting…' : 'Attack Camp' }}</button>
      </div>
    </template>
  </ModalDialog>
</template>
