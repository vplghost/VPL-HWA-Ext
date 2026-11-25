<script setup lang="ts">
import { useActiveAutomations, type ActiveAutomationItem } from '@/src/composables/useActiveAutomations';
import { useModals } from '@/src/composables/useModals';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';

const { activeItems, stopAutomation } = useActiveAutomations();
const { openModal } = useModals();

function openItem(item: ActiveAutomationItem, event?: MouseEvent) {
  if (event?.altKey) {
    event.preventDefault();
    void stopAutomation(item);
    return;
  }
  openModal(item.modalName);
}

function stopItem(item: ActiveAutomationItem, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  void stopAutomation(item);
}

function formatTooltip(item: ActiveAutomationItem): string {
  const statusLabel =
    item.statusTone === 'warning'
      ? 'Warning'
      : item.statusTone === 'waiting'
        ? 'Waiting'
        : 'Running';
  return `${item.label}\nStatus: ${statusLabel}\nClick to open · Right-click or Alt+Click to stop`;
}

function getToneClasses(tone: ActiveAutomationItem['statusTone']): string {
  if (tone === 'warning') {
    return 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:border-rose-700/80 dark:text-rose-200 animate-pulse';
  }
  if (tone === 'waiting') {
    return 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:border-amber-700/80 dark:text-amber-200';
  }
  return 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-700/80 dark:text-emerald-200';
}
</script>

<template>
  <div
    v-if="activeItems.length > 0"
    id="active-automation-strip"
    role="region"
    aria-label="Active Automations"
    class="inline-flex items-center gap-1 pl-1.5 border-l border-slate-200 dark:border-slate-700/70"
  >
    <BaseTooltip
      v-for="item in activeItems"
      :key="item.id"
      :content="formatTooltip(item)"
    >
      <div
        :id="`automation-pill-${item.id}`"
        role="button"
        tabindex="0"
        :aria-label="item.label"
        class="group relative cursor-pointer inline-flex items-center justify-center size-7 rounded-lg border text-sm leading-none transition-all shadow-2xs select-none"
        :class="getToneClasses(item.statusTone)"
        @click="openItem(item, $event)"
        @contextmenu="stopItem(item, $event)"
        @keydown.enter="openItem(item)"
      >
        <span aria-hidden="true">{{ item.icon }}</span>

        <!-- Status indicator dot -->
        <span class="pointer-events-none absolute -top-0.5 -right-0.5 flex size-2">
          <span
            v-if="item.statusTone === 'active'"
            class="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"
          />
          <span
            class="relative inline-flex size-2 rounded-full ring-1 ring-white dark:ring-slate-900"
            :class="
              item.statusTone === 'warning'
                ? 'bg-rose-500'
                : item.statusTone === 'waiting'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            "
          />
        </span>

        <!-- Hover micro-stop button -->
        <button
          :id="`btn-stop-automation-${item.id}`"
          type="button"
          :title="`Stop ${item.label}`"
          :aria-label="`Stop ${item.label}`"
          class="cursor-pointer absolute -bottom-1 -right-1 size-3.5 rounded-full inline-flex items-center justify-center bg-slate-700 text-white hover:bg-rose-600 dark:bg-slate-600 dark:hover:bg-rose-500 text-[9px] font-bold leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-xs"
          @click="stopItem(item, $event)"
        >
          ×
        </button>
      </div>
    </BaseTooltip>
  </div>
</template>
