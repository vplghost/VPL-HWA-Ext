<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const missionId = ref(135);
const raidResults = ref<any[]>([]);
const isRaidRunning = ref(false);
const quickMissions = [135, 10, 20, 50, 80, 100, 120, 150];

const energyStatus = computed(() => cache.value?.energyStatus?.data || {});
const currentEnergy = computed(() => {
  const e = energyStatus.value.energy;
  return Number.isFinite(e) ? Number(e) : '—';
});
const maxEnergy = computed(() => {
  const m = energyStatus.value.max;
  return Number.isFinite(m) ? Number(m) : '—';
});

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

async function executeRaid(times: number) {
  isRaidRunning.value = true;
  try {
    const res = await dispatchRpc([
      {
        name: 'mission_raid',
        args: { missionId: missionId.value, times },
        feature: 'campaign',
      },
      { name: 'inventoryGet' },
    ]);
    if (res?.data?.drops) {
      raidResults.value = res.data.drops;
    }
  } finally {
    isRaidRunning.value = false;
  }
}

function handleImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (target) target.style.display = 'none';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="campaign-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-dialog-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      @click.self="close"
    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl shrink-0" aria-hidden="true">⚔️</span>
            <h2 id="campaign-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
              Campaign Raid & Equipment Farm
            </h2>
            <div id="campaign-dialog-status" class="flex items-center gap-2 truncate">
              <span class="text-xs text-slate-500 dark:text-slate-400">
                Story mission progression & item drops
              </span>
            </div>
          </div>

          <button
            type="button"
            class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close Campaign Farm dialog"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Body -->
        <div id="campaign-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)] text-xs">
          <!-- 1. Energy & Status Banner -->
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
            <div class="space-y-0.5">
              <div class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>⚡</span> Campaign Mission Raid
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">
                Raid campaign missions to farm equipment, fragments, and gold
              </div>
            </div>

            <div class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-bold text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
              <span>⚡ Energy:</span>
              <span class="text-sm font-extrabold">{{ currentEnergy }}</span>
              <span v-if="maxEnergy !== '—'" class="text-amber-500">/ {{ maxEnergy }}</span>
            </div>
          </div>

          <!-- 2. Campaign Raid Setup Card -->
          <div class="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 shadow-xs dark:border-indigo-900/40 dark:bg-indigo-950/20 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
              <h4 class="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                <span>🎯</span> Campaign Raid Setup
              </h4>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                Estimated cost: ~6-8 Energy / raid
              </span>
            </div>

            <!-- Mission input & quick select -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <label for="campaign-mission-input" class="font-bold text-slate-800 dark:text-slate-200">
                  Campaign Mission (Mission ID):
                </label>
                <span class="text-[11px] text-slate-500">Default: 135 (Map item drop)</span>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <input
                  id="campaign-mission-input"
                  v-model.number="missionId"
                  type="number"
                  min="1"
                  max="500"
                  class="w-32 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />

                <div class="flex items-center gap-1.5 flex-wrap">
                  <button
                    v-for="m in quickMissions"
                    :key="m"
                    type="button"
                    class="px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all border"
                    :class="
                      missionId === m
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-400'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    "
                    @click="missionId = m"
                  >
                    M-{{ m }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Raid action buttons -->
            <div class="flex items-center gap-2.5 pt-2 border-t border-indigo-100 dark:border-indigo-900/40">
              <button
                type="button"
                :disabled="isRaidRunning"
                class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                @click="executeRaid(1)"
              >
                <span>⚔️ Raid 1x (6⚡)</span>
              </button>

              <button
                type="button"
                :disabled="isRaidRunning"
                class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                @click="executeRaid(10)"
              >
                <span>⚡ Raid 10x (60⚡)</span>
              </button>

              <span v-if="isRaidRunning" class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">
                Raiding Mission {{ missionId }}...
              </span>
            </div>
          </div>

          <!-- 3. Raid Loot Results -->
          <div v-if="raidResults.length > 0" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
            <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>📦</span> Raid Loot Results ({{ raidResults.length }} items)
            </h4>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                v-for="(drop, idx) in raidResults"
                :key="idx"
                class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs"
              >
                <img
                  v-if="drop.id"
                  :src="`assets/items/gear/${drop.id}.png`"
                  class="size-6 rounded object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  alt=""
                  @error="handleImgError"
                />
                <span v-else class="text-base shrink-0">📦</span>
                <div class="min-w-0">
                  <div class="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {{ drop.name || `Item #${drop.id}` }}
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono">
                    x{{ formatNumber(drop.amount || 1) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
