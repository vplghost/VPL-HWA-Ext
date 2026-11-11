<script setup lang="ts">
import { ref } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const mobLevel = ref(1);
const mobCount = ref(2);
const isRunning = ref(false);

async function startMonsterQueue() {
  isRunning.value = true;
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: 'monster-queue-start',
      options: {
        level: mobLevel.value,
        count: mobCount.value,
      },
    });
  }
}

async function stopMonsterQueue() {
  isRunning.value = false;
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'monster-queue-stop' });
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Solo Monster Attack Queue"
    icon="👹"
    max-width="max-w-md"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-3">
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Dispatches individual squad attacks against wild monsters sequentially, automatically halting on a loss.
      </p>

      <div class="grid grid-cols-2 gap-3">
        <!-- Monster Level -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Monster Level
          </label>
          <input
            v-model.number="mobLevel"
            type="number"
            min="1"
            max="30"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          />
        </div>

        <!-- Attack Count -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Attack Count
          </label>
          <input
            v-model.number="mobCount"
            type="number"
            min="1"
            max="50"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <button
        v-if="!isRunning"
        type="button"
        class="cursor-pointer px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-colors"
        @click="startMonsterQueue"
      >
        Start Monster Queue
      </button>
      <button
        v-else
        type="button"
        class="cursor-pointer px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors animate-pulse"
        @click="stopMonsterQueue"
      >
        Stop Monster Queue
      </button>
    </template>
  </ModalDialog>
</template>
