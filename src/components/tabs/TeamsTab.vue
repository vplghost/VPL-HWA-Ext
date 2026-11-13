<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useAccountTeams } from '@/src/composables/useAccountTeams';
import { useRpcCache } from '@/src/composables/useRpcCache';
import HeroHoverCard from '@/src/components/common/HeroHoverCard.vue';
import TitanHoverCard from '@/src/components/common/TitanHoverCard.vue';
import { getHeroMetadata, getTitanMetadata, starGlowClass } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';

interface CustomTeam {
  id: string;
  name: string;
  heroIds: number[];
  maxTroops?: number;
}

const { cache, dispatchRpc } = useRpcCache();

const accountId = computed(() => cache.value.accountStatus?.data?.id);
const heroesData = computed(() => cache.value.heroGetAll?.data || {});
const titansData = computed(() => cache.value.titanGetAll?.data || {});

const { customTeams, saveTeams, storageError } = useAccountTeams(accountId);
const isEditing = ref(false);
const editingTeamId = ref<string | null>(null);
const isRefreshing = ref(false);

const formName = ref('');
const formMaxTroops = ref<string>('');
const selectedHeroIds = ref<number[]>([]);
const heroSearch = ref('');
const formError = ref('');

watch(accountId, () => { isEditing.value = false; editingTeamId.value = null; selectedHeroIds.value = []; });

async function refreshTeams() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([
      { name: 'teamGetAll' },
      { name: 'heroGetAll' },
      { name: 'titanGetAll' },
    ]);
  } finally {
    isRefreshing.value = false;
  }
}

onMounted(() => {
  if (!cache.value.teamGetAll?.data) {
    refreshTeams();
  }
});

// Server-saved teams from teamGetAll RPC
const serverTeams = computed(() => {
  const data = cache.value.teamGetAll?.data || {};
  const result: Array<{
    mode: string;
    label: string;
    teamNumber: number | string;
    heroIds: number[];
    power: number;
  }> = [];

  const modeLabels: Record<string, string> = {
    arena: 'Arena Defense',
    bossFight: 'Guild Raid / Boss',
    magicTower: 'Tower',
    dungeon: 'Dungeon',
    globalMapCamp: 'Brigand Camp',
    globalMapTeamKey: 'Global Map',
    globalMapRallyAutoJoinTeamKey: 'Auto-Rally Join',
  };

  for (const [mode, rawMembers] of Object.entries(data)) {
    if (!rawMembers) continue;
    const groups: any[] = Array.isArray(rawMembers)
      ? (rawMembers.some(Array.isArray) ? rawMembers : [rawMembers])
      : (typeof rawMembers === 'object' ? Object.values(rawMembers) : []);

    groups.forEach((group: any, idx: number) => {
      let ids: number[] = [];
      if (Array.isArray(group)) {
        ids = group.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      } else if (typeof group === 'object' && group !== null) {
        ids = Object.values(group).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      }

      if (ids.length > 0) {
        let label = modeLabels[mode];
        if (!label) {
          if (mode.startsWith('clanBossHead_')) {
            label = `Hydra Head #${mode.replace('clanBossHead_', '')}`;
          } else {
            label = mode.charAt(0).toUpperCase() + mode.slice(1);
          }
        }

        result.push({
          mode,
          label,
          teamNumber: groups.length > 1 ? idx + 1 : 1,
          heroIds: ids,
          power: getTeamPower(ids),
        });
      }
    });
  }

  return result;
});

// Available heroes sorted by power descending
const sortedHeroes = computed(() => {
  return Object.entries(heroesData.value)
    .map(([id, hero]: [string, any]) => {
      const meta = getHeroMetadata(id);
      return {
        id: Number(id),
        name: meta?.name || `Hero #${id}`,
        power: Number(hero.power) || 0,
        level: Number(hero.level) || 1,
        star: Number(hero.star) || 1,
      };
    })
    .sort((a, b) => b.power - a.power);
});

const filteredHeroes = computed(() => {
  const q = heroSearch.value.trim().toLowerCase();
  if (!q) return sortedHeroes.value;
  return sortedHeroes.value.filter(
    (h) => h.name.toLowerCase().includes(q) || String(h.id).includes(q)
  );
});

function openAddTeam() {
  editingTeamId.value = null;
  formName.value = '';
  formMaxTroops.value = '';
  selectedHeroIds.value = [];
  heroSearch.value = '';
  formError.value = '';
  isEditing.value = true;
}

function openEditTeam(team: CustomTeam) {
  editingTeamId.value = team.id;
  formName.value = team.name;
  formMaxTroops.value = team.maxTroops !== undefined ? String(team.maxTroops) : '';
  selectedHeroIds.value = [...team.heroIds];
  heroSearch.value = '';
  formError.value = '';
  isEditing.value = true;
}

function cloneServerTeamToCustom(st: { label: string; heroIds: number[] }) {
  editingTeamId.value = null;
  formName.value = `${st.label} Team`;
  formMaxTroops.value = '';
  selectedHeroIds.value = st.heroIds.slice(0, 5);
  heroSearch.value = '';
  formError.value = '';
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
  editingTeamId.value = null;
}

function toggleHero(id: number) {
  const idx = selectedHeroIds.value.indexOf(id);
  if (idx >= 0) {
    selectedHeroIds.value.splice(idx, 1);
  } else {
    if (selectedHeroIds.value.length >= 5) return;
    selectedHeroIds.value.push(id);
  }
}

async function saveTeam() {
  if (!formName.value.trim()) {
    formError.value = 'Please enter a team name.';
    return;
  }
  if (selectedHeroIds.value.length !== 5) {
    formError.value = `Select exactly 5 heroes (${selectedHeroIds.value.length}/5 selected).`;
    return;
  }

  const maxTroops = formMaxTroops.value === '' ? undefined : Number(formMaxTroops.value);
  if (maxTroops !== undefined && (!Number.isSafeInteger(maxTroops) || maxTroops <= 0)) {
    formError.value = 'Troop limit must be a positive whole number.';
    return;
  }
  const team: CustomTeam = {
    id: editingTeamId.value || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `team_${Date.now()}`),
    name: formName.value.trim(),
    heroIds: [...selectedHeroIds.value],
    maxTroops,
  };

  const next = [...customTeams.value.filter((t) => t.id !== team.id), team];
  try { await saveTeams(next); }
  catch (cause) { formError.value = String(cause); return; }

  isEditing.value = false;
  editingTeamId.value = null;
}

async function deleteTeam(id: string) {
  try { await saveTeams(customTeams.value.filter((team) => team.id !== id)); }
  catch (cause) { formError.value = String(cause); }
}

function isTitanId(id: number | string): boolean {
  const num = Number(id);
  if (num >= 4000) return true;
  if (titansData.value[String(id)]) return true;
  if (getTitanMetadata(id)) return true;
  return false;
}

function getMemberSnapshot(id: number | string): any {
  const key = String(id);
  if (isTitanId(id)) {
    return titansData.value[key] || null;
  }
  return heroesData.value[key] || null;
}

function getMemberName(id: number | string): string {
  const key = String(id);
  if (isTitanId(id)) {
    return getTitanMetadata(id)?.name || `Titan #${id}`;
  }
  return getHeroMetadata(id)?.name || (globalThis as any).hwaHelperNameMap?.hero?.(id) || `Hero #${id}`;
}

function getMemberAvatarUrl(id: number | string): string {
  const key = String(id);
  if (isTitanId(id)) {
    const meta = getTitanMetadata(id);
    const file = meta?.avatarFile || (meta?.hasAvatar ? `assets/titans/${id}.png` : null);
    if (!file) return '';
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(file);
    return file;
  } else {
    const meta = getHeroMetadata(id);
    const file = meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${id}.webp` : null);
    if (!file) return '';
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) return chrome.runtime.getURL(file);
    return file;
  }
}

function getMemberStarGlow(id: number | string): string {
  const snap = getMemberSnapshot(id);
  const stars = Number(snap?.star) || 1;
  return starGlowClass(stars);
}

function getMemberPower(id: number | string): number {
  const snap = getMemberSnapshot(id);
  return Number(snap?.power) || 0;
}

function getTeamPower(memberIds: number[]): number {
  return memberIds.reduce((sum, id) => {
    return sum + getMemberPower(id);
  }, 0);
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="storageError" role="alert" class="text-xs text-rose-600">{{ storageError }}</p>
    <!-- Header Card -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>⚔️</span>
          <span>Teams Management</span>
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Server-saved battle teams and custom presets for Raids, Monsters, and Gathering.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          id="btn-toolbar-refresh-teams"
          type="button"
          :disabled="isRefreshing"
          class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors disabled:opacity-50"
          title="Refresh server teams and heroes via RPC"
          @click="refreshTeams"
        >
          <span :class="{ 'animate-spin': isRefreshing }">🔄</span>
          <span>{{ isRefreshing ? 'Refreshing...' : 'Refresh' }}</span>
        </button>

        <button
          v-if="!isEditing"
          id="btn-add-custom-team"
          type="button"
          class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
          @click="openAddTeam"
        >
          <span>+ Add Custom Team</span>
        </button>
      </div>
    </div>

    <!-- Team Editor Form -->
    <div
      v-if="isEditing"
      id="team-editor-form"
      class="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3.5 shadow-sm"
    >
      <div class="flex items-center justify-between border-b border-blue-100 dark:border-blue-900/40 pb-2.5">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
          {{ editingTeamId ? 'Edit Custom Team' : 'Create Custom Team' }}
        </h3>
        <button
          type="button"
          class="cursor-pointer text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          @click="cancelEdit"
        >
          ✕ Cancel
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Team Name
          <input
            v-model="formName"
            type="text"
            placeholder="e.g. Boss Slayers, Farm Squad..."
            maxlength="80"
            class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
          />
        </label>

        <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Maximum Troops (blank = automatic)
          <input
            v-model="formMaxTroops"
            type="number"
            min="1"
            placeholder="Automatic"
            class="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
          />
        </label>
      </div>

      <!-- Selected Heroes Preview -->
      <div>
        <div class="flex items-center justify-between text-xs mb-1.5">
          <span class="font-medium text-slate-700 dark:text-slate-300">
            Selected Team: <span class="font-bold text-blue-600 dark:text-blue-400">{{ selectedHeroIds.length }}/5</span>
          </span>
          <span v-if="selectedHeroIds.length > 0" class="text-slate-500 font-mono text-[11px]">
            Total Power: {{ formatNumber(getTeamPower(selectedHeroIds)) }}
          </span>
        </div>

        <div class="grid grid-cols-5 gap-2">
          <div
            v-for="idx in 5"
            :key="idx"
            class="h-16 rounded-lg border border-dashed flex flex-col items-center justify-center p-1 text-center transition-colors relative"
            :class="
              selectedHeroIds[idx - 1]!
                ? 'border-blue-400 bg-blue-100/60 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-medium'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-xs'
            "
          >
            <template v-if="selectedHeroIds[idx - 1]!">
              <div class="hero-hover-trigger flex items-center justify-center gap-1.5 w-full min-w-0 px-1">
                <span
                  class="relative size-6 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border bg-slate-200 dark:bg-slate-700"
                  :class="getMemberStarGlow(selectedHeroIds[idx - 1]!)"
                >
                  <img
                    v-if="getMemberAvatarUrl(selectedHeroIds[idx - 1]!)"
                    :src="getMemberAvatarUrl(selectedHeroIds[idx - 1]!)"
                    :alt="getMemberName(selectedHeroIds[idx - 1]!)"
                    class="size-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[9px] font-bold">
                    {{ isTitanId(selectedHeroIds[idx - 1]!) ? '⚡' : '👤' }}
                  </span>
                </span>
                <span class="truncate text-[11px] font-bold">
                  {{ getMemberName(selectedHeroIds[idx - 1]!) }}
                </span>
                <TitanHoverCard
                  v-if="isTitanId(selectedHeroIds[idx - 1]!)"
                  :titan-id="selectedHeroIds[idx - 1]!"
                  :titan="getMemberSnapshot(selectedHeroIds[idx - 1]!)"
                  :inventory="cache.inventoryGet?.data"
                />
                <HeroHoverCard
                  v-else
                  :hero-id="selectedHeroIds[idx - 1]!"
                  :hero="getMemberSnapshot(selectedHeroIds[idx - 1]!)"
                  :inventory="cache.inventoryGet?.data"
                />
              </div>
              <button
                type="button"
                class="cursor-pointer text-[10px] text-red-500 hover:text-red-700 mt-0.5"
                @click="toggleHero(selectedHeroIds[idx - 1]!)"
              >
                Remove
              </button>
            </template>
            <template v-else>
              <span class="text-xs">Slot {{ idx }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Hero Picker Search & Grid -->
      <div class="space-y-2 pt-2 border-t border-blue-100 dark:border-blue-900/40">
        <div class="flex items-center justify-between gap-2">
          <label class="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Choose 5 Heroes:
          </label>
          <input
            v-model="heroSearch"
            type="search"
            placeholder="Search hero..."
            class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 w-44 outline-none"
          />
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto p-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
          <button
            v-for="h in filteredHeroes"
            :key="h.id"
            type="button"
            class="hero-hover-trigger cursor-pointer text-left flex items-center justify-between p-1.5 rounded-md text-xs transition-colors"
            :class="
              selectedHeroIds.includes(h.id)
                ? 'bg-blue-600 text-white font-semibold'
                : selectedHeroIds.length >= 5
                ? 'opacity-40 cursor-not-allowed text-slate-600 dark:text-slate-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
            "
            @click="toggleHero(h.id)"
          >
            <div class="flex items-center gap-1.5 min-w-0 pr-1">
              <span
                class="relative size-5 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border bg-slate-200 dark:bg-slate-700"
                :class="getMemberStarGlow(h.id)"
              >
                <img
                  v-if="getMemberAvatarUrl(h.id)"
                  :src="getMemberAvatarUrl(h.id)"
                  :alt="h.name"
                  class="size-full object-cover"
                  loading="lazy"
                />
                <span v-else class="text-[9px]">👤</span>
              </span>
              <span class="truncate">{{ h.name }}</span>
            </div>
            <span class="text-[10px] font-mono shrink-0 opacity-80">{{ formatNumber(h.power) }}</span>
            <HeroHoverCard
              :hero-id="h.id"
              :hero="getMemberSnapshot(h.id)"
              :inventory="cache.inventoryGet?.data"
            />
          </button>
        </div>
      </div>

      <!-- Form Error and Actions -->
      <div v-if="formError" class="text-xs text-red-600 dark:text-red-400 font-medium">
        {{ formError }}
      </div>

      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          class="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50"
          @click="cancelEdit"
        >
          Cancel
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          :disabled="selectedHeroIds.length !== 5 || !formName.trim()"
          @click="saveTeam"
        >
          Save Team ({{ selectedHeroIds.length }}/5)
        </button>
      </div>
    </div>

    <!-- SECTION 1: SERVER-SAVED TEAMS -->
    <div id="server-teams-section" class="space-y-2.5">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <span>🏰</span>
          <span>Server-Saved Teams</span>
          <span class="text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">
            {{ serverTeams.length }}
          </span>
        </h3>
        <span class="text-xs text-slate-400">Synchronized from game RPC (teamGetAll)</span>
      </div>

      <div v-if="serverTeams.length === 0" class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        No server-saved teams loaded yet. Click "Refresh" or launch the game to synchronize teams.
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        <div
          v-for="(st, idx) in serverTeams"
          :key="`${st.mode}_${st.teamNumber}_${idx}`"
          class="server-team-card rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 px-2 py-0.5 text-xs font-bold truncate">
                {{ st.label }}
              </span>
              <span v-if="st.teamNumber && st.teamNumber !== 1" class="text-xs text-slate-400 font-medium">
                #{{ st.teamNumber }}
              </span>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-300">
                Power: {{ formatNumber(st.power) }}
              </span>

              <button
                type="button"
                class="btn-clone-server-team cursor-pointer text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                title="Copy heroes into a new custom team"
                @click="cloneServerTeamToCustom(st)"
              >
                + Clone
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <span
              v-for="hid in st.heroIds"
              :key="hid"
              class="hero-hover-trigger inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            >
              <span
                class="relative size-5 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border bg-slate-200 dark:bg-slate-700"
                :class="getMemberStarGlow(hid)"
              >
                <img
                  v-if="getMemberAvatarUrl(hid)"
                  :src="getMemberAvatarUrl(hid)"
                  :alt="getMemberName(hid)"
                  class="size-full object-cover"
                  loading="lazy"
                />
                <span v-else class="text-[9px] font-bold">
                  {{ isTitanId(hid) ? '⚡' : '👤' }}
                </span>
              </span>

              <span class="font-medium truncate max-w-[120px]">{{ getMemberName(hid) }}</span>

              <TitanHoverCard
                v-if="isTitanId(hid)"
                :titan-id="hid"
                :titan="getMemberSnapshot(hid)"
                :inventory="cache.inventoryGet?.data"
              />
              <HeroHoverCard
                v-else
                :hero-id="hid"
                :hero="getMemberSnapshot(hid)"
                :inventory="cache.inventoryGet?.data"
              />
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION 2: CUSTOM TEAMS -->
    <div id="custom-teams-section" class="space-y-2.5 pt-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <span>⚙️</span>
          <span>Custom Preset Teams</span>
          <span class="text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">
            {{ customTeams.length }}
          </span>
        </h3>
      </div>

      <div v-if="customTeams.length === 0 && !isEditing" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        No custom teams configured. Click "+ Add Custom Team" or "+ Clone" from a server squad above.
      </div>

      <div v-else class="space-y-2.5">
        <div
          v-for="team in customTeams"
          :key="team.id"
          class="custom-team-card rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm text-slate-900 dark:text-slate-100">{{ team.name }}</span>
              <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                Power: {{ formatNumber(getTeamPower(team.heroIds)) }}
              </span>
              <span class="rounded bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                Troops: {{ team.maxTroops != null ? formatNumber(team.maxTroops) : 'Automatic' }}
              </span>
            </div>

            <div class="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
              <span
                v-for="hid in team.heroIds"
                :key="hid"
                class="hero-hover-trigger inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <span
                  class="relative size-5 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center border bg-slate-200 dark:bg-slate-700"
                  :class="getMemberStarGlow(hid)"
                >
                  <img
                    v-if="getMemberAvatarUrl(hid)"
                    :src="getMemberAvatarUrl(hid)"
                    :alt="getMemberName(hid)"
                    class="size-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[9px] font-bold">
                    {{ isTitanId(hid) ? '⚡' : '👤' }}
                  </span>
                </span>

                <span class="font-medium truncate max-w-[120px]">{{ getMemberName(hid) }}</span>

                <TitanHoverCard
                  v-if="isTitanId(hid)"
                  :titan-id="hid"
                  :titan="getMemberSnapshot(hid)"
                  :inventory="cache.inventoryGet?.data"
                />
                <HeroHoverCard
                  v-else
                  :hero-id="hid"
                  :hero="getMemberSnapshot(hid)"
                  :inventory="cache.inventoryGet?.data"
                />
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              class="cursor-pointer text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
              @click="openEditTeam(team)"
            >
              Edit
            </button>
            <button
              type="button"
              class="cursor-pointer text-xs font-semibold text-red-600 dark:text-red-400 hover:underline px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              @click="deleteTeam(team.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
