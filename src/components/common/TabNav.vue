<script setup lang="ts">
interface TabItem {
  id: string;
  label: string;
  icon: string;
  badge?: number | string;
}

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const tabs: TabItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'heroes', label: 'Heroes', icon: '🦸' },
  { id: 'titans', label: 'Titans', icon: '🗿' },
  { id: 'items', label: 'Items', icon: '🎒' },
  { id: 'gathering', label: 'Gathering', icon: '⛏️' },
  { id: 'dungeon', label: 'Dungeon', icon: '🏰' },
  { id: 'tower', label: 'Tower', icon: '🗼' },
  { id: 'quests', label: 'Quests', icon: '📜' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'log', label: 'Log', icon: '📝' },
];

function selectTab(id: string) {
  emit('update:modelValue', id);
}
</script>

<template>
  <nav class="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-0.5 text-xs scrollbar-none">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      class="cursor-pointer flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-1.5 font-medium transition-colors"
      :class="
        modelValue === t.id
          ? 'border-b-2 border-indigo-600 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
      "
      @click="selectTab(t.id)"
    >
      <span>{{ t.icon }}</span>
      <span>{{ t.label }}</span>
      <span
        v-if="t.badge"
        class="ml-0.5 rounded-full bg-indigo-600 dark:bg-indigo-500 px-1.5 py-0.2 text-[9px] font-bold text-white"
      >
        {{ t.badge }}
      </span>
    </button>
  </nav>
</template>
