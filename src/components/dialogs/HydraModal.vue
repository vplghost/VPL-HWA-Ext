<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import AutomationLogPanel, { type AutomationLogEntry } from '@/src/components/common/AutomationLogPanel.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata, getHeroName } from '@/src/utils/metadata';
import {
  HYDRA_CONFIG_STORAGE_KEY,
  parseHydraState,
  planHydraHornTargets,
  formatHydraDamage,
  type HydraPlanStrategy,
  type HydraHeadState,
} from '@/src/services/hydraService';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache } = useRpcCache();

const selectedTierId = ref<number>(1);
const strategy = ref<HydraPlanStrategy>('highest-effective');
const overkillGuardPct = ref<number>(25);
const preferRaid = ref<boolean>(true);
const allowSuperTries = ref<boolean>(false);
const isRefreshing = ref(false);
const logs = ref<AutomationLogEntry[]>([]);

function addLog(text: string, level: 'info' | 'warn' | 'error' = 'info') {
  const ts = new Date().toTimeString().slice(0, 8);
  logs.value = [...logs.value.slice(-49), { ts, level, text }];
}

const hydraState = computed(() =>
  parseHydraState(cache.value?.clanBoss_getAll?.data, cache.value?.teamGetAll?.data)
);

const activeTier = computed(() =>
  hydraState.value.tiers.find((t) => t.tierId === selectedTierId.value) || hydraState.value.tiers[0]
);

const hornPlan = computed(() =>
  planHydraHornTargets({
    state: hydraState.value,
    config: {
      strategy: strategy.value,
      preferredTierId: selectedTierId.value,
      overkillGuardPct: overkillGuardPct.value / 100,
      preferRaid: preferRaid.value,
      allowSuperTries: allowSuperTries.value,
    },
  })
);

const topRecommendation = computed(() => hornPlan.value.recommendations[0] || null);

const recommendationByHeadId = computed(() => {
  const map = new Map<number, (typeof hornPlan.value.recommendations)[number]>();
  for (const r of hornPlan.value.recommendations) {
    map.set(r.head.bossHeadId, r);
  }
  return map;
});

const resetCountdownText = computed(() => {
  const endDay = hydraState.value.endDay;
  if (!endDay) return '—';
  const diffSec = Math.max(0, Math.floor(endDay - Date.now() / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return `${h}h ${m}m`;
});

async function persistConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;
  await chrome.storage.local.set({
    [HYDRA_CONFIG_STORAGE_KEY]: {
      strategy: strategy.value,
      overkillGuardPct: overkillGuardPct.value,
      preferRaid: preferRaid.value,
      allowSuperTries: allowSuperTries.value,
    },
  }).catch(() => {});
}

async function loadConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
  try {
    const res = await chrome.storage.local.get(HYDRA_CONFIG_STORAGE_KEY);
    const cfg = res?.[HYDRA_CONFIG_STORAGE_KEY];
    if (cfg?.strategy === 'highest-effective' || cfg?.strategy === 'finish-low-hp' || cfg?.strategy === 'target-tier') {
      strategy.value = cfg.strategy;
    }
    if (Number.isFinite(cfg?.overkillGuardPct)) overkillGuardPct.value = Number(cfg.overkillGuardPct);
    if (typeof cfg?.preferRaid === 'boolean') preferRaid.value = cfg.preferRaid;
    if (typeof cfg?.allowSuperTries === 'boolean') allowSuperTries.value = cfg.allowSuperTries;
  } catch (_) {}
}

function selectFirstActiveTier() {
  const firstAliveTier = hydraState.value.tiers.find((t) => t.heads.some((h) => h.isAlive));
  if (firstAliveTier) selectedTierId.value = firstAliveTier.tierId;
}

async function refreshHydraState() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        kind: 'refresh-rpc',
        direct: true,
        calls: [{ name: 'clanBoss_getAll', args: {} }],
      });
      addLog('Requested live Hydra status refresh (clanBoss_getAll).', 'info');
    }
  } catch (err: any) {
    addLog(`Refresh failed: ${err?.message || String(err)}`, 'error');
  } finally {
    isRefreshing.value = false;
  }
}

function getHeroAvatar(id: number): string {
  const meta = getHeroMetadata(id);
  const file = meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${id}.png` : '');
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(file);
  return file;
}

function getHeadBadgeText(head: HydraHeadState): string {
  if (head.isDead) return 'Defeated';
  if (head.isLockedByGuildmate) return 'In Battle';
  if (head.canRaid) return 'Raid Ready';
  return `${head.hpPct}% HP`;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void loadConfig();
      selectFirstActiveTier();
    }
  }
);

onMounted(() => {
  void loadConfig();
  selectFirstActiveTier();
});
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Hydra — Guild Boss & Overkill Guard Planner"
    icon="🐉"
    max-width="max-w-5xl"
    modal-name="hydra"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4 text-xs">
      <!-- Header Status Bar -->
      <section
        id="hydra-status-bar"
        class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
            📯 Regular Horns: {{ hydraState.regularTries }}
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold">
            ✨ Golden Horns: {{ hydraState.superTries }}
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
            ⏱️ Reset: {{ resetCountdownText }}
          </span>
        </div>

        <button
          id="btn-hydra-refresh"
          type="button"
          :disabled="isRefreshing"
          class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
          @click="refreshHydraState"
        >
          {{ isRefreshing ? 'Refreshing...' : '↻ Refresh Hydra' }}
        </button>
      </section>

      <!-- 5-Tier Selector & 6-Head Grid -->
      <section id="hydra-heads-grid" class="space-y-3">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="tier in hydraState.tiers"
            :key="tier.tierId"
            type="button"
            class="cursor-pointer px-2.5 py-1 rounded-lg border font-semibold transition"
            :class="
              selectedTierId === tier.tierId
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
            "
            @click="selectedTierId = tier.tierId"
          >
            {{ tier.shortName }} ({{ tier.defeatedCount }}/{{ tier.totalCount || 6 }})
          </button>
        </div>

        <div v-if="activeTier && activeTier.heads.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          <div
            v-for="head in activeTier.heads"
            :key="head.bossHeadId"
            class="p-3 rounded-xl border flex flex-col gap-2"
            :class="
              head.isDead
                ? 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                : topRecommendation?.head.bossHeadId === head.bossHeadId
                  ? 'bg-emerald-500/5 border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            "
          >
            <div class="flex items-center justify-between gap-2">
              <span class="px-2 py-0.5 rounded-md border font-semibold" :class="head.badgeCls">
                {{ head.icon }} {{ head.element }}
              </span>
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                :class="
                  head.isDead
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    : head.isLockedByGuildmate
                      ? 'bg-amber-500/20 text-amber-500'
                      : head.canRaid
                        ? 'bg-emerald-500/20 text-emerald-500'
                        : 'bg-indigo-500/15 text-indigo-400'
                "
              >
                {{ getHeadBadgeText(head) }}
              </span>
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-mono">
                <span class="text-slate-600 dark:text-slate-300">{{ formatHydraDamage(head.hp) }} / {{ formatHydraDamage(head.maxHp) }}</span>
                <span class="font-bold">{{ head.hpPct }}%</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="head.isDead ? 'bg-slate-400' : head.hpPct < 25 ? 'bg-amber-500' : 'bg-emerald-500'"
                  :style="{ width: `${head.hpPct}%` }"
                />
              </div>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>Best: {{ head.bestDamage > 0 ? formatHydraDamage(head.bestDamage) : '—' }}</span>
              <span
                v-if="recommendationByHeadId.get(head.bossHeadId)?.overkillWarning"
                class="text-amber-500 font-semibold"
              >
                ⚠️ Overkill {{ Math.round((recommendationByHeadId.get(head.bossHeadId)?.wasteRatio || 0) * 100) }}%
              </span>
              <span
                v-else-if="topRecommendation?.head.bossHeadId === head.bossHeadId"
                class="text-emerald-500 font-semibold"
              >
                ★ Best Target
              </span>
            </div>
          </div>
        </div>
        <div
          v-else
          class="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400"
        >
          No Hydra head data observed for this tier yet. Open Hydra in game or click Refresh Hydra.
        </div>
      </section>

      <!-- 3-Team Roster (Auto-Hydrated from teamGetAll.clan_boss) -->
      <section
        id="hydra-teams-panel"
        class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-bold uppercase tracking-wider text-[11px] text-slate-500">
            Saved 3-Team Hydra Roster (from Server)
          </h3>
          <span v-if="topRecommendation" class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            Recommended: {{ topRecommendation.head.tierName }} · {{ topRecommendation.head.element }} ({{ topRecommendation.recommendedMode.toUpperCase() }})
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div
            v-for="(team, idx) in hydraState.savedTeams"
            :key="'hydra-team-' + idx"
            class="p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5"
          >
            <div class="text-[11px] font-bold text-slate-600 dark:text-slate-300">Team {{ idx + 1 }}</div>
            <div v-if="team.length > 0" class="flex items-center gap-1 flex-wrap">
              <img
                v-for="hid in team"
                :key="'h-' + idx + '-' + hid"
                :src="getHeroAvatar(hid)"
                :title="getHeroName(hid)"
                :alt="getHeroName(hid)"
                class="size-7 rounded-md object-cover border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div v-else class="text-[10px] text-slate-400 italic">No heroes saved</div>
          </div>
        </div>
      </section>

      <!-- Overkill Guard & Horn Planner Controls -->
      <section
        id="hydra-auto-controls"
        class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5"
      >
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-500">Target Priority Strategy</span>
            <select
              v-model="strategy"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1"
              @change="persistConfig"
            >
              <option value="highest-effective">Highest Effective Damage</option>
              <option value="finish-low-hp">Finish Low-HP Heads</option>
              <option value="target-tier">Selected Tier First</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-500">Overkill Guard Threshold (%)</span>
            <select
              v-model.number="overkillGuardPct"
              class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1"
              @change="persistConfig"
            >
              <option :value="15">15% (Strict)</option>
              <option :value="25">25% (Recommended)</option>
              <option :value="40">40% (Relaxed)</option>
            </select>
          </label>

          <div class="flex flex-col justify-center gap-1.5 pt-2">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="preferRaid" type="checkbox" @change="persistConfig" />
              <span>Prefer Instant Raid when unlocked</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="allowSuperTries" type="checkbox" @change="persistConfig" />
              <span>Allow Golden Horns (Super Tries)</span>
            </label>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
          <span>
            Planned Horns: <strong>{{ hornPlan.availableHorns }}</strong>
            ({{ hornPlan.regularHornsUsed }} regular + {{ hornPlan.superHornsUsed }} golden)
            <span v-if="hornPlan.skippedLockedCount > 0"> · Skipped {{ hornPlan.skippedLockedCount }} locked by guildmates</span>
          </span>
          <span class="text-[10px] italic">
            Safe Planner Mode active (0-cost tracking &amp; overkill guard).
          </span>
        </div>
      </section>

      <AutomationLogPanel v-if="logs.length > 0" :entries="logs" title="Hydra Activity Log" />
    </div>
  </ModalDialog>
</template>
