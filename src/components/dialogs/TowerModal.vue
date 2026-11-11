<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const isRunning = ref(false);
const towerAutomationMessage = ref('');
const towerRunState = ref<any>(null);

const session = computed(() => cache.value.towerSession?.data || {});
const status = computed(() => cache.value.towerStatus?.data || {});
const isComplete = computed(() => Boolean(session.value?.completed || status.value?.isCleared || status.value?.state === 'win'));
const floorNumber = computed(() => session.value?.floorNumber || (isComplete.value ? 25 : status.value?.floorNumber) || 1);

const heroEntries = computed(() => {
  return Object.entries(cache.value.heroGetAll?.data || {})
    .map(([id, h]: [string, any]) => {
      const meta = getHeroMetadata(id);
      return {
        id: Number(id),
        name: meta?.name || `Hero #${id}`,
        power: Number(h.power) || 0,
        level: Number(h.level) || 1,
      };
    })
    .sort((a, b) => b.power - a.power);
});

// Selected Tower Team (5 heroes)
const selectedHeroIds = ref<number[]>([]);

// Buff definitions & categories
const buffGroups = [
  { label: 'Physical', ids: [8, 14, 26, 30], classes: 'border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200' },
  { label: 'Magic', ids: [9, 15, 27, 33, 45], classes: 'border-indigo-300 bg-indigo-100 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200' },
  { label: 'Physical + Magic', ids: [41], classes: 'border-fuchsia-300 bg-fuchsia-100 text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-200' },
  { label: 'Critical', ids: [2, 7, 13, 28, 29], classes: 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200' },
  { label: 'Vampirism', ids: [11, 16], classes: 'border-pink-300 bg-pink-100 text-pink-950 dark:border-pink-800 dark:bg-pink-950/60 dark:text-pink-200' },
  { label: 'Control', ids: [3, 5, 18, 31, 32], classes: 'border-cyan-300 bg-cyan-100 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200' },
  { label: 'Health', ids: [17, 34, 35, 37], classes: 'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' },
  { label: 'Energy', ids: [6, 25, 38, 39, 46], classes: 'border-yellow-300 bg-yellow-100 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200' },
  { label: 'Defense', ids: [10, 12, 36, 42, 43], classes: 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  { label: 'Damage', ids: [1, 4, 40], classes: 'border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-200' },
  { label: 'Utility', ids: [44], classes: 'border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200' },
];

const effectIcons: Record<number, string> = {
  1: '💥', 2: '🎯', 3: '✴', 4: '💥', 5: '✴', 7: '🎯', 11: '🩸', 13: '🎯',
  16: '🩸', 18: '🔇', 26: '💥', 27: '💥', 28: '🎯', 29: '🎯', 30: '💥',
  31: '👁', 32: '🔇', 33: '💥', 40: '💥', 41: '💥', 42: '💥', 45: '💥',
};

const buffOrder = ref<number[]>([]);

function getCatalog() {
  return (globalThis as any).hwaHelperTowerBuffs || {};
}

function getBuffGroup(id: number) {
  return buffGroups.find((g) => g.ids.includes(id));
}

function getBuffInfo(id: number) {
  const cat = getCatalog();
  return cat[id] || { name: `Buff #${id}`, description: '' };
}

function initBuffOrder(saved?: number[]) {
  const cat = getCatalog();
  const allIds = Object.keys(cat).map(Number).sort((a, b) => a - b);
  const defaultOrder = (globalThis as any).hwaHelperTowerAutomation?.DEFAULT_BUFF_PRIORITY || allIds;
  const merged = [...new Set([...(saved || []), ...defaultOrder, ...allIds])].filter((id) => cat[id] != null);
  buffOrder.value = merged.length > 0 ? merged : defaultOrder;
}

// Storage sync
async function loadTowerSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['towerAutomationSettings', 'towerRun']);
      if (stored.towerAutomationSettings) {
        if (Array.isArray(stored.towerAutomationSettings.heroes) && stored.towerAutomationSettings.heroes.length === 5) {
          selectedHeroIds.value = [...stored.towerAutomationSettings.heroes];
        }
        if (Array.isArray(stored.towerAutomationSettings.buffPriority) && stored.towerAutomationSettings.buffPriority.length > 0) {
          initBuffOrder(stored.towerAutomationSettings.buffPriority);
        } else {
          initBuffOrder();
        }
      } else {
        initBuffOrder();
      }

      if (stored.towerRun) {
        towerRunState.value = stored.towerRun;
        isRunning.value = !['stopped', 'complete'].includes(stored.towerRun.phase);
      }
    } catch (_) {
      initBuffOrder();
    }
  } else {
    initBuffOrder();
  }

  // Fallback to top 5 if empty
  if (selectedHeroIds.value.length === 0 && heroEntries.value.length >= 5) {
    selectedHeroIds.value = heroEntries.value.slice(0, 5).map((h) => h.id);
  }
}

async function saveTowerSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    const accountId = cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id ?? null;
    await chrome.storage.local.set({
      towerAutomationSettings: {
        accountId,
        heroes: [...selectedHeroIds.value],
        buffPriority: [...buffOrder.value],
      },
    });
  }
}

function autoFillTop5() {
  selectedHeroIds.value = heroEntries.value.slice(0, 5).map((h) => h.id);
  saveTowerSettings();
}

function handleHeroSlotChange(slotIdx: number, heroId: number) {
  selectedHeroIds.value[slotIdx] = heroId;
  saveTowerSettings();
}

// Reordering logic
let draggedBuffId: number | null = null;

function onDragStart(id: number) {
  draggedBuffId = id;
}

function onDrop(targetId: number) {
  if (draggedBuffId == null || draggedBuffId === targetId) return;
  const fromIdx = buffOrder.value.indexOf(draggedBuffId);
  const toIdx = buffOrder.value.indexOf(targetId);
  if (fromIdx !== -1 && toIdx !== -1) {
    buffOrder.value.splice(fromIdx, 1);
    buffOrder.value.splice(toIdx, 0, draggedBuffId);
    saveTowerSettings();
  }
  draggedBuffId = null;
}

function moveBuff(id: number, direction: 'prev' | 'next') {
  const idx = buffOrder.value.indexOf(id);
  if (idx === -1) return;
  const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= buffOrder.value.length) return;
  buffOrder.value.splice(idx, 1);
  buffOrder.value.splice(targetIdx, 0, id);
  saveTowerSettings();
}

// Start / Stop Automation
async function toggleTowerRun() {
  if (isRunning.value) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const resp = await chrome.runtime.sendMessage({ kind: 'tower-run-stop' });
      towerAutomationMessage.value = resp?.ok ? 'Tower automation stopped.' : (resp?.error || 'Could not stop Tower automation.');
    }
    isRunning.value = false;
  } else {
    isRunning.value = true;
    towerAutomationMessage.value = 'Tower automation starting...';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const resp = await chrome.runtime.sendMessage({
        kind: 'tower-run-start',
        heroes: selectedHeroIds.value,
        buffPriority: buffOrder.value,
      });
      towerAutomationMessage.value = resp?.ok
        ? 'Tower automation started. Running automatically...'
        : (resp?.error || 'Could not start Tower automation.');
      if (!resp?.ok) {
        isRunning.value = false;
      }
    }
  }
}

async function refreshTower() {
  await dispatchRpc([{ name: 'towerGetInfo' }]);
}

// Accordion floor tracking
const expandedFloor = ref<number | null>(null);

const floorGroups = computed(() => {
  const entries = session.value?.history || [];
  const map = new Map<number, any>();
  for (const event of entries) {
    const f = Number(event.floor);
    if (Number.isInteger(f) && f > 0) {
      if (!map.has(f)) {
        map.set(f, {
          floor: f,
          battle: null,
          buff: null,
          chest: null,
          events: [],
        });
      }
      const g = map.get(f)!;
      g.events.push(event);
      if (event.action === 'endBattle') g.battle = event;
      else if (event.action === 'activateBuff') g.buff = event;
      else if (event.action === 'openChest') g.chest = event;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.floor - b.floor);
});

function toggleFloorExpand(f: number) {
  expandedFloor.value = expandedFloor.value === f ? null : f;
}

// Storage change listener
function handleStorageChange(changes: Record<string, any>) {
  if (changes.towerRun) {
    towerRunState.value = changes.towerRun.newValue;
    isRunning.value = changes.towerRun.newValue && !['stopped', 'complete'].includes(changes.towerRun.newValue.phase);
  }
}

onMounted(() => {
  loadTowerSettings();
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
});

onUnmounted(() => {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  }
});

watch(() => props.modelValue, (open) => {
  if (open) {
    loadTowerSettings();
  }
});
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Tower Automation"
    max-width="max-w-3xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4 text-xs">
      <!-- Status & Automation Banner -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="text-3xl">🗼</span>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Magic Tower Auto-Climb</h3>
              <span
                id="tower-modal-badge"
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="
                  isComplete
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                "
              >
                {{ isComplete ? 'Completed ✓' : `Floor ${floorNumber} / 25` }}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Automates door selection, skull buff purchases, and 1 free chest per chest floor.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            @click="refreshTower"
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            :disabled="isComplete || selectedHeroIds.length !== 5"
            class="cursor-pointer px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              isRunning
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            "
            @click="toggleTowerRun"
          >
            <span>{{ isComplete ? 'Tower Cleared' : isRunning ? '⏹ Stop Tower Run' : '▶ Start Auto Tower' }}</span>
          </button>
        </div>
      </section>

      <!-- Live Run Status Message -->
      <div
        v-if="towerRunState || towerAutomationMessage"
        class="rounded-lg p-3 text-xs border"
        :class="isRunning ? 'bg-violet-50/70 border-violet-200 text-violet-900 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-200' : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'"
      >
        <div v-if="towerRunState" class="font-bold">
          Status: {{ towerRunState.phase }}
          {{ towerRunState.floor ? ` · Floor ${towerRunState.floor}, Room ${towerRunState.room}` : '' }}
          {{ towerRunState.reason ? ` · ${towerRunState.reason}` : '' }}
        </div>
        <div v-if="towerAutomationMessage" class="mt-0.5 text-slate-600 dark:text-slate-400">
          {{ towerAutomationMessage }}
        </div>
      </div>

      <!-- Tower Team Lineup (5 Hero Selectors) -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>🦸</span> Magic Tower Combat Team (5 Heroes)
          </h3>
          <button
            v-if="heroEntries.length >= 5"
            type="button"
            :disabled="isRunning"
            class="cursor-pointer text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
            @click="autoFillTop5"
          >
            ⚡ Auto-fill Top 5 Power
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <div
            v-for="(_, idx) in 5"
            :key="idx"
            class="space-y-1"
          >
            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Slot #{{ idx + 1 }}
            </label>
            <select
              :value="selectedHeroIds[idx] || (heroEntries[idx]?.id ?? '')"
              :disabled="isRunning"
              class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
              @change="handleHeroSlotChange(idx, Number(($event.target as HTMLSelectElement).value))"
            >
              <option
                v-for="h in heroEntries"
                :key="h.id"
                :value="h.id"
              >
                {{ h.name }} ({{ h.power ? formatNumber(h.power) : `Lv.${h.level}` }})
              </option>
            </select>
          </div>
        </div>

        <p class="text-[11px] text-slate-400">
          🚪 Combat choices automatically prioritize doors leading to buffs following the priority order below.
        </p>
      </section>

      <!-- Buff Strategy & Priorities -->
      <section class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>✨</span> Buff Priority & Door Route Strategy
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Drag buffs or use ◀ / ▶ buttons to reorder. Routes prioritize doors offering highest-priority buffs. First offered buff matching priority is auto-purchased.
          </p>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-for="cat in buffGroups"
            :key="cat.label"
            class="rounded-full border px-2 py-0.5 text-[10px] font-medium"
            :class="cat.classes"
          >
            {{ cat.label }}
          </span>
        </div>

        <!-- Interactive Buff Priority Pills List -->
        <div class="flex flex-wrap gap-1.5 pt-2 max-h-[300px] overflow-y-auto pr-1">
          <div
            v-for="(id, idx) in buffOrder"
            :key="`buff-${id}`"
            draggable="true"
            class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium cursor-grab active:cursor-grabbing transition-transform"
            :class="getBuffGroup(id)?.classes || 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200'"
            :title="`${getBuffGroup(id)?.label || 'Other'} · ${getBuffInfo(id).description}`"
            @dragstart="onDragStart(id)"
            @dragover.prevent
            @drop="onDrop(id)"
          >
            <span class="font-mono text-2xs font-bold opacity-70">#{{ idx + 1 }}</span>
            <span>{{ String(id).padStart(2, '0') }}. {{ getBuffInfo(id).name }}</span>
            <span v-if="effectIcons[id]" aria-hidden="true">{{ effectIcons[id] }}</span>

            <!-- Move buttons -->
            <div class="flex items-center ml-1 border-l border-current/20 pl-1 gap-0.5">
              <button
                type="button"
                :disabled="idx === 0"
                class="hover:opacity-100 opacity-60 text-[9px] px-0.5 cursor-pointer disabled:opacity-20"
                title="Move higher priority"
                @click.stop="moveBuff(id, 'prev')"
              >
                ◀
              </button>
              <button
                type="button"
                :disabled="idx === buffOrder.length - 1"
                class="hover:opacity-100 opacity-60 text-[9px] px-0.5 cursor-pointer disabled:opacity-20"
                title="Move lower priority"
                @click.stop="moveBuff(id, 'next')"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        <!-- Automation Policy Notes -->
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
          <div>• <strong>Chest Policy:</strong> Opens the single free chest per chest floor. Emerald chests are never touched.</div>
          <div>• <strong>Battle Runner:</strong> Automatically completes floor combat and executes buff/chest actions until completion or loss.</div>
        </div>
      </section>

      <!-- Traversed Floors Progress Accordion -->
      <section
        v-if="floorGroups.length > 0"
        data-tower-accordion="true"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 shadow-xs"
      >
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>📜</span> Route & Traversed Floors History
        </h3>

        <div class="space-y-1.5 mt-2">
          <div
            v-for="group in floorGroups"
            :key="`floor-${group.floor}`"
            :data-tower-floor="String(group.floor)"
            class="rounded-lg border overflow-hidden transition-all"
            :class="expandedFloor === group.floor ? 'border-violet-300 bg-violet-50/20 dark:border-violet-800 dark:bg-violet-950/20 shadow-xs' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80'"
          >
            <button
              type="button"
              class="w-full flex items-center justify-between p-2.5 text-left transition-colors cursor-pointer gap-2 select-none text-xs"
              @click="toggleFloorExpand(group.floor)"
            >
              <div class="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <span class="rounded bg-violet-100 px-1.5 py-0.5 text-2xs font-bold text-violet-800 dark:bg-violet-950/80 dark:text-violet-300">
                  Floor {{ group.floor }}
                </span>
                <span v-if="group.battle" class="font-semibold text-slate-800 dark:text-slate-200">
                  ⚔️ {{ group.battle.win ? 'Victory' : 'Defeat' }}
                </span>
                <span v-if="group.buff" class="text-violet-700 dark:text-violet-300">
                  ✨ {{ getBuffInfo(group.buff.buffId).name }}
                </span>
                <span v-if="group.chest" class="text-emerald-700 dark:text-emerald-400">
                  🎁 Chest #{{ group.chest.number }}
                </span>
              </div>
              <span class="text-slate-400 text-xs">{{ expandedFloor === group.floor ? '▲' : '▼' }}</span>
            </button>

            <div
              v-if="expandedFloor === group.floor"
              :id="`tower-floor-detail-${group.floor}`"
              class="border-t border-slate-200/80 dark:border-slate-800 p-3 space-y-1 bg-slate-50/70 dark:bg-slate-950/40 text-xs text-slate-600 dark:text-slate-400"
            >
              <div v-for="(ev, evIdx) in group.events" :key="evIdx">
                <span v-if="ev.action === 'endBattle'">
                  Floor {{ ev.floor }}, Room {{ ev.room }}: {{ ev.win ? 'Victory' : 'Defeat' }}
                  {{ ev.stars != null ? ` · ${ev.stars} stars` : '' }}
                </span>
                <span v-else-if="ev.action === 'activateBuff'">
                  Floor {{ ev.floor }}, Room {{ ev.room }}: Selected {{ getBuffInfo(ev.buffId).name }}
                </span>
                <span v-else-if="ev.action === 'openChest'">
                  Floor {{ ev.floor }}, Room {{ ev.room }}: Opened chest #{{ ev.number }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </ModalDialog>
</template>
