<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache } = useRpcCache();

const bossLevel = ref(1);
const waitSeconds = ref(300);
const minMembers = ref(4);
const raidCount = ref(2);
const autoCancel = ref(true);
const isRunning = ref(false);

async function startRaidQueue() {
  isRunning.value = true;
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      kind: 'raid-queue-start',
      options: {
        level: bossLevel.value,
        waitSeconds: waitSeconds.value,
        minMembers: minMembers.value,
        count: raidCount.value,
        autoCancel: autoCancel.value,
      },
    });
  }
}

async function stopRaidQueue() {
  isRunning.value = false;
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ kind: 'raid-queue-stop' });
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Guild Boss Raid Queue"
    icon="⚔️"
    max-width="max-w-lg"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-3">
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Automatically searches for nearby world boss mobs, initiates guild rally marches, and manages queue rounds.
      </p>

      <div class="grid grid-cols-2 gap-3">
        <!-- Boss Level -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Boss Level
          </label>
          <input
            v-model.number="bossLevel"
            type="number"
            min="1"
            max="30"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          />
        </div>

        <!-- Raid Count -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Raid Count
          </label>
          <input
            v-model.number="raidCount"
            type="number"
            min="1"
            max="50"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          />
        </div>

        <!-- Wait Seconds -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Rally Wait Time
          </label>
          <select
            v-model.number="waitSeconds"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          >
            <option :value="60">1 minute (60s)</option>
            <option :value="300">5 minutes (300s)</option>
            <option :value="600">10 minutes (600s)</option>
          </select>
        </div>

        <!-- Minimum Members -->
        <div>
          <label class="block text-slate-500 dark:text-slate-400 font-medium mb-1">
            Min Members
          </label>
          <input
            v-model.number="minMembers"
            type="number"
            min="1"
            max="6"
            class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          />
        </div>
      </div>

      <!-- Auto Cancel -->
      <label class="flex items-center gap-2 cursor-pointer pt-1">
        <input
          v-model="autoCancel"
          type="checkbox"
          class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span class="text-slate-700 dark:text-slate-300 font-medium">
          Auto-cancel rally in last 10 seconds if squad members &lt; {{ minMembers }}
        </span>
      </label>
    </div>

    <template #footer>
      <button
        v-if="!isRunning"
        type="button"
        class="cursor-pointer px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        @click="startRaidQueue"
      >
        Start Raid Queue
      </button>
      <button
        v-else
        type="button"
        class="cursor-pointer px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors animate-pulse"
        @click="stopRaidQueue"
      >
        Stop Raid Queue
      </button>
    </template>
  </ModalDialog>
</template>
