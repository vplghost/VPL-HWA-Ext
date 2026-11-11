<script setup lang="ts">
import { computed } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const buildings = computed(() => {
  const data = cache.value.buildingStatus?.data || cache.value.clan_getSummary?.data?.buildings || {};
  if (Array.isArray(data)) {
    return data;
  }
  return Object.entries(data).map(([id, b]: [string, any]) => ({
    id,
    name: b.name || `Building #${id}`,
    level: b.level || 1,
    maxLevel: b.maxLevel || 30,
    status: b.status || 'Normal',
  }));
});

async function refreshBuildings() {
  await dispatchRpc([{ name: 'clan_getSummary' }]);
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    title="City Buildings & Upgrade Status"
    icon="🏗️"
    max-width="max-w-xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-3">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>Observed buildings in city</span>
        <button
          type="button"
          class="cursor-pointer text-indigo-600 dark:text-indigo-400 hover:underline"
          @click="refreshBuildings"
        >
          ↻ Refresh
        </button>
      </div>

      <div v-if="buildings.length === 0" class="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
        No city building snapshot observed yet.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          v-for="b in buildings"
          :key="b.id"
          class="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs"
        >
          <div class="flex items-center gap-2">
            <span class="text-base">🏛️</span>
            <div>
              <div class="font-semibold text-slate-800 dark:text-slate-200">{{ b.name }}</div>
              <div class="text-[10px] text-slate-400">ID: {{ b.id }}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
            Lv.{{ b.level }}
          </span>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
