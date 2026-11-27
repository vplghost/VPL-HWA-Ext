<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  type CommandPaletteItem,
} from '@/src/utils/commandPalette';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'select-tab', tabId: string): void;
}>();

const { cache } = useRpcCache();
const { openModal } = useModals();

const query = ref('');
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const allItems = computed(() => buildCommandPaletteItems(cache.value));
const filteredItems = computed(() => filterCommandPaletteItems(allItems.value, query.value, 14));

watch(filteredItems, () => {
  activeIndex.value = 0;
});

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      query.value = '';
      activeIndex.value = 0;
      await nextTick();
      inputRef.value?.focus();
    }
  }
);

function close() {
  emit('update:modelValue', false);
}

function executeItem(item: CommandPaletteItem) {
  close();
  if (item.category === 'tab' && item.tabId) {
    emit('select-tab', item.tabId);
  } else if (item.category === 'hero' && item.hero) {
    openModal('hero', { selectedHero: item.hero });
  } else if (item.modalName) {
    openModal(item.modalName);
  }
}

function handleInputKeydown(e: KeyboardEvent) {
  const len = filteredItems.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (len > 0) activeIndex.value = (activeIndex.value + 1) % len;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (len > 0) activeIndex.value = (activeIndex.value - 1 + len) % len;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const chosen = filteredItems.value[activeIndex.value];
    if (chosen) executeItem(chosen);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    emit('update:modelValue', !props.modelValue);
  } else if (e.key === 'Escape' && props.modelValue) {
    e.preventDefault();
    close();
  }
}

function categoryBadge(cat: CommandPaletteItem['category']): string {
  if (cat === 'tab') return 'Tab';
  if (cat === 'hero') return 'Hero';
  return 'Dialog';
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="command-palette-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Command Palette"
      class="fixed inset-0 z-[110] flex items-start justify-center bg-slate-900/60 pt-16 px-3 backdrop-blur-xs"
      @click.self="close"
    >
      <div class="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <!-- Search Input -->
        <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
          <span class="text-slate-400 text-sm select-none">🔍</span>
          <input
            id="command-palette-input"
            ref="inputRef"
            v-model="query"
            type="text"
            autocomplete="off"
            placeholder="Jump to tab, dialog, or hero... (Type to filter)"
            class="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            @keydown="handleInputKeydown"
          />
          <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-500">
            ESC
          </kbd>
        </div>

        <!-- Results List -->
        <div class="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          <button
            v-for="(item, idx) in filteredItems"
            :key="item.id"
            type="button"
            class="w-full cursor-pointer flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs transition-colors"
            :class="
              idx === activeIndex
                ? 'bg-indigo-600 text-white'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            "
            @mouseenter="activeIndex = idx"
            @click="executeItem(item)"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-base shrink-0">{{ item.icon }}</span>
              <div class="min-w-0">
                <div class="font-semibold truncate">{{ item.label }}</div>
                <div
                  class="text-[10px] truncate"
                  :class="idx === activeIndex ? 'text-indigo-100' : 'text-slate-400'"
                >
                  {{ item.subtitle }}
                </div>
              </div>
            </div>
            <span
              class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
              :class="
                idx === activeIndex
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              "
            >
              {{ categoryBadge(item.category) }}
            </span>
          </button>

          <div v-if="filteredItems.length === 0" class="py-8 text-center text-xs text-slate-400">
            No matching tabs, dialogs, or heroes.
          </div>
        </div>

        <!-- Footer Hint -->
        <div class="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-3.5 py-1.5 text-[10px] text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
          <span>↑↓ Navigate · Enter Open</span>
          <span>Ctrl+K Toggle</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
