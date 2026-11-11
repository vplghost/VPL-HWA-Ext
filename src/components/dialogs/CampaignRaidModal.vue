<script setup lang="ts">
import { ref, computed } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const missionId = ref(1);
const raidCount = ref(10);
const raidResults = ref<any[]>([]);
const isRaidRunning = ref(false);

async function executeRaid(times: number) {
  isRaidRunning.value = true;
  try {
    const res = await dispatchRpc([
      {
        name: 'mission_raid',
        args: { missionId: missionId.value, times },
        feature: 'campaign',
      },
      { name: 'inventoryGet' },
    ]);
    if (res?.data?.drops) {
      raidResults.value = res.data.drops;
    }
  } finally {
    isRaidRunning.value = false;
  }
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="Campaign Mission Raid & Equipment Farm"
    icon="🗺️"
    max-width="max-w-xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4">
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Raid campaign story missions directly to farm gear components and hero soul stones.
      </p>

      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-xs">
          <span class="text-slate-500 dark:text-slate-400 font-medium">Mission ID:</span>
          <input
            v-model.number="missionId"
            type="number"
            min="1"
            max="200"
            class="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-hidden"
          />
        </label>

        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="isRaidRunning"
            class="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-50"
            @click="executeRaid(1)"
          >
            Raid 1x (6⚡)
          </button>
          <button
            type="button"
            :disabled="isRaidRunning"
            class="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-50"
            @click="executeRaid(10)"
          >
            Raid 10x (60⚡)
          </button>
        </div>
      </div>

      <!-- Raid Results -->
      <div v-if="raidResults.length > 0" class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">
          Raid Loot Results
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div
            v-for="(drop, idx) in raidResults"
            :key="idx"
            class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2 text-xs"
          >
            <span class="text-base">📦</span>
            <div class="min-w-0">
              <div class="font-semibold text-slate-800 dark:text-slate-200 truncate">{{ drop.name || `Item #${drop.id}` }}</div>
              <div class="text-[10px] text-slate-400 font-mono">x{{ drop.amount }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
