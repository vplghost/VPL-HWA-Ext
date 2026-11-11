<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

interface CustomTeam {
  id: string;
  name: string;
  heroIds: number[];
  maxTroops?: number;
}

const { cache } = useRpcCache();

const accountId = computed(() => cache.value.accountStatus?.data?.id);
const heroesData = computed(() => cache.value.heroGetAll?.data || {});

const customTeams = ref<CustomTeam[]>([]);
const isEditing = ref(false);
const editingTeamId = ref<string | null>(null);

const formName = ref('');
const formMaxTroops = ref<string>('');
const selectedHeroIds = ref<number[]>([]);
const heroSearch = ref('');
const formError = ref('');

async function loadTeams() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('customTeams');
      const accounts = stored.customTeams || {};
      if (accountId.value) {
        customTeams.value = accounts[String(accountId.value)] || [];
      } else {
        const firstKey = Object.keys(accounts)[0];
        customTeams.value = firstKey ? accounts[firstKey] : [];
      }
    } catch (_) {}
  }
}

onMounted(() => {
  loadTeams();
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

  const team: CustomTeam = {
    id: editingTeamId.value || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `team_${Date.now()}`),
    name: formName.value.trim(),
    heroIds: [...selectedHeroIds.value],
    maxTroops: formMaxTroops.value !== '' ? Math.max(1, parseInt(formMaxTroops.value, 10)) : undefined,
  };

  const next = [...customTeams.value.filter((t) => t.id !== team.id), team];
  customTeams.value = next;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('customTeams');
      const accounts = stored.customTeams || {};
      const key = String(accountId.value || 'default');
      accounts[key] = next;
      await chrome.storage.local.set({ customTeams: accounts });
    } catch (_) {}
  }

  isEditing.value = false;
  editingTeamId.value = null;
}

async function deleteTeam(id: string) {
  const next = customTeams.value.filter((t) => t.id !== id);
  customTeams.value = next;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get('customTeams');
      const accounts = stored.customTeams || {};
      const key = String(accountId.value || 'default');
      accounts[key] = next;
      await chrome.storage.local.set({ customTeams: accounts });
    } catch (_) {}
  }
}

function getHeroName(id: number): string {
  const meta = getHeroMetadata(String(id));
  return meta?.name || `Hero #${id}`;
}

function getTeamPower(heroIds: number[]): number {
  return heroIds.reduce((sum, id) => {
    const h = heroesData.value[String(id)];
    return sum + (Number(h?.power) || 0);
  }, 0);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header Card -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center justify-between">
      <div>
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>⚔️</span>
          <span>Custom Raid & Farm Teams</span>
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Preset hero lineups for Guild Raids, Solo Monster attacks, and Gathering marches.
        </p>
      </div>

      <button
        v-if="!isEditing"
        type="button"
        class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
        @click="openAddTeam"
      >
        <span>+ Add Team</span>
      </button>
    </div>

    <!-- Team Editor Form -->
    <div
      v-if="isEditing"
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
            Selected Lineup: <span class="font-bold text-blue-600 dark:text-blue-400">{{ selectedHeroIds.length }}/5</span>
          </span>
          <span v-if="selectedHeroIds.length > 0" class="text-slate-500 font-mono text-[11px]">
            Total Power: {{ formatNumber(getTeamPower(selectedHeroIds)) }}
          </span>
        </div>

        <div class="grid grid-cols-5 gap-2">
          <div
            v-for="idx in 5"
            :key="idx"
            class="h-14 rounded-lg border border-dashed flex flex-col items-center justify-center p-1 text-center transition-colors"
            :class="
              selectedHeroIds[idx - 1]
                ? 'border-blue-400 bg-blue-100/60 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-medium'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-xs'
            "
          >
            <template v-if="selectedHeroIds[idx - 1]">
              <span class="truncate w-full text-[11px] font-bold">
                {{ getHeroName(selectedHeroIds[idx - 1]) }}
              </span>
              <button
                type="button"
                class="cursor-pointer text-[10px] text-red-500 hover:text-red-700 mt-0.5"
                @click="toggleHero(selectedHeroIds[idx - 1])"
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
            class="cursor-pointer text-left flex items-center justify-between p-1.5 rounded-md text-xs transition-colors"
            :class="
              selectedHeroIds.includes(h.id)
                ? 'bg-blue-600 text-white font-semibold'
                : selectedHeroIds.length >= 5
                ? 'opacity-40 cursor-not-allowed text-slate-600 dark:text-slate-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
            "
            @click="toggleHero(h.id)"
          >
            <span class="truncate min-w-0 pr-1">{{ h.name }}</span>
            <span class="text-[10px] font-mono shrink-0 opacity-80">{{ formatNumber(h.power) }}</span>
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

    <!-- Custom Teams List -->
    <div v-if="customTeams.length === 0 && !isEditing" class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      No custom teams configured. Click "+ Add Team" to configure custom 5-hero lineups.
    </div>

    <div v-else class="space-y-2.5">
      <div
        v-for="team in customTeams"
        :key="team.id"
        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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

          <div class="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
            <span
              v-for="hid in team.heroIds"
              :key="hid"
              class="rounded bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] border border-slate-200 dark:border-slate-700"
            >
              {{ getHeroName(hid) }}
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
</template>
