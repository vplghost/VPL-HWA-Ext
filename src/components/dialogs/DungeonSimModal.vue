<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { getTitanMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import UnitStars from '@/src/components/common/UnitStars.vue';
import { getEffectiveTitanStates, DEFAULT_TITAN_POOLS } from '@/src/services/queues/dungeonAutomation';
import {
  simulateBattleWithUnity,
  BattleSimError,
  DUAL_ELEMENT_TITANS,
  DUNGEON_SAVED_LINEUPS_KEY,
  isTitanEligibleForDoor,
  type SimTitanItem,
  type SimResultPayload,
  type SimErrorDetail,
} from '@/src/utils/dungeonBattleSim';

const props = defineProps<{
  modelValue: boolean;
  door: any;
  doorIdx: number;
  floorNumber: number;
  titanStates: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'battleSubmitted'): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const accountId = computed(() => cache.value.accountStatus?.data?.id || cache.value.userGetInfo?.data?.id);
const { customTeams } = useAccountTeams(accountId);

const selectedTitanIds = ref<number[]>([]);
const isSimulating = ref(false);
const isSubmitting = ref(false);
const simResult = ref<SimResultPayload | null>(null);
const errorMessage = ref<string | null>(null);
const errorDetail = ref<SimErrorDetail | null>(null);
const showDiagnostics = ref(false);
const copiedDiagnostics = ref(false);
const successMessage = ref<string | null>(null);
const savedLineups = ref<Record<string, number[]>>({});
const showTeamDropdown = ref(false);

interface TeamPresetOption {
  id: string;
  label: string;
  category: 'saved' | 'server' | 'custom';
  memberIds: number[];
  eligibleCount: number;
}

const availableTeamPresets = computed<TeamPresetOption[]>(() => {
  const list: TeamPresetOption[] = [];
  const elemKey = doorElementKey.value;

  // 1. Saved lineup for this element
  const saved = savedLineups.value[elemKey] || (elemKey === 'neutral' ? savedLineups.value['mixed'] : null);
  if (Array.isArray(saved) && saved.length > 0) {
    const ids = saved.map(Number);
    const eligibleCount = ids.filter((id) => isTitanEligibleForDoor(id, doorElement.value, getTitanMetadata(id))).length;
    list.push({
      id: `saved_${elemKey}`,
      label: `💾 Saved ${doorElement.value} Lineup`,
      category: 'saved',
      memberIds: ids,
      eligibleCount,
    });
  }

  // 2. Custom Titan Teams (from useAccountTeams)
  for (const ct of customTeams.value) {
    const isTitanTeam = ct.type === 'titan' || ct.heroIds.some((id) => Number(id) >= 4000);
    if (!isTitanTeam) continue;
    const ids = ct.heroIds.map(Number);
    const eligibleCount = ids.filter((id) => isTitanEligibleForDoor(id, doorElement.value, getTitanMetadata(id))).length;
    if (eligibleCount > 0) {
      list.push({
        id: `custom_${ct.id}`,
        label: `⚡ Custom: ${ct.name}`,
        category: 'custom',
        memberIds: ids,
        eligibleCount,
      });
    }
  }

  // 3. Server teams (teamGetAll)
  const serverTeamsObj = cache.value.teamGetAll?.data || {};
  const serverKeys = [
    { key: `dungeon_${elemKey}`, label: `🏰 Server Dungeon (${doorElement.value})` },
    { key: 'dungeon_neutral', label: '🏰 Server Dungeon (Neutral)' },
    { key: 'dungeon', label: '🏰 Server Dungeon (Default)' },
    { key: 'champClanDefence_titans', label: '🛡️ Guild War Titan Defense' },
    { key: 'titan_arena', label: '⚔️ Titan Arena Team' },
    { key: 'dungeon_water', label: '🏰 Server Water Team' },
    { key: 'dungeon_fire', label: '🏰 Server Fire Team' },
    { key: 'dungeon_earth', label: '🏰 Server Earth Team' },
  ];

  const seenServerKeys = new Set<string>();
  for (const sk of serverKeys) {
    if (seenServerKeys.has(sk.key)) continue;
    seenServerKeys.add(sk.key);
    const rawIds = serverTeamsObj[sk.key];
    if (Array.isArray(rawIds) && rawIds.length > 0) {
      const ids = rawIds.map(Number).filter((id) => id >= 4000);
      if (ids.length > 0) {
        const eligibleCount = ids.filter((id) => isTitanEligibleForDoor(id, doorElement.value, getTitanMetadata(id))).length;
        if (eligibleCount > 0) {
          list.push({
            id: `server_${sk.key}`,
            label: sk.label,
            category: 'server',
            memberIds: ids,
            eligibleCount,
          });
        }
      }
    }
  }

  return list;
});

function applyPresetTeam(teamMemberIds: number[]) {
  const aliveMap = new Map(availableTitans.value.filter((t) => !t.isDead).map((t) => [t.id, t]));
  const picked: number[] = [];

  // Pick eligible and alive titans from the preset
  for (const id of teamMemberIds) {
    const numId = Number(id);
    if (aliveMap.has(numId) && isTitanEligibleForDoor(numId, doorElement.value, getTitanMetadata(numId)) && !picked.includes(numId)) {
      picked.push(numId);
      if (picked.length >= 5) break;
    }
  }

  selectedTitanIds.value = picked;
  simResult.value = null;
  errorMessage.value = null;
  showTeamDropdown.value = false;
}

// Door requirements
const doorElement = computed<string>(() => {
  const raw = props.door?.attackerType || props.door?.element || '';
  if (/water/i.test(raw)) return 'Water';
  if (/fire/i.test(raw)) return 'Fire';
  if (/earth/i.test(raw)) return 'Earth';
  return 'Neutral';
});

const isNeutralDoor = computed(() => doorElement.value === 'Neutral');
const isMixedDoor = isNeutralDoor; // backwards-compatible alias
const doorElementKey = computed<'water' | 'fire' | 'earth' | 'neutral'>(() => {
  const el = doorElement.value.toLowerCase();
  return (el === 'water' || el === 'fire' || el === 'earth') ? el : 'neutral';
});

// Load persistent saved lineups from storage
async function loadSavedLineups() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
    try {
      const res = await chrome.storage.local.get(DUNGEON_SAVED_LINEUPS_KEY);
      if (res?.[DUNGEON_SAVED_LINEUPS_KEY]) {
        savedLineups.value = res[DUNGEON_SAVED_LINEUPS_KEY];
      }
    } catch (_) {}
  }
}

// Persist accepted lineup for the door's element type
async function persistAcceptedLineup(elemKey: string, lineup: number[]) {
  const updated: Record<string, number[]> = {
    ...savedLineups.value,
    [elemKey]: [...lineup],
  };
  // Cross-sync neutral and mixed for backwards compatibility
  if (elemKey === 'neutral') {
    updated.mixed = [...lineup];
  } else if (elemKey === 'mixed') {
    updated.neutral = [...lineup];
  }
  savedLineups.value = updated;
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      await chrome.storage.local.set({
        [DUNGEON_SAVED_LINEUPS_KEY]: savedLineups.value,
      });
    } catch (_) {}
  }
}

// Enemy Titans
const enemies = computed(() => {
  const rawList = props.door?.enemies || props.door?.team || [];
  return rawList.map((e: any) => {
    const id = Number(e.id || e);
    const meta = getTitanMetadata(id);
    return {
      id,
      name: meta?.name || `Titan ${id}`,
      element: meta?.element || '',
      avatar: meta?.hasAvatar ? meta.avatarFile || `assets/titans/${id}.png` : null,
      level: e.level ?? null,
      star: e.star ?? null,
      power: e.power ?? null,
    };
  });
});

// Full titan pool with element & dual-element filtering
const availableTitans = computed<SimTitanItem[]>(() => {
  const states = props.titanStates && Object.keys(props.titanStates).length > 0
    ? props.titanStates
    : getEffectiveTitanStates(cache.value);
  const titanRoster = cache.value.titanGetAll?.data || {};

  const allIds = new Set<string>([...Object.keys(states), ...Object.keys(titanRoster)]);
  const items: SimTitanItem[] = [];

  const normDoor = doorElementKey.value;
  const dualAllowed = DUAL_ELEMENT_TITANS[normDoor] || [];
  const serverSaved = (cache.value.teamGetAll?.data?.[`dungeon_${normDoor}`] || []) as number[];

  for (const idStr of allIds) {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) continue;
    const meta = getTitanMetadata(id);
    const elem = meta?.element || '';
    const normElem = elem.toLowerCase();

    const isDual = dualAllowed.includes(id);
    const isSavedMatch = serverSaved.map(Number).includes(id);

    // Element restriction check:
    // Neutral/Mixed doors allow all. Elemental doors allow matching element, dual-element Elarites, or saved team members.
    if (!isNeutralDoor.value && !isMixedDoor.value && normElem !== normDoor && !isDual && !isSavedMatch) {
      continue;
    }

    const state = states[idStr] || {};
    const rosterData = titanRoster[idStr] || {};

    const maxHp = Number(state.maxHp) || Number(rosterData.hp) || 1000000;
    const hp = Math.max(0, state.hp != null ? Number(state.hp) : maxHp);
    const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));
    const energy = Math.max(0, Number(state.energy) || 0);
    const energyPct = Math.min(100, Math.round((energy / 1000) * 100));
    const isDead = state.isDead === true || hp <= 0;

    items.push({
      id,
      name: meta?.name || `Titan ${id}`,
      element: elem,
      role: meta?.role || 'Fighter',
      avatar: meta?.hasAvatar ? meta.avatarFile || `assets/titans/${id}.png` : null,
      hp,
      maxHp,
      hpPct,
      energy,
      energyPct,
      isDead,
      power: Number(rosterData.power) || 0,
      level: Number(rosterData.level) || 0,
      star: Number(rosterData.star) || 0,
      isDualElement: isDual,
    });
  }

  // Sort: alive first, then descending HP% and power
  return items.sort((a, b) => {
    if (a.isDead !== b.isDead) return a.isDead ? 1 : -1;
    return b.hpPct - a.hpPct || (b.power || 0) - (a.power || 0);
  });
});

function toggleTitan(titan: SimTitanItem) {
  if (titan.isDead) return;
  const idx = selectedTitanIds.value.indexOf(titan.id);
  if (idx !== -1) {
    selectedTitanIds.value.splice(idx, 1);
  } else if (selectedTitanIds.value.length < 5) {
    selectedTitanIds.value.push(titan.id);
  }
  simResult.value = null;
  errorMessage.value = null;
}

/**
 * Auto-select squad for current door:
 * Prioritizes persistent accepted lineup -> server saved team -> default pool -> highest alive titans.
 */
function autoSelectSquad() {
  const normDoor = doorElementKey.value;
  const preferred = savedLineups.value[normDoor]
    || cache.value.teamGetAll?.data?.[`dungeon_${normDoor}`]
    || DEFAULT_TITAN_POOLS[normDoor]
    || [];

  const aliveMap = new Map(availableTitans.value.filter((t) => !t.isDead).map((t) => [t.id, t]));
  const picked: number[] = [];

  for (const id of preferred) {
    const numId = Number(id);
    if (aliveMap.has(numId) && !picked.includes(numId)) {
      picked.push(numId);
      if (picked.length >= 5) break;
    }
  }

  // If preferred team has fewer than 5 alive titans, fill remaining slots with highest alive titans
  if (picked.length < 5) {
    for (const t of availableTitans.value) {
      if (!t.isDead && !picked.includes(t.id)) {
        picked.push(t.id);
        if (picked.length >= 5) break;
      }
    }
  }

  selectedTitanIds.value = picked;
  simResult.value = null;
  errorMessage.value = null;
}

function clearSquad() {
  selectedTitanIds.value = [];
  simResult.value = null;
  errorMessage.value = null;
}

// Reset and auto-select squad when modal opens or door changes
watch(
  () => [props.modelValue, props.doorIdx],
  async ([isOpen]) => {
    if (isOpen) {
      simResult.value = null;
      errorMessage.value = null;
      successMessage.value = null;
      await loadSavedLineups();
      autoSelectSquad();
    }
  },
  { immediate: true }
);

async function closeModal() {
  if (isSimulating.value || isSubmitting.value) return;
  if (simResult.value) {
    if (cache.value?.dungeonStatus?.data) {
      cache.value.dungeonStatus.data.activeBattle = null;
    }
    try {
      await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);
    } catch (_) {}
    simResult.value = null;
  }
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
    closeModal();
  }
}

/**
 * Execute Battle Simulation
 */
async function handleRunSimulation() {
  if (selectedTitanIds.value.length === 0) {
    errorMessage.value = 'Please select at least 1 Titan to battle!';
    return;
  }
  isSimulating.value = true;
  errorMessage.value = null;
  simResult.value = null;

  try {
    // Call dungeonStartBattle to get authoritative seed and defenders from game server
    const startCall = {
      name: 'dungeonStartBattle',
      args: {
        teamNum: props.doorIdx,
        heroes: selectedTitanIds.value,
      },
    };

    const startRpcRes = await dispatchRpc([startCall]);
    const resPayload = startRpcRes?.results?.[0]?.result?.response || startRpcRes?.results?.[0]?.response;

    if (!resPayload || startRpcRes?.results?.[0]?.error) {
      const err = startRpcRes?.results?.[0]?.error?.description || 'Could not initialize battle session with server.';
      throw new Error(err);
    }

    const seed = Number(resPayload.seed) || Math.floor(Math.random() * 1000000000);

    // Strictly simulate via Unity WebAssembly Engine; no heuristic fallback
    const outcome = await simulateBattleWithUnity(resPayload, seed);

    simResult.value = outcome;
    errorDetail.value = null;
  } catch (err: any) {
    simResult.value = null;
    if (err instanceof BattleSimError && err.detail) {
      errorDetail.value = err.detail;
      errorMessage.value = err.message;
    } else if (err?.detail) {
      errorDetail.value = err.detail;
      errorMessage.value = err.message || String(err);
    } else {
      errorDetail.value = null;
      errorMessage.value = `Unity Engine simulation error: ${err.message || String(err)}`;
    }
  } finally {
    isSimulating.value = false;
  }
}

async function copyDiagnostics() {
  if (!errorMessage.value && !errorDetail.value) return;
  const payload = {
    timestamp: new Date().toISOString(),
    floorNumber: props.floorNumber,
    doorIdx: props.doorIdx,
    doorElement: doorElement.value,
    selectedTitans: selectedTitanIds.value,
    error: errorMessage.value,
    detail: errorDetail.value,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    copiedDiagnostics.value = true;
    setTimeout(() => {
      copiedDiagnostics.value = false;
    }, 2000);
  } catch (_) {}
}

/**
 * Accept simulation outcome and submit officially to the game server.
 * Saves the chosen lineup for this door's element type.
 */
async function handleSubmitOfficial() {
  if (!simResult.value || !simResult.value.endArgs) return;
  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    // 1. Submit dungeonEndBattle
    const endRpcRes = await dispatchRpc([{ name: 'dungeonEndBattle', args: simResult.value.endArgs }]);
    const firstEnd = endRpcRes?.results?.[0];

    if (firstEnd?.result?.response?.error || firstEnd?.error) {
      throw new Error(firstEnd?.result?.response?.error || firstEnd?.error?.description || 'Server rejected battle result.');
    }

    // 2. Persist chosen lineup for this element type
    await persistAcceptedLineup(doorElementKey.value, selectedTitanIds.value);

    // 3. Save progress checkpoint if floor is divisible by 10
    const curFloor = props.floorNumber;
    const respawn = Number(cache.value.dungeonStatus?.data?.respawnFloor) || 0;
    if (curFloor > respawn && curFloor % 10 === 0) {
      await dispatchRpc([{ name: 'dungeonSaveProgress', args: {} }]);
    }

    // 4. Refresh Dungeon state from game
    await dispatchRpc([{ name: 'dungeonGetInfo', args: {} }]);

    successMessage.value = 'Battle submitted successfully! Rewards and Titanite have been recorded.';
    emit('battleSubmitted');

    setTimeout(() => {
      emit('update:modelValue', false);
    }, 1200);
  } catch (err: any) {
    errorMessage.value = `Submission failed: ${err.message || String(err)}`;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="dungeon-sim-modal"
      style="z-index: 1050;"
      class="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-sim-modal-title"
    >
      <div
        class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 overflow-hidden text-slate-800 dark:text-slate-100"
      >
        <!-- MODAL HEADER -->
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">⚔️</span>
            <div>
              <h2 id="dungeon-sim-modal-title" class="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Dungeon Battle Simulation
              </h2>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Floor {{ floorNumber }} · Door {{ doorIdx + 1 }}</span>
                <span class="inline-block size-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                <span
                  class="font-semibold px-2 py-0.5 rounded-full text-[11px]"
                  :class="{
                    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300': doorElement === 'Earth',
                    'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300': doorElement === 'Water',
                    'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300': doorElement === 'Fire',
                    'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300': doorElement === 'Neutral' || doorElement === 'Mixed'
                  }"
                >
                  Required Element: {{ doorElement }}
                </span>
              </div>
            </div>
          </div>

          <button
            id="btn-close-dungeon-sim-modal"
            type="button"
            class="cursor-pointer p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close simulation dialog"
            @click="closeModal"
            :disabled="isSimulating || isSubmitting"
          >
            ✕
          </button>
        </div>

        <!-- MODAL BODY -->
        <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <!-- Error & Success Banners -->
          <div v-if="errorMessage" class="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-start gap-2 min-w-0">
                <span class="text-base leading-none mt-0.5">⚠️</span>
                <div>
                  <div class="font-bold text-xs leading-snug">Giả lập Unity Engine gặp lỗi</div>
                  <div class="text-2xs opacity-90 mt-0.5 break-words font-mono">{{ errorMessage }}</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  class="cursor-pointer px-2 py-1 rounded bg-rose-200/80 hover:bg-rose-300 dark:bg-rose-900/60 dark:hover:bg-rose-800 text-[11px] font-semibold transition-colors"
                  :disabled="isSimulating"
                  @click="handleSimulateBattle"
                >
                  🔄 Thử lại
                </button>
                <button
                  type="button"
                  class="cursor-pointer px-2 py-1 rounded border border-rose-300 dark:border-rose-700 bg-white/60 dark:bg-slate-900/60 hover:bg-white text-[11px] font-semibold transition-colors"
                  @click="showDiagnostics = !showDiagnostics"
                >
                  {{ showDiagnostics ? 'Ẩn chẩn đoán' : 'Chẩn đoán lỗi' }}
                </button>
              </div>
            </div>

            <!-- Detailed Diagnostics Accordion -->
            <div v-if="showDiagnostics" class="pt-2 border-t border-rose-200/60 dark:border-rose-900/40 space-y-2 text-2xs">
              <div class="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span class="font-semibold">Chi tiết kỹ thuật & Ngữ cảnh trận đấu:</span>
                <button
                  type="button"
                  class="cursor-pointer px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold"
                  @click="copyDiagnostics"
                >
                  {{ copiedDiagnostics ? '✅ Đã chép' : '📋 Sao chép' }}
                </button>
              </div>
              <div class="bg-black/85 text-emerald-300 p-2.5 rounded font-mono text-[10px] leading-relaxed overflow-x-auto max-h-48 border border-black/40">
                <div v-if="errorDetail">
                  <div><span class="text-slate-400">Phase:</span> {{ errorDetail.phase || 'N/A' }}</div>
                  <div><span class="text-slate-400">Kind:</span> {{ errorDetail.kind || 'generic' }}</div>
                  <div><span class="text-slate-400">Message:</span> {{ errorDetail.message }}</div>
                  <div v-if="errorDetail.context" class="mt-1">
                    <span class="text-slate-400">Context:</span> {{ JSON.stringify(errorDetail.context, null, 2) }}
                  </div>
                  <div v-if="errorDetail.stack" class="mt-1 text-slate-500 whitespace-pre">
                    <span class="text-slate-400">Stack:</span> {{ errorDetail.stack }}
                  </div>
                </div>
                <div v-else>
                  <div>{{ errorMessage }}</div>
                  <div class="text-slate-500 mt-1">Door: {{ doorIdx + 1 }} · Element: {{ doorElement }} · Squad: [{{ selectedTitanIds.join(', ') }}]</div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="successMessage" class="p-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 flex items-center gap-2">
            <span>✅</span>
            <span class="flex-1 font-medium">{{ successMessage }}</span>
          </div>

          <!-- SECTION: ENEMY LINEUP -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
            <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 font-semibold text-2xs uppercase tracking-wider">
              <span>Enemy Squad ({{ enemies.length }} Titans)</span>
              <span v-if="door.power" class="font-mono">Power: {{ formatNumber(door.power) }}</span>
            </div>

            <div class="flex items-center gap-3 overflow-x-auto pb-1">
              <div
                v-for="enemy in enemies"
                :key="enemy.id"
                class="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 min-w-[130px]"
              >
                <img
                  v-if="enemy.avatar"
                  :src="enemy.avatar"
                  alt=""
                  class="size-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                />
                <div class="min-w-0">
                  <div class="font-bold text-slate-800 dark:text-slate-100 truncate">{{ enemy.name }}</div>
                  <div class="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span>{{ enemy.element }}</span>
                    <span v-if="enemy.level">· Lv.{{ enemy.level }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION: TITAN SELECTION -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🛡️ Select Attack Squad</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold" :class="selectedTitanIds.length === 5 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'">
                  {{ selectedTitanIds.length }} / 5 Titans
                </span>
              </div>

              <div class="flex items-center gap-2 relative">
                <!-- Team Presets Dropdown -->
                <div class="relative">
                  <button
                    type="button"
                    class="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline font-semibold text-2xs inline-flex items-center gap-1"
                    @click="showTeamDropdown = !showTeamDropdown"
                  >
                    <span>📋 Load Team</span>
                    <span class="text-[9px]">▾</span>
                  </button>

                  <div
                    v-if="showTeamDropdown"
                    class="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-50 p-1.5 space-y-1 text-xs"
                  >
                    <div class="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                      <span>Preset Teams</span>
                      <span class="font-normal capitalize text-[9px]">({{ doorElement }})</span>
                    </div>

                    <div v-if="availableTeamPresets.length === 0" class="px-2 py-2 text-slate-400 text-center text-[11px]">
                      No preset teams found.
                    </div>

                    <div v-else class="max-h-56 overflow-y-auto space-y-0.5">
                      <button
                        v-for="preset in availableTeamPresets"
                        :key="preset.id"
                        type="button"
                        class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer flex items-center justify-between text-xs transition-colors"
                        @click="applyPresetTeam(preset.memberIds)"
                      >
                        <span class="truncate font-medium text-slate-700 dark:text-slate-200">{{ preset.label }}</span>
                        <span class="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                          ({{ preset.eligibleCount }}/5)
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  class="cursor-pointer text-indigo-600 dark:text-indigo-400 hover:underline font-semibold text-2xs"
                  @click="autoSelectSquad"
                >
                  ✨ Auto Select
                </button>
                <button
                  type="button"
                  class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xs"
                  @click="clearSquad"
                >
                  Clear
                </button>
              </div>
            </div>

            <!-- Titan Selection Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              <div
                v-for="titan in availableTitans"
                :key="titan.id"
                class="relative rounded-xl border p-2 flex items-center gap-2.5 transition-all select-none"
                :class="[
                  titan.isDead
                    ? 'opacity-40 bg-slate-100 border-slate-200 dark:bg-slate-900 dark:border-slate-800 cursor-not-allowed'
                    : selectedTitanIds.includes(titan.id)
                    ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/40 ring-1 ring-indigo-500 cursor-pointer'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/80 dark:hover:border-slate-700 cursor-pointer'
                ]"
                @click="toggleTitan(titan)"
              >
                <!-- Order Badge -->
                <span
                  v-if="selectedTitanIds.includes(titan.id)"
                  class="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs"
                >
                  {{ selectedTitanIds.indexOf(titan.id) + 1 }}
                </span>

                <img
                  v-if="titan.avatar"
                  :src="titan.avatar"
                  alt=""
                  class="size-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                />
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1">
                    <span>{{ titan.name }}</span>
                    <span
                      v-if="titan.isDualElement"
                      class="px-1 py-0.2 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 shrink-0"
                      title="Dual-Element Elarite Titan eligible for this door"
                    >
                      Dual
                    </span>
                  </div>
                  <div class="text-2xs text-slate-400 flex items-center gap-1">
                    <span>{{ titan.role }}</span>
                    <span v-if="titan.isDead" class="text-rose-600 font-bold">· Fallen</span>
                  </div>

                  <!-- HP Bar -->
                  <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="titan.hpPct > 50 ? 'bg-emerald-500' : titan.hpPct > 20 ? 'bg-amber-500' : 'bg-rose-500'"
                      :style="{ width: `${titan.hpPct}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION: SIMULATION RESULT DISPLAY -->
          <div
            v-if="simResult"
            id="dungeon-sim-result-box"
            class="rounded-xl border p-4 space-y-3 animate-in fade-in duration-200"
            :class="simResult.stars === 3
              ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20'
              : 'border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20'"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg">{{ simResult.stars === 3 ? '🏆' : '⚠️' }}</span>
                <div>
                  <span class="font-bold text-sm" :class="simResult.stars === 3 ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'">
                    {{ simResult.stars === 3 ? 'Flawless Victory (3⭐)' : `Victory With Casualties (${simResult.stars}⭐)` }}
                  </span>
                  <div class="text-2xs text-slate-500 dark:text-slate-400">
                    Estimated Duration: {{ simResult.duration.toFixed(1) }}s · Seed: {{ simResult.seed }}
                  </div>
                </div>
              </div>

              <div class="text-right">
                <span
                  class="px-2.5 py-1 rounded-full text-xs font-bold"
                  :class="simResult.stars === 3 ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'"
                >
                  {{ simResult.stars === 3 ? 'SAFE' : 'RISK' }}
                </span>
              </div>
            </div>

            <!-- Casualties warning -->
            <div
              v-if="simResult.stars < 3"
              class="p-2.5 rounded-lg border border-amber-300 bg-amber-100/70 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 text-2xs leading-relaxed"
            >
              ⚠️ <strong>Warning:</strong> Simulation detected that a Titan would fall in this fight! Submitting this outcome will disable that Titan for the rest of today. You may want to choose a different squad or use healer Titans.
            </div>

            <!-- Post-battle Titan States -->
            <div class="space-y-1.5 pt-1">
              <div class="text-2xs font-bold text-slate-500 uppercase tracking-wider">Post-Battle Titan Status:</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  v-for="tId in selectedTitanIds"
                  :key="tId"
                  class="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <div class="flex items-center gap-2">
                    <img :src="`assets/titans/${tId}.png`" alt="" class="size-6 rounded-full object-cover" />
                    <span class="font-bold text-slate-800 dark:text-slate-200">{{ getTitanMetadata(tId)?.name || tId }}</span>
                  </div>

                  <div class="text-right">
                    <span
                      v-if="simResult.attackers[String(tId)]?.isDead"
                      class="font-bold text-rose-600 dark:text-rose-400 text-2xs"
                    >
                      💀 Fallen
                    </span>
                    <div v-else class="flex items-center gap-1.5">
                      <span class="font-mono text-2xs font-semibold text-slate-700 dark:text-slate-300">
                        {{ formatNumber(simResult.attackers[String(tId)]?.hp || 0) }} HP
                      </span>
                      <span
                        class="text-[10px] font-bold"
                        :class="(simResult.attackers[String(tId)]?.hpDelta || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'"
                      >
                        ({{ (simResult.attackers[String(tId)]?.hpDelta || 0) >= 0 ? '+' : '' }}{{ formatNumber(simResult.attackers[String(tId)]?.hpDelta || 0) }})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL FOOTER -->
        <div class="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            class="cursor-pointer px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
            @click="closeModal"
            :disabled="isSimulating || isSubmitting"
          >
            Cancel
          </button>

          <div class="flex items-center gap-2">
            <!-- Button: Run Simulation -->
            <button
              id="btn-run-dungeon-sim"
              type="button"
              class="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
              :disabled="selectedTitanIds.length === 0 || isSimulating || isSubmitting"
              @click="handleRunSimulation"
            >
              <svg
                v-if="isSimulating"
                class="size-3.5 animate-spin shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span v-else>🧪</span>
              <span>{{ isSimulating ? 'Simulating...' : 'Run Simulation' }}</span>
            </button>

            <!-- Button: Accept & Submit Official Result -->
            <button
              v-if="simResult && simResult.win"
              id="btn-submit-dungeon-sim-official"
              type="button"
              class="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs animate-in zoom-in-95 duration-150"
              :disabled="isSubmitting"
              @click="handleSubmitOfficial"
            >
              <svg
                v-if="isSubmitting"
                class="size-3.5 animate-spin shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span v-else>✅</span>
              <span>{{ isSubmitting ? 'Submitting...' : 'Accept & Submit Battle' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
