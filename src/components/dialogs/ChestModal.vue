<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { getItemName } from '@/src/data/nameData';
import { getItemIcon } from '@/src/utils/itemResources';
import { formatNumber } from '@/src/utils/formatters';
import {
  isOpenableChest,
  isChoiceChest,
  getChestChoices,
  aggregateChestRewards,
  type ChestChoiceOption,
  type AggregatedReward
} from '@/src/utils/chestHelper';

interface Props {
  modelValue: boolean;
  initialChestId?: number | string | null;
  initialCategory?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  initialChestId: null,
  initialCategory: null
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { isTopModal, getModalStackLevel, closeModal } = useModals();

const stackLevel = computed(() => getModalStackLevel('chest', 70));

interface OpenableChestItem {
  id: string | number;
  category: string;
  rawCategory: string;
  name: string;
  amount: number;
}

// Extract all openable chests from cache (inventoryGet)
const openableChests = computed<OpenableChestItem[]>(() => {
  const inv = cache.value?.inventoryGet?.data || {};
  const list: OpenableChestItem[] = [];

  for (const [cat, subMap] of Object.entries(inv)) {
    if (typeof subMap === 'object' && subMap !== null) {
      for (const [id, amt] of Object.entries(subMap as Record<string, any>)) {
        const count = Number(amt) || 0;
        if (count <= 0) continue;
        const strId = String(id);
        const name = getItemName(cat, strId) || `${cat} #${strId}`;
        const itemObj = { id: strId, category: cat, rawCategory: cat, name, amount: count };

        if (isOpenableChest(itemObj)) {
          list.push(itemObj);
        }
      }
    }
  }

  // Sort by amount descending
  return list.sort((a, b) => b.amount - a.amount);
});

const selectedChestId = ref<string | number | null>(null);

// Sync with initialChestId or fallback to first available
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      if (props.initialChestId) {
        selectedChestId.value = String(props.initialChestId);
      } else if (!selectedChestId.value && openableChests.value.length > 0) {
        selectedChestId.value = openableChests.value[0].id;
      }
      lastOpenedRewards.value = [];
      lastOpenNotice.value = '';
    }
  },
  { immediate: true }
);

watch(
  () => props.initialChestId,
  (newId) => {
    if (newId) {
      selectedChestId.value = String(newId);
    }
  }
);

// If selected chest runs out of stock, retain selection if in openable or switch to first available
watch(openableChests, (chests) => {
  if (chests.length > 0 && selectedChestId.value != null) {
    const exists = chests.some((c) => String(c.id) === String(selectedChestId.value));
    if (!exists && chests[0]) {
      selectedChestId.value = chests[0].id;
    }
  }
});

const activeChest = computed<OpenableChestItem | null>(() => {
  if (!selectedChestId.value) return openableChests.value[0] || null;
  return openableChests.value.find((c) => String(c.id) === String(selectedChestId.value)) || null;
});

const isChoice = computed(() => {
  if (!activeChest.value) return false;
  return isChoiceChest(activeChest.value.id);
});

const choices = computed<ChestChoiceOption[]>(() => {
  if (!activeChest.value) return [];
  return getChestChoices(activeChest.value.id);
});

const selectedChoiceIndex = ref<number>(0);
const openAmount = ref<number>(1);
const isOpening = ref(false);
const lastOpenedRewards = ref<AggregatedReward[]>([]);
const lastOpenNotice = ref<string>('');

// Reset choice and amount when active chest changes
watch(selectedChestId, () => {
  selectedChoiceIndex.value = 0;
  openAmount.value = 1;
  lastOpenedRewards.value = [];
  lastOpenNotice.value = '';
});

// Clamp openAmount to owned stock
const maxAmount = computed(() => activeChest.value?.amount || 0);

watch(maxAmount, (max) => {
  if (openAmount.value > max && max > 0) {
    openAmount.value = max;
  } else if (openAmount.value <= 0 && max > 0) {
    openAmount.value = 1;
  }
});

function setAmount(n: number) {
  if (maxAmount.value <= 0) {
    openAmount.value = 1;
    return;
  }
  openAmount.value = Math.max(1, Math.min(n, maxAmount.value));
}

function setMaxAmount() {
  if (maxAmount.value > 0) {
    openAmount.value = maxAmount.value;
  }
}

function getChestImg(chest: OpenableChestItem | null): string {
  if (!chest) return '';
  const path = getItemIcon(chest.rawCategory || chest.category, chest.id);
  return path && typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL(path)
    : path || '';
}

function getRewardImg(reward: AggregatedReward | { type: string; id: string | number }): string {
  const path = getItemIcon(reward.type, reward.id);
  return path && typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL(path)
    : path || '';
}

async function handleOpenChest() {
  if (isOpening.value || !activeChest.value || maxAmount.value <= 0 || openAmount.value <= 0) return;

  const numLibId = Number(activeChest.value.id);
  const count = Math.min(Number(openAmount.value), maxAmount.value);
  const choiceParam = isChoice.value ? Number(selectedChoiceIndex.value) : -1;

  isOpening.value = true;
  lastOpenedRewards.value = [];
  lastOpenNotice.value = '';

  try {
    const calls = [
      {
        name: 'inventory_use',
        args: {
          libId: numLibId,
          amount: count,
          params: { choice: choiceParam }
        }
      },
      { name: 'inventoryGet' },
      { name: 'userGetInfo' }
    ];

    const results = await dispatchRpc(calls);
    const useResult = Array.isArray(results)
      ? results.find((r: any) => r?.result?.response) || results[0]
      : results;

    const rawResponse = useResult?.result?.response;
    if (rawResponse) {
      const rewards = aggregateChestRewards(rawResponse);
      lastOpenedRewards.value = rewards;
      lastOpenNotice.value = `Successfully opened ${count}x ${activeChest.value.name}!`;
    } else {
      lastOpenNotice.value = `Opened ${count}x ${activeChest.value.name}!`;
    }

    // Reset open amount if current is above remaining stock
    const remaining = Math.max(0, maxAmount.value - count);
    if (remaining > 0 && openAmount.value > remaining) {
      openAmount.value = remaining;
    }
  } catch (err: any) {
    console.error('Failed to open chest:', err);
    lastOpenNotice.value = `Failed to open chest: ${err?.message || 'Server error'}`;
  } finally {
    isOpening.value = false;
  }
}

function handleClose() {
  emit('update:modelValue', false);
  closeModal('chest');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isTopModal('chest')) {
    handleClose();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    v-if="modelValue"
    id="chest-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="chest-dialog-title"
    :style="{ zIndex: stackLevel }"
    class="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    @click.self="handleClose"
  >
    <div
      class="w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:bg-slate-900 dark:border-slate-800 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xl shrink-0" aria-hidden="true">🎁</span>
          <h2 id="chest-dialog-title" class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">
            Open Chests & Caskets
          </h2>
          <span
            v-if="openableChests.length > 0"
            class="px-2 py-0.5 rounded-full text-3xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 shrink-0"
          >
            {{ openableChests.length }} Available
          </span>
        </div>

        <button
          type="button"
          aria-label="Close dialog"
          class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          @click="handleClose"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Dialog Body -->
      <div class="p-4 overflow-y-auto space-y-4 flex-1">
        <!-- Empty State if no openable chests -->
        <div
          v-if="openableChests.length === 0"
          class="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 text-slate-500 space-y-2"
        >
          <div class="text-3xl">📦</div>
          <div class="font-bold text-sm">No Openable Chests Found</div>
          <div class="text-xs text-slate-400">
            You do not currently have any chests, caskets, or choice containers in your inventory.
          </div>
        </div>

        <template v-else>
          <!-- Chest Selector (Horizontal pill/card list if multiple) -->
          <div v-if="openableChests.length > 1" class="space-y-1.5">
            <label class="block text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Select Chest to Open
            </label>
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
              <button
                v-for="c in openableChests"
                :key="c.id"
                type="button"
                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition-all cursor-pointer select-none"
                :class="
                  String(selectedChestId) === String(c.id)
                    ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200 shadow-2xs font-bold ring-2 ring-blue-400/40'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300'
                "
                @click="selectedChestId = c.id"
              >
                <img
                  v-if="getChestImg(c)"
                  :src="getChestImg(c)"
                  :alt="c.name"
                  class="size-5 object-contain rounded"
                />
                <span v-else>🎁</span>
                <span class="truncate max-w-[140px]">{{ c.name }}</span>
                <span class="px-1.5 py-0.2 rounded-full text-3xs font-mono font-bold bg-slate-200/80 dark:bg-slate-750 text-slate-700 dark:text-slate-300">
                  {{ formatNumber(c.amount) }}
                </span>
              </button>
            </div>
          </div>

          <!-- Active Chest Details Card -->
          <div
            v-if="activeChest"
            class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-3.5 shadow-2xs space-y-3"
          >
            <div class="flex items-center gap-3">
              <div class="size-14 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center p-1.5 shrink-0 border border-slate-200 dark:border-slate-600 shadow-2xs">
                <img
                  v-if="getChestImg(activeChest)"
                  :src="getChestImg(activeChest)"
                  :alt="activeChest.name"
                  class="size-full object-contain"
                />
                <span v-else class="text-2xl">🎁</span>
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight">
                    {{ activeChest.name }}
                  </h3>
                  <span
                    class="px-2 py-0.5 rounded text-3xs font-bold tracking-wider uppercase"
                    :class="
                      isChoice
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                    "
                  >
                    {{ isChoice ? 'Choice Chest' : 'Random Loot' }}
                  </span>
                </div>

                <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>In Inventory:</span>
                  <span class="font-bold font-mono text-slate-800 dark:text-slate-200 text-sm">
                    {{ formatNumber(activeChest.amount) }}
                  </span>
                  <span class="text-slate-300 dark:text-slate-600">•</span>
                  <span class="font-mono text-2xs text-slate-400">#{{ activeChest.id }}</span>
                </div>
              </div>
            </div>

            <!-- Choice Selector (if isChoice) -->
            <div v-if="isChoice" class="pt-2 border-t border-slate-100 dark:border-slate-700/60 space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Select Reward Option:
                </label>
                <span class="text-3xs text-slate-400">Pick 1 reward per chest</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  v-for="opt in choices"
                  :key="opt.choiceIndex"
                  class="flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none"
                  :class="
                    selectedChoiceIndex === opt.choiceIndex
                      ? 'border-emerald-500 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-400/50 shadow-2xs font-semibold'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-300'
                  "
                  @click="selectedChoiceIndex = opt.choiceIndex"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <div class="size-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center p-1 shrink-0 border border-slate-200 dark:border-slate-700">
                      <img
                        v-if="opt.reward.icon"
                        :src="getRewardImg(opt.reward)"
                        :alt="opt.reward.name"
                        class="size-full object-contain"
                      />
                      <span v-else class="text-xs">✨</span>
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-bold truncate" :title="opt.reward.name">
                        {{ opt.reward.name }}
                      </div>
                      <div class="text-2xs text-slate-500 dark:text-slate-400">
                        +{{ opt.reward.amount }} per chest
                      </div>
                    </div>
                  </div>

                  <div class="text-right shrink-0 pl-2">
                    <span
                      v-if="selectedChoiceIndex === opt.choiceIndex"
                      class="size-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-3xs font-bold shadow-xs"
                    >
                      ✓
                    </span>
                    <span v-else class="size-5 rounded-full border border-slate-300 dark:border-slate-600 inline-block"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Random description banner (if not choice) -->
            <div
              v-else
              class="p-2.5 rounded-lg border border-purple-200 bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/20 text-xs text-purple-900 dark:text-purple-200 flex items-center gap-2"
            >
              <span class="text-base shrink-0">🎲</span>
              <div>
                This chest grants random gear fragments, consumable items, or scrolls upon opening.
              </div>
            </div>
          </div>

          <!-- Quantity Selector & Action Controls -->
          <div
            v-if="activeChest && activeChest.amount > 0"
            class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 p-3.5 shadow-2xs space-y-3"
          >
            <div class="flex items-center justify-between">
              <label class="block text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Quantity to Open
              </label>
              <div class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Opening <span class="font-bold text-blue-600 dark:text-blue-400">{{ openAmount }}</span> / {{ activeChest.amount }}
              </div>
            </div>

            <!-- Stepper and Quick Amount Buttons -->
            <div class="flex items-center gap-2">
              <div class="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden shrink-0">
                <button
                  type="button"
                  :disabled="openAmount <= 1 || isOpening"
                  class="size-8 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  @click="setAmount(openAmount - 1)"
                >
                  −
                </button>
                <input
                  v-model.number="openAmount"
                  type="number"
                  min="1"
                  :max="maxAmount"
                  :disabled="isOpening"
                  class="w-14 text-center text-xs font-bold font-mono bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden"
                />
                <button
                  type="button"
                  :disabled="openAmount >= maxAmount || isOpening"
                  class="size-8 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  @click="setAmount(openAmount + 1)"
                >
                  +
                </button>
              </div>

              <!-- Quick buttons: 1, 5, 10, Max -->
              <div class="flex items-center gap-1.5 flex-wrap flex-1">
                <button
                  type="button"
                  :disabled="isOpening"
                  class="px-2 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer disabled:opacity-40"
                  @click="setAmount(1)"
                >
                  1
                </button>
                <button
                  v-if="maxAmount >= 5"
                  type="button"
                  :disabled="isOpening"
                  class="px-2 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer disabled:opacity-40"
                  @click="setAmount(5)"
                >
                  5
                </button>
                <button
                  v-if="maxAmount >= 10"
                  type="button"
                  :disabled="isOpening"
                  class="px-2 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer disabled:opacity-40"
                  @click="setAmount(10)"
                >
                  10
                </button>
                <button
                  type="button"
                  :disabled="isOpening"
                  class="px-2.5 py-1 rounded-md text-xs font-bold border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-40"
                  @click="setMaxAmount"
                >
                  Max ({{ formatNumber(maxAmount) }})
                </button>
              </div>
            </div>

            <!-- Expected Total Yield for choice chest -->
            <div
              v-if="isChoice && choices[selectedChoiceIndex]"
              class="text-xs text-slate-600 dark:text-slate-300 font-medium flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30"
            >
              <span>Total you will receive:</span>
              <span class="font-bold text-emerald-700 dark:text-emerald-400">
                +{{ formatNumber(choices[selectedChoiceIndex].reward.amount * openAmount) }} {{ choices[selectedChoiceIndex].reward.name }}
              </span>
            </div>

            <!-- Open Button -->
            <button
              id="btn-open-chest-execute"
              type="button"
              :disabled="isOpening || maxAmount <= 0 || openAmount <= 0"
              class="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 select-none active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
              :class="[
                isChoice
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-purple-600 hover:bg-purple-500 text-white',
                isOpening ? 'pointer-events-none ring-2 ring-white/50' : ''
              ]"
              @click="handleOpenChest"
            >
              <span v-if="isOpening" class="animate-spin text-sm font-bold leading-none inline-block">↻</span>
              <span v-else>✨</span>
              <span>
                {{ isOpening ? 'Opening...' : `Open ${openAmount}x ${activeChest.name}` }}
              </span>
            </button>
          </div>

          <!-- Unboxed Rewards Display -->
          <div
            v-if="lastOpenedRewards.length > 0"
            id="chest-rewards-section"
            class="rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 shadow-2xs space-y-2.5 animate-in fade-in"
          >
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <span>🎉</span>
                <span>Received Loot ({{ lastOpenedRewards.length }} Items)</span>
              </h4>
              <span class="text-2xs text-emerald-700 dark:text-emerald-400 font-medium">
                Added to inventory
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div
                v-for="rew in lastOpenedRewards"
                :key="`${rew.type}-${rew.id}`"
                class="flex items-center gap-2.5 p-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200/80 dark:border-emerald-900/50 shadow-2xs"
              >
                <div class="size-9 rounded-lg bg-slate-50 dark:bg-slate-700/60 flex items-center justify-center p-1 shrink-0 border border-slate-200 dark:border-slate-600">
                  <img
                    v-if="rew.icon"
                    :src="getRewardImg(rew)"
                    :alt="rew.name"
                    class="size-full object-contain"
                  />
                  <span v-else class="text-sm">💎</span>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" :title="rew.name">
                    {{ rew.name }}
                  </div>
                  <div class="text-3xs font-mono text-slate-400">
                    {{ rew.type }} #{{ rew.id }}
                  </div>
                </div>

                <div class="text-right shrink-0">
                  <span class="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    +{{ formatNumber(rew.amount) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Dialog Footer -->
      <div
        class="sticky bottom-0 z-10 flex items-center justify-end border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 shrink-0"
      >
        <button
          type="button"
          class="px-4 py-1.5 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          @click="handleClose"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
