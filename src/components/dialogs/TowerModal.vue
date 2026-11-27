<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useDialogTeamSelection } from '@/src/composables/useDialogTeamSelection';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { towerSettingsForAccount } from '@/src/utils/dialogRpc';
import { getHeroMetadata } from '@/src/utils/metadata';
import { towerActivityState } from '@/src/composables/activityState';
import { registerAutopilotDialogRunner } from '@/src/composables/useAutopilotDialogBridge';
import { TOWER_FLOOR_COUNT } from '@/src/utils/towerRules';
import { towerBuffs } from '@/src/data/towerData';
import { DEFAULT_BUFF_PRIORITY } from '@/src/services/queues/towerAutomation';
import { formatNumber } from '@/src/utils/formatters';
import { getItemIcon } from '@/src/utils/itemResources';
import { getItemName, getHeroName } from '@/src/data/nameData';

export interface TowerRewardItem {
  key: string;
  category: string;
  id?: string | number;
  name: string;
  amount: number;
  iconPath?: string | null;
  emoji: string;
}

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const towerAccountId = computed(() => cache.value.accountStatus?.data?.id ?? cache.value.userGetInfo?.data?.id);
const rememberedTeam = useDialogTeamSelection('tower', towerAccountId);

const isRunning = ref(false);
const towerAutomationMessage = ref('');
const towerRunState = ref<any>(null);

const session = computed(() => cache.value.towerSession?.data || {});
const status = computed(() => cache.value.towerStatus?.data || {});
const isComplete = computed(() => Boolean(
  session.value?.completed ||
  status.value?.isCleared ||
  status.value?.state === 'win' ||
  status.value?.state === 'completed' ||
  (cache.value as any)?.magicTower_briefInfo?.data?.state === 'win' ||
  (cache.value as any)?.['magicTower_briefInfo']?.state === 'win'
));
const floorNumber = computed(() => session.value?.floorNumber || (isComplete.value ? TOWER_FLOOR_COUNT : status.value?.floorNumber) || 1);

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
watch(rememberedTeam.selection, selection => {
  if (selection?.heroIds) selectedHeroIds.value = [...selection.heroIds];
});

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
  return towerBuffs || {};
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
  const defaultOrder = Array.isArray(DEFAULT_BUFF_PRIORITY) ? DEFAULT_BUFF_PRIORITY : allIds;
  const savedList = Array.isArray(saved) ? saved : [];
  const merged = [...new Set([...savedList, ...defaultOrder, ...allIds])].filter((id) => cat[id] != null);
  buffOrder.value = merged.length > 0 ? merged : defaultOrder;
}

watch(towerAccountId, () => {
  selectedHeroIds.value = [];
  void loadTowerSettings();
});

// Storage sync
async function loadTowerSettings() {
  const accountId = towerAccountId.value;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const stored = await chrome.storage.local.get(['towerAutomationSettings', 'towerRun']);
      if (accountId !== towerAccountId.value) return;
      const settings = towerSettingsForAccount(stored.towerAutomationSettings, accountId);
      await rememberedTeam.loadSelection();
      if (accountId !== towerAccountId.value) return;
      const savedHeroes = rememberedTeam.selection.value?.heroIds ?? settings.heroes;
      selectedHeroIds.value = savedHeroes?.length === 5 ? [...savedHeroes] : [];
      initBuffOrder(settings.buffPriority);
      if (stored.towerRun) {
        towerRunState.value = stored.towerRun as { phase?: string };
        isRunning.value = !['stopped', 'complete'].includes(towerRunState.value.phase || 'stopped');
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
    await rememberedTeam.saveSelection({ heroIds: [...selectedHeroIds.value] });
    if (accountId !== towerAccountId.value) return;
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

function moveBuff(id: number, direction: 'prev' | 'next' | 'first') {
  const idx = buffOrder.value.indexOf(id);
  if (idx === -1) return;
  if (direction === 'first') {
    if (idx === 0) return;
    buffOrder.value.splice(idx, 1);
    buffOrder.value.unshift(id);
    saveTowerSettings();
    return;
  }
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

const isRefreshing = ref(false);

async function refreshTower() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'magicTower_briefInfo' }, { name: 'magicTower_getAll' }]);
  } finally {
    isRefreshing.value = false;
  }
}

// -------------------------------------------------------------
// REWARDS PARSING & SUMMARY
// -------------------------------------------------------------

function parseTowerReward(reward: any): TowerRewardItem[] {
  if (!reward || typeof reward !== 'object') return [];
  const items: TowerRewardItem[] = [];

  const add = (category: string, id: string | number | undefined, name: string, amount: number, emoji: string) => {
    if (!amount || !Number.isFinite(amount) || amount <= 0) return;
    const iconPath = id ? getItemIcon(category, id) : null;
    items.push({
      key: id ? `${category}:${id}` : category,
      category,
      id,
      name,
      amount,
      iconPath,
      emoji,
    });
  };

  // Direct currency / resource fields
  if (reward.gold) {
    add('gold', undefined, 'Gold', Number(reward.gold), '🪙');
  }
  if (reward.starmoney || reward.starMoney) {
    add('emerald', undefined, 'Emeralds', Number(reward.starmoney || reward.starMoney), '💎');
  }
  if (reward.towerCoin) {
    add('coin', 3, 'Tower coin', Number(reward.towerCoin), '🗼');
  }
  if (reward.skullCoin) {
    add('coin', 7, 'Skull coin', Number(reward.skullCoin), '💀');
  }
  if (reward.stamina || reward.energy) {
    add('energy', undefined, 'Energy', Number(reward.stamina || reward.energy), '⚡');
  }
  if (reward.experience || reward.xp) {
    add('experience', undefined, 'XP', Number(reward.experience || reward.xp), '✨');
  }

  // Nested dictionary fields (coin, gear, consumable, fragmentHero, etc.)
  for (const [groupKey, groupVal] of Object.entries(reward)) {
    if (['gold', 'starmoney', 'starMoney', 'towerCoin', 'skullCoin', 'stamina', 'energy', 'experience', 'xp', 'towerPoints', 'points'].includes(groupKey)) {
      continue;
    }
    if (groupVal && typeof groupVal === 'object' && !Array.isArray(groupVal)) {
      for (const [id, amt] of Object.entries(groupVal as Record<string, any>)) {
        const numAmt = Number(amt);
        if (!numAmt || numAmt <= 0) continue;

        let name = getItemName(groupKey, id);
        let emoji = '📦';

        if (groupKey === 'coin') {
          if (String(id) === '3') { name = 'Tower coin'; emoji = '🗼'; }
          else if (String(id) === '7') { name = 'Skull coin'; emoji = '💀'; }
          else { name = name || `Coin #${id}`; emoji = '🪙'; }
        } else if (groupKey === 'gear') {
          name = name || `Gear #${id}`;
          emoji = '🛡️';
        } else if (groupKey === 'fragmentHero') {
          const heroName = getHeroName(id);
          name = heroName ? `${heroName} Soul Stone` : `Hero #${id} Soul Stone`;
          emoji = '🦸';
        } else if (groupKey === 'consumable') {
          name = name || `Item #${id}`;
          emoji = '🧪';
        } else if (groupKey === 'scroll') {
          name = name || `Recipe #${id}`;
          emoji = '📜';
        } else if (groupKey === 'material') {
          name = name || `Material #${id}`;
          emoji = '🧱';
        } else {
          name = name || `${groupKey} #${id}`;
        }

        add(groupKey, id, name, numAmt, emoji);
      }
    } else if (typeof groupVal === 'number' || (typeof groupVal === 'string' && Number.isFinite(Number(groupVal)))) {
      const numAmt = Number(groupVal);
      if (numAmt > 0) {
        add('other', undefined, groupKey, numAmt, '🎁');
      }
    }
  }

  return items;
}

const totalChestsOpened = computed(() => {
  const history = session.value?.history || [];
  return history.filter((ev: any) => ev.action === 'openChest').length;
});

const totalBattlesWon = computed(() => {
  const history = session.value?.history || [];
  return history.filter((ev: any) => ev.action === 'endBattle' && ev.win).length;
});

const towerTotalRewards = computed(() => {
  const history = session.value?.history || [];
  const map = new Map<string, TowerRewardItem>();

  for (const ev of history) {
    if (!ev.reward) continue;
    const items = parseTowerReward(ev.reward);
    for (const item of items) {
      const existing = map.get(item.key);
      if (existing) {
        existing.amount += item.amount;
      } else {
        map.set(item.key, { ...item });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const order: Record<string, number> = { gold: 1, 'coin:3': 2, emerald: 3, 'coin:7': 4 };
    const orderA = order[a.key] || order[a.category] || 99;
    const orderB = order[b.key] || order[b.category] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return b.amount - a.amount;
  });
});

const towerCurrencies = computed(() => {
  const all = towerTotalRewards.value;
  return {
    gold: all.find((r) => r.key === 'gold')?.amount || 0,
    towerCoin: all.find((r) => r.key === 'coin:3' || r.name === 'Tower coin')?.amount || 0,
    emerald: all.find((r) => r.key === 'emerald')?.amount || 0,
    skullCoin: all.find((r) => r.key === 'coin:7' || r.name === 'Skull coin')?.amount || 0,
  };
});

const towerOtherRewards = computed(() => {
  return towerTotalRewards.value.filter(
    (r) => !['gold', 'coin:3', 'emerald', 'coin:7'].includes(r.key) && r.name !== 'Tower coin' && r.name !== 'Skull coin'
  );
});

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

const unregisterTowerRunner =
  typeof registerAutopilotDialogRunner === 'function'
    ? registerAutopilotDialogRunner({
        stepId: 'tower',
        modalName: 'tower',
        async run({ isAborted }) {
          await loadTowerSettings();
          const initialState = towerActivityState(cache.value, Date.now());
          if (initialState.state === 'done') {
            return { status: 'done', detail: initialState.detail || 'Tower completed today' };
          }
          if (!isRunning.value) {
            await toggleTowerRun();
          }
          if (!isRunning.value) {
            const errText = towerAutomationMessage.value || 'Could not start Tower automation.';
            return { status: 'error', detail: errText, error: errText };
          }
          const startedAt = Date.now();
          const maxWaitMs = 10 * 60 * 1000;
          while (isRunning.value && Date.now() - startedAt < maxWaitMs) {
            if (isAborted()) {
              await toggleTowerRun();
              return { status: 'skipped', detail: 'Tower automation stopped by user.' };
            }
            const liveState = towerActivityState(cache.value, Date.now());
            if (liveState.state === 'done') break;
            await new Promise((r) => setTimeout(r, 500));
          }
          const finalState = towerActivityState(cache.value, Date.now());
          return {
            status: 'done',
            detail: finalState.detail || towerAutomationMessage.value || 'Tower run finished',
          };
        },
        async stop() {
          if (isRunning.value) {
            await toggleTowerRun();
          }
        },
      })
    : () => {};

onUnmounted(() => {
  unregisterTowerRunner();
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
                {{ isComplete ? 'Completed ✓' : `Floor ${floorNumber} / ${TOWER_FLOOR_COUNT}` }}
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
            :disabled="isRefreshing"
            class="cursor-pointer text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
            @click="refreshTower"
          >
            <span :class="{ 'inline-block animate-spin': isRefreshing }">↻</span>
            <span>Refresh</span>
          </button>

          <!-- Tower Cleared Status Badge (Hides Start Auto when cleared) -->
          <div
            v-if="isComplete && !isRunning"
            id="tower-modal-cleared-badge"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
          >
            <span>✅</span>
            <span>Tower Cleared Today</span>
          </div>

          <button
            v-else
            type="button"
            :disabled="selectedHeroIds.length !== 5"
            class="cursor-pointer px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              isRunning
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            "
            @click="toggleTowerRun"
          >
            <span>{{ isRunning ? '⏹ Stop Tower Run' : '▶ Start Auto Tower' }}</span>
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

      <!-- Tower Rewards Summary Card -->
      <section
        id="tower-rewards-summary"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs"
      >
        <div class="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xl">🏆</span>
            <div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                Tower Run Rewards Summary
              </h3>
              <p class="text-[11px] text-slate-400">
                Total accumulated rewards from chests and floor clears today
              </p>
            </div>
          </div>

          <!-- Quick stats badge -->
          <div class="flex items-center gap-2 text-2xs font-semibold">
            <span class="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/80 text-violet-800 dark:text-violet-300">
              {{ totalBattlesWon }} Battles Won
            </span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
              {{ totalChestsOpened }} Chests Opened
            </span>
          </div>
        </div>

        <!-- Currencies and items breakdown -->
        <div v-if="towerTotalRewards.length > 0" class="space-y-3">
          <!-- Key Currencies Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <!-- Gold -->
            <div class="rounded-lg p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60">
              <div class="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 font-semibold">
                <span>🪙</span>
                <span>Gold</span>
              </div>
              <div class="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                +{{ formatNumber(towerCurrencies.gold) }}
              </div>
            </div>

            <!-- Tower Coin -->
            <div class="rounded-lg p-2.5 bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/60">
              <div class="flex items-center gap-1.5 text-xs text-violet-800 dark:text-violet-300 font-semibold">
                <span>🗼</span>
                <span>Tower Coin</span>
              </div>
              <div class="text-sm font-black text-violet-600 dark:text-violet-400 tabular-nums mt-0.5">
                +{{ formatNumber(towerCurrencies.towerCoin) }}
              </div>
            </div>

            <!-- Emeralds -->
            <div class="rounded-lg p-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60">
              <div class="flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                <span>💎</span>
                <span>Emeralds</span>
              </div>
              <div class="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                +{{ formatNumber(towerCurrencies.emerald) }}
              </div>
            </div>

            <!-- Skull Coins -->
            <div class="rounded-lg p-2.5 bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div class="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-semibold">
                <span>💀</span>
                <span>Skull Coins</span>
              </div>
              <div class="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums mt-0.5">
                +{{ formatNumber(towerCurrencies.skullCoin) }}
              </div>
            </div>
          </div>

          <!-- Other items (Gear, Consumables, Soul Stones) -->
          <div v-if="towerOtherRewards.length > 0" class="space-y-1.5">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Items & Equipment Earned ({{ towerOtherRewards.length }})
            </span>
            <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              <div
                v-for="item in towerOtherRewards"
                :key="item.key"
                class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <img v-if="item.iconPath" :src="item.iconPath" class="size-4 object-contain" />
                <span v-else>{{ item.emoji }}</span>
                <span class="font-medium text-slate-700 dark:text-slate-200">{{ item.name }}</span>
                <span class="font-bold text-violet-600 dark:text-violet-400 font-mono">×{{ item.amount }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state if no rewards yet -->
        <div v-else class="text-center py-3 text-xs text-slate-400 italic">
          No rewards recorded for this Tower run yet. Open chests and clear floors to track rewards.
        </div>
      </section>

      <!-- Tower Team (5 Hero Selectors) -->
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
                :id="`tower-buff-move-first-${id}`"
                type="button"
                :disabled="idx === 0"
                class="hover:opacity-100 opacity-60 text-[9px] px-0.5 cursor-pointer disabled:opacity-20"
                title="Move to first"
                aria-label="Move to first"
                @click.stop="moveBuff(id, 'first')"
              >
                ⤒
              </button>
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

                <!-- Opened Chest with summary badges in header -->
                <div v-if="group.chest" class="inline-flex items-center gap-1.5 flex-wrap">
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400">
                    🎁 Chest #{{ group.chest.number }}
                  </span>
                  <template v-if="parseTowerReward(group.chest.reward).length > 0">
                    <span
                      v-for="rew in parseTowerReward(group.chest.reward)"
                      :key="rew.key"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60"
                    >
                      <img v-if="rew.iconPath" :src="rew.iconPath" class="size-3.5 object-contain" />
                      <span v-else>{{ rew.emoji }}</span>
                      <span>+{{ formatNumber(rew.amount) }} {{ rew.name }}</span>
                    </span>
                  </template>
                </div>
              </div>
              <span class="text-slate-400 text-xs">{{ expandedFloor === group.floor ? '▲' : '▼' }}</span>
            </button>

            <!-- Expanded floor detail panel -->
            <div
              v-if="expandedFloor === group.floor"
              :id="`tower-floor-detail-${group.floor}`"
              class="border-t border-slate-200/80 dark:border-slate-800 p-3 space-y-2 bg-slate-50/70 dark:bg-slate-950/40 text-xs text-slate-600 dark:text-slate-400"
            >
              <div v-for="(ev, evIdx) in group.events" :key="evIdx" class="space-y-1">
                <!-- Battle Event -->
                <div v-if="ev.action === 'endBattle'" class="flex items-center justify-between flex-wrap gap-1">
                  <div class="flex items-center gap-1.5">
                    <span>⚔️ Floor {{ ev.floor }}, Room {{ ev.room }}: {{ ev.win ? 'Victory' : 'Defeat' }}</span>
                    <span v-if="ev.stars != null" class="text-amber-500 font-bold">({{ ev.stars }} ⭐)</span>
                  </div>
                  <div v-if="parseTowerReward(ev.reward).length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="rew in parseTowerReward(ev.reward)"
                      :key="rew.key"
                      class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                    >
                      {{ rew.emoji }} +{{ formatNumber(rew.amount) }} {{ rew.name }}
                    </span>
                  </div>
                </div>

                <!-- Buff Event -->
                <div v-else-if="ev.action === 'activateBuff'">
                  ✨ Floor {{ ev.floor }}, Room {{ ev.room }}: Selected <strong>{{ getBuffInfo(ev.buffId).name }}</strong>
                </div>

                <!-- Chest Event with detailed reward cards -->
                <div
                  v-else-if="ev.action === 'openChest'"
                  class="rounded-lg p-2.5 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 space-y-1.5"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <span>🎁</span> Floor {{ ev.floor }}, Room {{ ev.room }}: Opened chest #{{ ev.number }}
                    </span>
                    <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60">
                      Free Chest
                    </span>
                  </div>

                  <!-- Reward items pills -->
                  <div v-if="parseTowerReward(ev.reward).length > 0" class="flex flex-wrap gap-1.5 pt-0.5">
                    <div
                      v-for="rew in parseTowerReward(ev.reward)"
                      :key="rew.key"
                      class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <img v-if="rew.iconPath" :src="rew.iconPath" class="size-4 object-contain" />
                      <span v-else class="text-xs">{{ rew.emoji }}</span>
                      <span>{{ rew.name }}:</span>
                      <span class="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                        +{{ formatNumber(rew.amount) }}
                      </span>
                    </div>
                  </div>
                  <div v-else class="text-[11px] text-slate-400 italic">
                    Reward recorded.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </ModalDialog>
</template>
