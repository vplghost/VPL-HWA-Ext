<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import {
  isTopModal,
  registerModalOpen,
  registerModalClose,
  getModalStackLevel,
} from '@/src/composables/useModals';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  icon?: string;
  maxWidth?: string;
  stackLevel?: number;
  modalName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const modalId = computed(() => props.modalName || props.title || 'dialog');

function checkIsTop(): boolean {
  return isTopModal(modalId.value);
}

const computedZIndex = computed(() => {
  if (props.stackLevel != null) return props.stackLevel;
  return getModalStackLevel(modalId.value);
});

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    if (!checkIsTop()) return;
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      registerModalOpen(modalId.value);
      document.addEventListener('keydown', handleKeydown, props.stackLevel != null);
    } else {
      registerModalClose(modalId.value);
      document.removeEventListener('keydown', handleKeydown, props.stackLevel != null);
    }
  }
);

onUnmounted(() => {
  registerModalClose(modalId.value);
  document.removeEventListener('keydown', handleKeydown, props.stackLevel != null);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :style="{ zIndex: computedZIndex }"
      class="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"

    >
      <div
        class="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150"
        :class="maxWidth || 'max-w-2xl'"
      >
        <!-- Header -->
        <div class="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50">
          <div class="flex items-center gap-2">
            <span v-if="icon" class="text-lg">{{ icon }}</span>
            <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">
              {{ title }}
            </h3>
          </div>

          <button
            type="button"
            :aria-label="`Close ${title}`"
            class="cursor-pointer size-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 min-h-0 overflow-y-auto p-4 text-xs space-y-4">
          <slot />
        </div>

        <!-- Footer -->
        <div v-if="$slots.footer" class="shrink-0 border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/50 flex flex-wrap items-center justify-end gap-2">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
