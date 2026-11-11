<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import {
  buildGearRecipeTree,
  findFirstUnfulfilledNode,
  getItemName,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { modalContext } = useModals();

const missionId = ref(135);
const raidResults = ref<any[]>([]);
const isRaidRunning = ref(false);
const quickMissions = [135, 10, 20, 50, 80, 100, 120, 150];

const selectedGearId = ref<number | string | null>(null);
const selectedRecipeNodeId = ref<string | null>(null);

watch(
  [() => modalContext.selectedCampaignGearId, () => props.modelValue],
  () => {
    if (modalContext.selectedCampaignGearId != null) {
      selectedGearId.value = modalContext.selectedCampaignGearId;
      const tree = buildGearRecipeTree(selectedGearId.value, cache.value);
      const unfulfilled = findFirstUnfulfilledNode(tree);
      selectedRecipeNodeId.value = unfulfilled ? unfulfilled.id : (tree ? tree.id : null);

      if (selectedRecipeNodeId.value) {
        const cMissions = (globalThis as any).hwaHelperCampaignMissions;
        const candidates = cMissions?.getMissionsForItem?.(selectedRecipeNodeId.value) || [];
        const highest = cMissions?.getHighestRaidableMission?.(
          candidates.map((m: any) => m.id),
          cache.value?.missionGetAll?.data
        );
        if (highest) {
          missionId.value = highest;
        }
      }
    }
  },
  { immediate: true }
);

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

// Recipe Tree
const recipeTree = computed(() => {
  if (!selectedGearId.value) return null;
  return buildGearRecipeTree(selectedGearId.value, cache.value);
});

// Candidate missions for selected recipe node
const candidateMissions = computed(() => {
  const targetId = selectedRecipeNodeId.value || selectedGearId.value;
  if (!targetId) return [];
  const cMissions = (globalThis as any).hwaHelperCampaignMissions;
  return cMissions?.getMissionsForItem?.(targetId) || [];
});

function selectRecipeNode(node: any) {
  selectedRecipeNodeId.value = node.id;
  const cMissions = (globalThis as any).hwaHelperCampaignMissions;
  const candidates = cMissions?.getMissionsForItem?.(node.id) || [];
  const highest = cMissions?.getHighestRaidableMission?.(
    candidates.map((m: any) => m.id),
    cache.value?.missionGetAll?.data
  );
  if (highest) {
    missionId.value = highest;
  }
}

const isCrafting = ref(false);

async function craftNode(node: any) {
  isCrafting.value = true;
  try {
    const kind = node.fragment || node.isScroll ? 'craft-fragment' : 'craft-recipe';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { kind, type: node.isScroll ? 'scroll' : 'gear', libId: Number(node.id), amount: 1 },
        () => {
          setTimeout(() => {
            dispatchRpc([{ name: 'inventoryGet' }]);
            isCrafting.value = false;
          }, 500);
        }
      );
    } else {
      await dispatchRpc([
        {
          name: kind === 'craft-fragment' ? 'inventoryCraftFragments' : 'inventoryCraftRecipe',
          args: { libId: Number(node.id), amount: 1 },
        },
        { name: 'inventoryGet' },
      ]);
      isCrafting.value = false;
    }
  } catch (_) {
    isCrafting.value = false;
  }
}

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
          <!-- Energy & Status Banner -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
            <div class="space-y-0.5">
              <div class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>⚡</span> Campaign Mission Raid
              </div>
              <div class="text-2xs text-slate-500 dark:text-slate-400">
                Raid campaign missions to farm equipment, fragments, and gold
              </div>
            </div>

            <div class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-bold text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
              <span>⚡ Energy:</span>
              <span class="text-sm font-extrabold">{{ currentEnergy }}</span>
              <span v-if="maxEnergy !== '—'" class="text-amber-500">/ {{ maxEnergy }}</span>
            </div>
          </div>

          <!-- Recipe Tree Hierarchy Section (if farming a gear) -->
          <div v-if="recipeTree" class="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                <span>🛠️</span> Crafting Recipe Tree: <strong class="text-indigo-600 dark:text-indigo-400">{{ recipeTree.name }}</strong>
              </div>
              <button
                v-if="recipeTree.canCraft"
                type="button"
                :disabled="isCrafting"
                class="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-2xs cursor-pointer shadow-xs disabled:opacity-50"
                @click="craftNode(recipeTree)"
              >
                {{ isCrafting ? '...' : 'Craft Item' }}
              </button>
            </div>

            <!-- Root & Children Nodes -->
            <div class="space-y-1.5">
              <div
                class="p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors"
                :class="
                  selectedRecipeNodeId === recipeTree.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                "
                @click="selectRecipeNode(recipeTree)"
              >
                <div class="flex items-center gap-2">
                  <span>🛡️</span>
                  <span class="font-bold">{{ recipeTree.name }}</span>
                  <span class="text-slate-400 text-2xs">Owned: {{ recipeTree.owned }}</span>
                </div>

                <div class="flex items-center gap-1.5">
                  <span
                    v-if="recipeTree.fragment"
                    class="text-2xs font-semibold px-1.5 py-0.5 rounded"
                    :class="
                      recipeTree.fragment.isFulfilled
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    "
                  >
                    Fragments: {{ recipeTree.fragment.owned }}/{{ recipeTree.fragment.required }}
                  </span>
                  <span
                    v-if="recipeTree.isFulfilled"
                    class="text-2xs font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    ✓ Ready
                  </span>
                </div>
              </div>

              <!-- Children Components -->
              <div v-if="recipeTree.children?.length > 0" class="pl-4 space-y-1 border-l-2 border-indigo-200 dark:border-indigo-800">
                <div
                  v-for="c in recipeTree.children"
                  :key="c.id"
                  class="p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors"
                  :class="
                    selectedRecipeNodeId === c.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 dark:border-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  "
                  @click="selectRecipeNode(c)"
                >
                  <div class="flex items-center gap-2">
                    <span>{{ c.isScroll ? '📜' : '🧩' }}</span>
                    <span class="font-medium">{{ c.name }}</span>
                    <span class="text-slate-400 text-2xs">Req: {{ c.requiredCount }} · Owned: {{ c.owned }}</span>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <span
                      v-if="c.fragment"
                      class="text-2xs font-semibold px-1.5 py-0.5 rounded"
                      :class="
                        c.fragment.isFulfilled
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      "
                    >
                      Frags: {{ c.fragment.owned }}/{{ c.fragment.required }}
                    </span>
                    <button
                      v-if="c.canCraft"
                      type="button"
                      :disabled="isCrafting"
                      class="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-3xs cursor-pointer shadow-xs disabled:opacity-50"
                      @click.stop="craftNode(c)"
                    >
                      Craft
                    </button>
                    <span
                      v-else-if="c.isFulfilled"
                      class="text-2xs font-bold text-emerald-600 dark:text-emerald-400"
                    >
                      ✓
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Mission Setup & Candidate Chips -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs">
            <div class="flex items-center justify-between gap-2">
              <label class="font-bold text-slate-800 dark:text-slate-200 text-xs">
                Target Campaign Mission
              </label>
              <div class="flex items-center gap-1.5">
                <span class="text-2xs text-slate-400">Mission ID:</span>
                <input
                  id="campaign-mission-input"
                  v-model.number="missionId"
                  type="number"
                  min="1"
                  max="300"
                  class="w-20 rounded border border-slate-300 px-2 py-1 text-center font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus:outline-hidden"
                />
              </div>
            </div>

            <!-- Candidate Missions Chips (from item drop data) -->
            <div v-if="candidateMissions.length > 0" class="space-y-1">
              <div class="text-2xs font-medium text-slate-400">Recommended missions dropping this item:</div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="m in candidateMissions"
                  :key="m.id"
                  type="button"
                  class="cursor-pointer px-2 py-1 rounded text-2xs font-semibold border transition-all"
                  :class="
                    missionId === m.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-indigo-400'
                  "
                  @click="missionId = m.id"
                >
                  Mission #{{ m.id }} (Ch.{{ m.chapter }}-{{ m.index }})
                </button>
              </div>
            </div>

            <!-- Quick Jump Chips -->
            <div v-else class="flex flex-wrap gap-1.5">
              <button
                v-for="qId in quickMissions"
                :key="qId"
                type="button"
                class="cursor-pointer px-2 py-1 rounded text-2xs font-semibold border transition-all"
                :class="
                  missionId === qId
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 hover:border-indigo-400'
                "
                @click="missionId = qId"
              >
                Mission #{{ qId }}
              </button>
            </div>

            <!-- Raid Controls -->
            <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                :disabled="isRaidRunning"
                class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
                @click="executeRaid(1)"
              >
                ⚔️ Raid 1x
              </button>
              <button
                type="button"
                :disabled="isRaidRunning"
                class="cursor-pointer flex-1 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
                @click="executeRaid(10)"
              >
                ⚔️ Raid 10x
              </button>
            </div>
          </div>

          <!-- Raid Results Drops -->
          <div v-if="raidResults.length > 0" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/80 shadow-2xs">
            <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>🎁</span> Raid Loot Results ({{ raidResults.length }} items)
            </h4>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div
                v-for="(drop, dIdx) in raidResults"
                :key="dIdx"
                class="p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center gap-2"
              >
                <div class="size-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                  <img
                    v-if="drop.icon"
                    :src="drop.icon"
                    alt="drop"
                    class="size-full object-contain"
                    @error="handleImgError"
                  />
                  <span v-else class="text-sm">💎</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-slate-800 dark:text-slate-100 truncate text-[11px]" :title="getItemName(drop.category || 'gear', drop.id) || drop.name">
                    {{ getItemName(drop.category || 'gear', drop.id) || drop.name || `Item #${drop.id}` }}
                  </div>
                  <div class="text-2xs text-slate-400">
                    Qty: <strong class="text-indigo-600 dark:text-indigo-400">{{ formatNumber(drop.amount || drop.count || 1) }}</strong>
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
