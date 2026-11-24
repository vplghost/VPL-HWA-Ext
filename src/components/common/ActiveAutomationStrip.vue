<script setup lang="ts">
import { useActiveAutomations, type ActiveAutomationItem } from '@/src/composables/useActiveAutomations';
import { useModals } from '@/src/composables/useModals';

const { activeItems, stopAutomation } = useActiveAutomations();
const { openModal } = useModals();

function openItem(item: ActiveAutomationItem) {
  openModal(item.modalName);
}

function stopItem(item: ActiveAutomationItem, event: Event) {
  event.stopPropagation();
  void stopAutomation(item);
}
</script>

<template>
  <div
    v-if="activeItems.length > 0"
    id="active-automation-strip"
    role="region"
    aria-label="Active Automations"
    class="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 text-xs"
  >
    <span class="font-bold text-[11px] uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
      <span class="inline-block size-2 rounded-full bg-emerald-500 animate-pulse"></span>
      Active ({{ activeItems.length }})
    </span>

    <div class="flex flex-wrap items-center gap-1.5 flex-1">
      <div
        v-for="item in activeItems"
        :key="item.id"
        :id="`automation-pill-${item.id}`"
        role="button"
        tabindex="0"
        class="cursor-pointer inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border text-[11px] font-medium transition-colors"
        :class="
          item.statusTone === 'warning'
            ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
            : item.statusTone === 'waiting'
              ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
              : 'bg-white border-indigo-200 text-slate-800 hover:bg-indigo-100/60 dark:bg-slate-900 dark:border-indigo-800/80 dark:text-slate-100'
        "
        @click="openItem(item)"
        @keydown.enter="openItem(item)"
      >
        <span>{{ item.icon }}</span>
        <span>{{ item.label }}</span>
        <button
          :id="`btn-stop-automation-${item.id}`"
          type="button"
          :title="`Stop ${item.label}`"
          :aria-label="`Stop ${item.label}`"
          class="cursor-pointer ml-0.5 size-4 rounded-full inline-flex items-center justify-center bg-slate-200/80 hover:bg-rose-500 hover:text-white dark:bg-slate-800 dark:hover:bg-rose-600 text-[9px] transition-colors"
          @click="stopItem(item, $event)"
        >
          ⏹
        </button>
      </div>
    </div>
  </div>
</template>
