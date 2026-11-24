<script setup lang="ts">
import { ref, computed } from 'vue';
import { getHeroMetadata } from '@/src/utils/metadata';

export interface PickerHeroItem {
  id: number;
  power?: number;
  level?: number;
  star?: number;
  favorite?: boolean;
}

export interface SavedTeamPreset {
  id: string;
  label: string;
  heroIds: number[];
}

const props = withDefaults(
  defineProps<{
    modelValue: number[];
    heroes: PickerHeroItem[];
    savedTeams?: SavedTeamPreset[];
    maxSize?: number;
    disabled?: boolean;
  }>(),
  {
    savedTeams: () => [],
    maxSize: 5,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
}>();

const searchQuery = ref('');
const roleFilter = ref<string>('all');

const heroMap = computed(() => {
  const map = new Map<number, PickerHeroItem>();
  for (const h of props.heroes || []) {
    if (Number.isFinite(Number(h?.id))) map.set(Number(h.id), h);
  }
  return map;
});

const selectedHeroes = computed(() =>
  (props.modelValue || []).map((id) => {
    const meta = getHeroMetadata(id);
    const live = heroMap.value.get(id);
    return {
      id,
      name: meta?.name || `Hero #${id}`,
      avatarFile: meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${id}.png` : ''),
      power: Number(live?.power || 0),
    };
  })
);

const totalPower = computed(() =>
  selectedHeroes.value.reduce((sum, h) => sum + (h.power || 0), 0)
);

const filteredHeroes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return [...(props.heroes || [])]
    .map((h) => {
      const meta = getHeroMetadata(h.id);
      return {
        ...h,
        name: meta?.name || `Hero #${h.id}`,
        role: meta?.class || meta?.role || '',
        avatarFile: meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${h.id}.png` : ''),
      };
    })
    .filter((h) => {
      if (roleFilter.value !== 'all' && h.role.toLowerCase() !== roleFilter.value) return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (Boolean(b.favorite) !== Boolean(a.favorite)) return b.favorite ? 1 : -1;
      return (Number(b.power) || 0) - (Number(a.power) || 0);
    });
});

function toggleHero(id: number) {
  if (props.disabled) return;
  const current = [...(props.modelValue || [])];
  const idx = current.indexOf(id);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else if (current.length < props.maxSize) {
    current.push(id);
  }
  emit('update:modelValue', current);
}

function applyPreset(event: Event) {
  const target = event.target as HTMLSelectElement;
  const preset = props.savedTeams.find((t) => t.id === target.value);
  if (preset) {
    emit('update:modelValue', preset.heroIds.slice(0, props.maxSize));
  }
}

function getAvatarUrl(file: string): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}
</script>

<template>
  <div class="space-y-2.5">
    <!-- Selected Squad Bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
      <div class="flex items-center gap-1.5 flex-wrap">
        <button
          v-for="h in selectedHeroes"
          :key="'sel-' + h.id"
          type="button"
          :disabled="disabled"
          :title="`Remove ${h.name}`"
          class="cursor-pointer relative size-9 rounded-lg overflow-hidden border-2 border-indigo-500 bg-slate-200 dark:bg-slate-800"
          @click="toggleHero(h.id)"
        >
          <img v-if="h.avatarFile" :src="getAvatarUrl(h.avatarFile)" :alt="h.name" class="size-full object-cover" />
          <span v-else class="text-[10px] font-bold">#{{ h.id }}</span>
        </button>
        <div
          v-for="n in Math.max(0, maxSize - selectedHeroes.length)"
          :key="'empty-' + n"
          class="size-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-400"
        >
          +
        </div>
      </div>

      <div class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
        Power: {{ totalPower.toLocaleString() }}
      </div>
    </div>

    <!-- Filters & Saved Presets -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search hero..."
        class="flex-1 min-w-[140px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs"
      />
      <select
        v-model="roleFilter"
        aria-label="Filter hero role"
        class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
      >
        <option value="all">All Roles</option>
        <option value="tank">Tank</option>
        <option value="warrior">Warrior</option>
        <option value="mage">Mage</option>
        <option value="marksman">Marksman</option>
        <option value="support">Support</option>
        <option value="control">Control</option>
      </select>
      <select
        v-if="savedTeams.length > 0"
        aria-label="Load saved team preset"
        class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
        @change="applyPreset"
      >
        <option value="">Load Preset...</option>
        <option v-for="team in savedTeams" :key="team.id" :value="team.id">{{ team.label }}</option>
      </select>
    </div>

    <!-- Hero Grid -->
    <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-1">
      <button
        v-for="h in filteredHeroes"
        :key="h.id"
        type="button"
        :disabled="disabled"
        class="cursor-pointer flex flex-col items-center p-1 rounded-lg border text-[10px] transition-all"
        :class="
          modelValue.includes(h.id)
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-500/40'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
        "
        @click="toggleHero(h.id)"
      >
        <div class="size-9 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
          <img v-if="h.avatarFile" :src="getAvatarUrl(h.avatarFile)" :alt="h.name" class="size-full object-cover" loading="lazy" />
        </div>
        <span class="mt-0.5 w-full truncate text-center font-medium">{{ h.name }}</span>
      </button>
    </div>
  </div>
</template>
